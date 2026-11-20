use crate::protocol::MAX_REVISION;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum JobState {
    Allocated,
    InputSealed,
    Starting,
    Running,
    Terminating,
    Terminal,
    Quarantined,
    Unknown,
}

impl JobState {
    #[must_use]
    pub const fn from_wire(raw: u8) -> Self {
        match raw {
            1 => Self::Allocated,
            2 => Self::InputSealed,
            3 => Self::Starting,
            4 => Self::Running,
            5 => Self::Terminating,
            6 => Self::Terminal,
            7 => Self::Quarantined,
            _ => Self::Unknown,
        }
    }

    #[must_use]
    pub const fn to_wire(self) -> u8 {
        match self {
            Self::Allocated => 1,
            Self::InputSealed => 2,
            Self::Starting => 3,
            Self::Running => 4,
            Self::Terminating => 5,
            Self::Terminal => 6,
            Self::Quarantined => 7,
            Self::Unknown => 0,
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum DurableOperation {
    Allocate,
    Seal,
    Start,
    Terminate,
    Inspect,
    Acknowledge,
    Quarantine,
    Unknown,
}

impl DurableOperation {
    #[must_use]
    pub const fn from_wire(raw: u8) -> Self {
        match raw {
            1 => Self::Allocate,
            2 => Self::Seal,
            3 => Self::Start,
            4 => Self::Terminate,
            5 => Self::Inspect,
            6 => Self::Acknowledge,
            7 => Self::Quarantine,
            _ => Self::Unknown,
        }
    }

    #[must_use]
    pub const fn to_wire(self) -> u8 {
        match self {
            Self::Allocate => 1,
            Self::Seal => 2,
            Self::Start => 3,
            Self::Terminate => 4,
            Self::Inspect => 5,
            Self::Acknowledge => 6,
            Self::Quarantine => 7,
            Self::Unknown => 0,
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum IsolationProfile {
    ImageIoV1,
    Unknown,
}

impl IsolationProfile {
    #[must_use]
    pub const fn from_wire(raw: u8) -> Self {
        match raw {
            1 => Self::ImageIoV1,
            _ => Self::Unknown,
        }
    }

    #[must_use]
    pub const fn to_wire(self) -> u8 {
        match self {
            Self::ImageIoV1 => 1,
            Self::Unknown => 0,
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum Admission {
    Open,
    Closed,
    Unknown,
}

impl Admission {
    #[must_use]
    pub const fn from_wire(raw: u8) -> Self {
        match raw {
            1 => Self::Open,
            2 => Self::Closed,
            _ => Self::Unknown,
        }
    }

    #[must_use]
    pub const fn to_wire(self) -> u8 {
        match self {
            Self::Open => 1,
            Self::Closed => 2,
            Self::Unknown => 0,
        }
    }

    #[must_use]
    pub const fn allows_allocate(self) -> bool {
        matches!(self, Self::Open)
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct Principal {
    uid: u32,
    gid: u32,
}

impl Principal {
    #[must_use]
    pub const fn create(uid: u32, gid: u32) -> Self {
        Self { uid, gid }
    }

    #[must_use]
    pub const fn uid(self) -> u32 {
        self.uid
    }

    #[must_use]
    pub const fn gid(self) -> u32 {
        self.gid
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct JobRecord {
    operation: DurableOperation,
    state: JobState,
    job_id: [u8; 16],
    revision: u64,
    principal: Principal,
    boot_id: [u8; 16],
    profile: IsolationProfile,
    acknowledged: bool,
    bytes: u64,
    inodes: u64,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct DurableIntent {
    operation: DurableOperation,
    job_id: [u8; 16],
    expected_revision: u64,
    principal: Principal,
    profile: IsolationProfile,
    bytes: u64,
    inodes: u64,
}

impl DurableIntent {
    #[must_use]
    pub const fn create(
        operation: DurableOperation,
        job_id: [u8; 16],
        expected_revision: u64,
        principal: Principal,
        profile: IsolationProfile,
        bytes: u64,
        inodes: u64,
    ) -> Option<Self> {
        if matches!(operation, DurableOperation::Unknown)
            || matches!(profile, IsolationProfile::Unknown)
            || bytes == 0
            || inodes == 0
        {
            None
        } else {
            Some(Self {
                operation,
                job_id,
                expected_revision,
                principal,
                profile,
                bytes,
                inodes,
            })
        }
    }

    #[must_use]
    pub const fn operation(self) -> DurableOperation {
        self.operation
    }
    #[must_use]
    pub const fn job_id(self) -> [u8; 16] {
        self.job_id
    }
    #[must_use]
    pub const fn expected_revision(self) -> u64 {
        self.expected_revision
    }
    #[must_use]
    pub const fn principal(self) -> Principal {
        self.principal
    }
    #[must_use]
    pub const fn profile(self) -> IsolationProfile {
        self.profile
    }
    #[must_use]
    pub const fn bytes(self) -> u64 {
        self.bytes
    }
    #[must_use]
    pub const fn inodes(self) -> u64 {
        self.inodes
    }
}

impl JobRecord {
    #[must_use]
    pub const fn create(
        operation: DurableOperation,
        state: JobState,
        job_id: [u8; 16],
        revision: u64,
        principal: Principal,
        boot_id: [u8; 16],
        profile: IsolationProfile,
        acknowledged: bool,
        bytes: u64,
        inodes: u64,
    ) -> Option<Self> {
        if matches!(
            operation,
            DurableOperation::Unknown | DurableOperation::Inspect
        ) || matches!(state, JobState::Unknown)
            || matches!(profile, IsolationProfile::Unknown)
            || revision == 0
            || revision > MAX_REVISION
            || bytes == 0
            || inodes == 0
        {
            return None;
        }
        Some(Self {
            operation,
            state,
            job_id,
            revision,
            principal,
            boot_id,
            profile,
            acknowledged,
            bytes,
            inodes,
        })
    }

    #[must_use]
    pub const fn operation(self) -> DurableOperation {
        self.operation
    }
    #[must_use]
    pub const fn state(self) -> JobState {
        self.state
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
    pub const fn principal(self) -> Principal {
        self.principal
    }
    #[must_use]
    pub const fn boot_id(self) -> [u8; 16] {
        self.boot_id
    }
    #[must_use]
    pub const fn profile(self) -> IsolationProfile {
        self.profile
    }
    #[must_use]
    pub const fn acknowledged(self) -> bool {
        self.acknowledged
    }
    #[must_use]
    pub const fn bytes(self) -> u64 {
        self.bytes
    }
    #[must_use]
    pub const fn inodes(self) -> u64 {
        self.inodes
    }
}

#[cfg(test)]
mod tests {
    use super::{DurableOperation, IsolationProfile, JobState};

    #[test]
    fn unknown_wire_values_stay_at_the_translator() {
        assert_eq!(JobState::from_wire(0), JobState::Unknown);
        assert_eq!(JobState::from_wire(99), JobState::Unknown);
        assert_eq!(DurableOperation::from_wire(0), DurableOperation::Unknown);
        assert_eq!(IsolationProfile::from_wire(0), IsolationProfile::Unknown);
        assert_eq!(JobState::Unknown.to_wire(), 0);
    }
}
