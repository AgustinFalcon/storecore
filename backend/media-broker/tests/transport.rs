use rustix::net::{
    AddressFamily, Protocol, RecvFlags, SendAncillaryBuffer, SendAncillaryMessage, SendFlags,
    SocketFlags, SocketType, send, sendmsg, socketpair,
};
use rustix::process::{getgid, getuid};
use std::fs::File;
use std::io::{IoSlice, Read};
use std::mem::MaybeUninit;
use std::os::fd::AsFd;
use storecore_media_broker::protocol::{BrokerOperation, BrokerRequest};
use storecore_media_broker::transport::{
    ExpectedPeer, TransportError, receive_request, send_request,
};

#[test]
fn authentic_peer_can_send_exactly_one_descriptor() {
    let (client, broker) = sockets();
    let source = File::open("vectors/v1.properties").expect("open fixture");
    let request = request();

    send_request(&client, request, source.as_fd()).expect("send request");
    let received = receive_request(&broker, current_peer()).expect("receive request");

    assert_eq!(received.request(), request);
    let duplicate = rustix::io::dup(received.input()).expect("duplicate received descriptor");
    let mut received_file = File::from(duplicate);
    let mut prefix = [0_u8; 7];
    received_file
        .read_exact(&mut prefix)
        .expect("read descriptor");
    assert_eq!(&prefix, b"request");
}

#[test]
fn request_without_descriptor_is_rejected() {
    let (client, broker) = sockets();
    let bytes = request().encode();
    assert_eq!(
        send(&client, &bytes, SendFlags::NOSIGNAL).expect("send frame"),
        bytes.len()
    );

    assert_eq!(
        receive_request(&broker, current_peer()).map(|_| ()),
        Err(TransportError::MissingFileDescriptor)
    );
}

#[test]
fn request_with_multiple_descriptors_is_rejected() {
    let (client, broker) = sockets();
    let first = File::open("vectors/v1.properties").expect("open first fixture");
    let second = File::open("vectors/v1.properties").expect("open second fixture");
    let bytes = request().encode();
    let slices = [IoSlice::new(&bytes)];
    let descriptors = [first.as_fd(), second.as_fd()];
    let mut space = [MaybeUninit::uninit(); rustix::cmsg_space!(ScmRights(2))];
    let mut ancillary = SendAncillaryBuffer::new(&mut space);
    assert!(ancillary.push(SendAncillaryMessage::ScmRights(&descriptors)));
    assert_eq!(
        sendmsg(&client, &slices, &mut ancillary, SendFlags::NOSIGNAL).expect("send frame"),
        bytes.len()
    );

    assert_eq!(
        receive_request(&broker, current_peer()).map(|_| ()),
        Err(TransportError::ExcessFileDescriptors)
    );
}

#[test]
fn unexpected_peer_identity_is_rejected_before_the_frame_is_consumed() {
    let (client, broker) = sockets();
    let source = File::open("vectors/v1.properties").expect("open fixture");
    send_request(&client, request(), source.as_fd()).expect("send request");
    let denied_uid = getuid()
        .as_raw()
        .checked_add(1)
        .expect("test uid can increment");

    assert_eq!(
        receive_request(&broker, ExpectedPeer::create(denied_uid, getgid().as_raw())).map(|_| ()),
        Err(TransportError::PeerDenied)
    );

    let mut frame = [0_u8; 72];
    let (initialized, received) =
        rustix::net::recv(&broker, &mut frame, RecvFlags::empty()).expect("frame remains queued");
    assert_eq!(initialized, frame.len());
    assert_eq!(received, frame.len());
}

fn sockets() -> (rustix::fd::OwnedFd, rustix::fd::OwnedFd) {
    socketpair(
        AddressFamily::UNIX,
        SocketType::SEQPACKET,
        SocketFlags::CLOEXEC,
        None::<Protocol>,
    )
    .expect("create socket pair")
}

fn current_peer() -> ExpectedPeer {
    ExpectedPeer::create(getuid().as_raw(), getgid().as_raw())
}

fn request() -> BrokerRequest {
    BrokerRequest::create(BrokerOperation::SealInput, [7; 16], 1, [9; 32], 5)
        .expect("valid request")
}
