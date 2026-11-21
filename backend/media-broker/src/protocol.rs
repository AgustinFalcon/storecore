pub const REQUEST_LENGTH: usize = 72;
pub const RESPONSE_LENGTH: usize = 32;
pub const MAX_INPUT_BYTES: u64 = 10 * 1024 * 1024;
pub const MAX_REVISION: u64 = i64::MAX as u64;

const REQUEST_MAGIC: [u8; 4] = *b"SCMB";
const RESPONSE_MAGIC: [u8; 4] = *b"SCMR";
const VERSION: u16 = 1;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum BrokerOperation {
    SealInput,
    AckOutput,
    ClaimOutput,
    Unknown,
}

impl BrokerOperation {
    #[must_use]
    pub const fn from_wire(raw: u8) -> Self {
        match raw {
            1 => Self::SealInput,
            2 => Self::AckOutput,
            3 => Self::ClaimOutput,
            _ => Self::Unknown,
        }
    }

    const fn to_wire(self) -> u8 {
        match self {
            Self::SealInput => 1,
            Self::AckOutput => 2,
            Self::ClaimOutput => 3,
            Self::Unknown => 0,
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum BrokerResult {
    SnapshotAccepted,
    Rejected,
    PeerDenied,
    StaleRevision,
    AckAccepted,
    ArtifactReady,
    Unknown,
}

impl BrokerResult {
    #[must_use]
    pub const fn from_wire(raw: u8) -> Self {
        match raw {
            1 => Self::SnapshotAccepted,
            2 => Self::Rejected,
            3 => Self::PeerDenied,
            4 => Self::StaleRevision,
            5 => Self::AckAccepted,
            6 => Self::ArtifactReady,
            _ => Self::Unknown,
        }
    }

    const fn to_wire(self) -> u8 {
        match self {
            Self::SnapshotAccepted => 1,
            Self::Rejected => 2,
            Self::PeerDenied => 3,
            Self::StaleRevision => 4,
            Self::AckAccepted => 5,
            Self::ArtifactReady => 6,
            Self::Unknown => 0,
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ProtocolError {
    InvalidLength,
    InvalidMagic,
    UnsupportedVersion,
    UnknownOperation,
    UnknownResult,
    InvalidReservedByte,
    InvalidRevision,
    InvalidSize,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct BrokerRequest {
    operation: BrokerOperation,
    job_id: [u8; 16],
    revision: u64,
    digest: [u8; 32],
    size: u64,
}

impl BrokerRequest {
    #[must_use]
    pub const fn create(
        operation: BrokerOperation,
        job_id: [u8; 16],
        revision: u64,
        digest: [u8; 32],
        size: u64,
    ) -> Option<Self> {
        if matches!(operation, BrokerOperation::Unknown)
            || revision == 0
            || revision > MAX_REVISION
            || size == 0
            || size > MAX_INPUT_BYTES
        {
            return None;
        }
        Some(Self {
            operation,
            job_id,
            revision,
            digest,
            size,
        })
    }

    #[must_use]
    pub const fn operation(self) -> BrokerOperation {
        self.operation
    }
    #[must_use]
    pub const fn job_id(self) -> [u8; 16] {
        self.job_id
    }
    #[must_use]
    pub const fn revision(self) -> u64 {
        self.revision
    }
    #[must_use]
    pub const fn digest(self) -> [u8; 32] {
        self.digest
    }
    #[must_use]
    pub const fn size(self) -> u64 {
        self.size
    }

    #[must_use]
    pub fn encode(self) -> [u8; REQUEST_LENGTH] {
        let mut bytes = [0_u8; REQUEST_LENGTH];
        bytes[0..4].copy_from_slice(&REQUEST_MAGIC);
        bytes[4..6].copy_from_slice(&VERSION.to_be_bytes());
        bytes[6] = self.operation.to_wire();
        bytes[7] = 0;
        bytes[8..24].copy_from_slice(&self.job_id);
        bytes[24..32].copy_from_slice(&self.revision.to_be_bytes());
        bytes[32..64].copy_from_slice(&self.digest);
        bytes[64..72].copy_from_slice(&self.size.to_be_bytes());
        bytes
    }

    /// Decodes one complete protocol-v1 request.
    ///
    /// # Errors
    ///
    /// Returns a closed [`ProtocolError`] when the frame is malformed or contains
    /// a value that protocol v1 does not recognize.
    pub fn decode(bytes: &[u8]) -> Result<Self, ProtocolError> {
        if bytes.len() != REQUEST_LENGTH {
            return Err(ProtocolError::InvalidLength);
        }
        if bytes[0..4] != REQUEST_MAGIC {
            return Err(ProtocolError::InvalidMagic);
        }
        if u16::from_be_bytes([bytes[4], bytes[5]]) != VERSION {
            return Err(ProtocolError::UnsupportedVersion);
        }
        if bytes[7] != 0 {
            return Err(ProtocolError::InvalidReservedByte);
        }
        let operation = BrokerOperation::from_wire(bytes[6]);
        if operation == BrokerOperation::Unknown {
            return Err(ProtocolError::UnknownOperation);
        }
        let mut job_id = [0_u8; 16];
        job_id.copy_from_slice(&bytes[8..24]);
        let mut revision_bytes = [0_u8; 8];
        revision_bytes.copy_from_slice(&bytes[24..32]);
        let revision = u64::from_be_bytes(revision_bytes);
        let mut digest = [0_u8; 32];
        digest.copy_from_slice(&bytes[32..64]);
        let mut size_bytes = [0_u8; 8];
        size_bytes.copy_from_slice(&bytes[64..72]);
        let size = u64::from_be_bytes(size_bytes);
        Self::create(operation, job_id, revision, digest, size).ok_or({
            if revision == 0 || revision > MAX_REVISION {
                ProtocolError::InvalidRevision
            } else {
                ProtocolError::InvalidSize
            }
        })
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct BrokerResponse {
    result: BrokerResult,
    job_id: [u8; 16],
    revision: u64,
}

impl BrokerResponse {
    #[must_use]
    pub const fn create(result: BrokerResult, job_id: [u8; 16], revision: u64) -> Option<Self> {
        if matches!(result, BrokerResult::Unknown) || revision == 0 || revision > MAX_REVISION {
            return None;
        }
        Some(Self {
            result,
            job_id,
            revision,
        })
    }

    #[must_use]
    pub const fn result(self) -> BrokerResult {
        self.result
    }
    #[must_use]
    pub const fn job_id(self) -> [u8; 16] {
        self.job_id
    }
    #[must_use]
    pub const fn revision(self) -> u64 {
        self.revision
    }

    #[must_use]
    pub fn encode(self) -> [u8; RESPONSE_LENGTH] {
        let mut bytes = [0_u8; RESPONSE_LENGTH];
        bytes[0..4].copy_from_slice(&RESPONSE_MAGIC);
        bytes[4..6].copy_from_slice(&VERSION.to_be_bytes());
        bytes[6] = self.result.to_wire();
        bytes[7] = 0;
        bytes[8..24].copy_from_slice(&self.job_id);
        bytes[24..32].copy_from_slice(&self.revision.to_be_bytes());
        bytes
    }

    /// Decodes one complete protocol-v1 response.
    ///
    /// # Errors
    ///
    /// Returns a closed [`ProtocolError`] when the frame is malformed or contains
    /// a value that protocol v1 does not recognize.
    pub fn decode(bytes: &[u8]) -> Result<Self, ProtocolError> {
        if bytes.len() != RESPONSE_LENGTH {
            return Err(ProtocolError::InvalidLength);
        }
        if bytes[0..4] != RESPONSE_MAGIC {
            return Err(ProtocolError::InvalidMagic);
        }
        if u16::from_be_bytes([bytes[4], bytes[5]]) != VERSION {
            return Err(ProtocolError::UnsupportedVersion);
        }
        if bytes[7] != 0 {
            return Err(ProtocolError::InvalidReservedByte);
        }
        let result = BrokerResult::from_wire(bytes[6]);
        if result == BrokerResult::Unknown {
            return Err(ProtocolError::UnknownResult);
        }
        let mut job_id = [0_u8; 16];
        job_id.copy_from_slice(&bytes[8..24]);
        let mut revision_bytes = [0_u8; 8];
        revision_bytes.copy_from_slice(&bytes[24..32]);
        let revision = u64::from_be_bytes(revision_bytes);
        Self::create(result, job_id, revision).ok_or(ProtocolError::InvalidRevision)
    }
}
