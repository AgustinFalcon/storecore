use crate::protocol::{BrokerRequest, BrokerResponse, REQUEST_LENGTH, RESPONSE_LENGTH};
use rustix::fd::OwnedFd;
use rustix::net::sockopt::socket_peercred;
use rustix::net::{
    RecvAncillaryBuffer, RecvAncillaryMessage, RecvFlags, ReturnFlags, SendAncillaryBuffer,
    SendAncillaryMessage, SendFlags, recv, recvmsg, send, sendmsg,
};
use std::io::{IoSlice, IoSliceMut};
use std::mem::MaybeUninit;
use std::os::fd::{AsFd, BorrowedFd};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct ExpectedPeer {
    uid: u32,
    gid: u32,
}

impl ExpectedPeer {
    #[must_use]
    pub const fn create(uid: u32, gid: u32) -> Self {
        Self { uid, gid }
    }
}

#[derive(Debug, Eq, PartialEq)]
pub enum TransportError {
    Io,
    PeerDenied,
    Truncated,
    InvalidFrame,
    MissingFileDescriptor,
    ExcessFileDescriptors,
    UnexpectedAncillary,
    PartialWrite,
}

pub struct ReceivedRequest {
    request: BrokerRequest,
    input: OwnedFd,
}

impl ReceivedRequest {
    #[must_use]
    pub const fn request(&self) -> BrokerRequest {
        self.request
    }
    #[must_use]
    pub fn input(&self) -> BorrowedFd<'_> {
        self.input.as_fd()
    }
}

/// Sends one request and exactly one input descriptor.
///
/// # Errors
///
/// Returns [`TransportError`] for ancillary-buffer, socket or partial-write
/// failures.
pub fn send_request<Fd: AsFd>(
    socket: Fd,
    request: BrokerRequest,
    input: BorrowedFd<'_>,
) -> Result<(), TransportError> {
    let bytes = request.encode();
    let slices = [IoSlice::new(&bytes)];
    let descriptors = [input];
    let mut space = [MaybeUninit::uninit(); rustix::cmsg_space!(ScmRights(1))];
    let mut ancillary = SendAncillaryBuffer::new(&mut space);
    if !ancillary.push(SendAncillaryMessage::ScmRights(&descriptors)) {
        return Err(TransportError::ExcessFileDescriptors);
    }
    let written = sendmsg(socket, &slices, &mut ancillary, SendFlags::NOSIGNAL)
        .map_err(|_| TransportError::Io)?;
    if written != REQUEST_LENGTH {
        return Err(TransportError::PartialWrite);
    }
    Ok(())
}

/// Authenticates the Unix peer and receives one request plus one descriptor.
///
/// # Errors
///
/// Returns [`TransportError`] when peer credentials do not match, the frame is
/// malformed or truncated, ancillary data is unexpected, or the descriptor
/// cardinality is not exactly one.
pub fn receive_request<Fd: AsFd>(
    socket: Fd,
    expected: ExpectedPeer,
) -> Result<ReceivedRequest, TransportError> {
    let peer = socket_peercred(socket.as_fd()).map_err(|_| TransportError::Io)?;
    if peer.uid.as_raw() != expected.uid || peer.gid.as_raw() != expected.gid {
        return Err(TransportError::PeerDenied);
    }

    let mut payload = [0_u8; REQUEST_LENGTH + 1];
    let mut slices = [IoSliceMut::new(&mut payload)];
    let mut space = [MaybeUninit::uninit(); rustix::cmsg_space!(ScmRights(2))];
    let mut ancillary = RecvAncillaryBuffer::new(&mut space);
    let received = recvmsg(socket, &mut slices, &mut ancillary, RecvFlags::CMSG_CLOEXEC)
        .map_err(|_| TransportError::Io)?;
    if received
        .flags
        .intersects(ReturnFlags::TRUNC | ReturnFlags::CTRUNC)
    {
        return Err(TransportError::Truncated);
    }
    if received.bytes != REQUEST_LENGTH {
        return Err(TransportError::InvalidFrame);
    }

    let mut descriptors = Vec::with_capacity(2);
    let mut unexpected = false;
    for message in ancillary.drain() {
        match message {
            RecvAncillaryMessage::ScmRights(received_fds) => descriptors.extend(received_fds),
            _ => unexpected = true,
        }
    }
    if unexpected {
        return Err(TransportError::UnexpectedAncillary);
    }
    if descriptors.is_empty() {
        return Err(TransportError::MissingFileDescriptor);
    }
    if descriptors.len() != 1 {
        return Err(TransportError::ExcessFileDescriptors);
    }
    let Some(input) = descriptors.pop() else {
        return Err(TransportError::MissingFileDescriptor);
    };
    let request = BrokerRequest::decode(&payload[..REQUEST_LENGTH])
        .map_err(|_| TransportError::InvalidFrame)?;
    Ok(ReceivedRequest { request, input })
}

/// Sends one fixed-size response frame.
///
/// # Errors
///
/// Returns [`TransportError`] for socket or partial-write failures.
pub fn send_response<Fd: AsFd>(socket: Fd, response: BrokerResponse) -> Result<(), TransportError> {
    let bytes = response.encode();
    let written = send(socket, &bytes, SendFlags::NOSIGNAL).map_err(|_| TransportError::Io)?;
    if written != RESPONSE_LENGTH {
        return Err(TransportError::PartialWrite);
    }
    Ok(())
}

/// Receives and decodes one fixed-size response frame.
///
/// # Errors
///
/// Returns [`TransportError`] for socket, framing or protocol failures.
pub fn receive_response<Fd: AsFd>(socket: Fd) -> Result<BrokerResponse, TransportError> {
    let mut bytes = [0_u8; RESPONSE_LENGTH + 1];
    let (initialized, received) =
        recv(socket, &mut bytes, RecvFlags::empty()).map_err(|_| TransportError::Io)?;
    if initialized != RESPONSE_LENGTH || received != RESPONSE_LENGTH {
        return Err(TransportError::InvalidFrame);
    }
    BrokerResponse::decode(&bytes[..RESPONSE_LENGTH]).map_err(|_| TransportError::InvalidFrame)
}
