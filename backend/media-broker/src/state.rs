use crate::protocol::MAX_REVISION;

#[derive(Clone, Copy, Debug, Eq, Ord, PartialEq, PartialOrd)]
pub struct JobId([u8; 16]);

impl JobId {
    #[must_use]
    pub fn create(value: [u8; 16]) -> Option<Self> {
        if value == [0; 16] {
            None
        } else {
            Some(Self(value))
        }
    }

    #[must_use]
    pub const fn bytes(self) -> [u8; 16] {
        self.0
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
pub struct BootId([u8; 16]);

impl BootId {
    #[must_use]
    pub fn create(value: [u8; 16]) -> Option<Self> {
        if value == [0; 16] {
            None
        } else {
            Some(Self(value))
        }
    }

    #[must_use]
    pub const fn bytes(self) -> [u8; 16] {
        self.0
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct Reservation {
    bytes: u64,
    inodes: u64,
    mounts: u32,
}

impl Reservation {
    #[must_use]
    pub const fn create(bytes: u64, inodes: u64, mounts: u32) -> Option<Self> {
        if bytes == 0 || inodes == 0 || mounts == 0 {
            None
        } else {
            Some(Self {
                bytes,
                inodes,
                mounts,
            })
        }
    }

    #[must_use]
    pub const fn bytes(self) -> u64 {
        self.bytes
    }

    #[must_use]
    pub const fn inodes(self) -> u64 {
        self.inodes
    }

    #[must_use]
    pub const fn mounts(self) -> u32 {
        self.mounts
    }
}

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
    pub const fn from_wire(value: u8) -> Self {
        match value {
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
    pub(crate) const fn to_wire(self) -> u8 {
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

    #[must_use]
    pub fn allows(self, next: Self) -> bool {
        if matches!(next, Self::Unknown) || self == next {
            return false;
        }
        if matches!(next, Self::Quarantined) {
            return !matches!(self, Self::Unknown | Self::Quarantined);
        }
        matches!(
            (self, next),
            (Self::Allocated, Self::InputSealed)
                | (Self::InputSealed, Self::Starting)
                | (
                    Self::Starting,
                    Self::Running | Self::Terminating | Self::Terminal
                )
                | (Self::Running, Self::Terminating | Self::Terminal)
                | (Self::Terminating, Self::Terminal)
        )
    }

    #[must_use]
    pub const fn expects_runtime(self) -> bool {
        matches!(self, Self::Starting | Self::Running | Self::Terminating)
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum StateError {
    InvalidJobId,
    InvalidBootId,
    InvalidReservation,
    InvalidRevision,
    InvalidTimestamp,
    UnknownState,
    StaleRevision,
    RevisionExhausted,
    InvalidTransition,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct JobRecord {
    job_id: JobId,
    revision: u64,
    state: JobState,
    principal: Principal,
    boot_id: BootId,
    reservation: Reservation,
    created_at_ms: u64,
    updated_at_ms: u64,
}

impl JobRecord {
    /// Restores a validated record from the durable journal boundary.
    ///
    /// # Errors
    ///
    /// Returns a closed [`StateError`] for every invalid or unknown field.
    pub fn restore(fields: JobRecordFields) -> Result<Self, StateError> {
        let job_id = JobId::create(fields.job_id).ok_or(StateError::InvalidJobId)?;
        let boot_id = BootId::create(fields.boot_id).ok_or(StateError::InvalidBootId)?;
        let reservation = Reservation::create(fields.bytes, fields.inodes, fields.mounts)
            .ok_or(StateError::InvalidReservation)?;
        if fields.revision == 0 || fields.revision > MAX_REVISION {
            return Err(StateError::InvalidRevision);
        }
        if fields.state == JobState::Unknown {
            return Err(StateError::UnknownState);
        }
        if fields.created_at_ms == 0 || fields.updated_at_ms < fields.created_at_ms {
            return Err(StateError::InvalidTimestamp);
        }
        Ok(Self {
            job_id,
            revision: fields.revision,
            state: fields.state,
            principal: fields.principal,
            boot_id,
            reservation,
            created_at_ms: fields.created_at_ms,
            updated_at_ms: fields.updated_at_ms,
        })
    }

    /// Creates the first monotonic state of a broker job.
    ///
    /// # Errors
    ///
    /// Returns a closed [`StateError`] when any durable identity or reservation
    /// field is invalid.
    pub fn allocate(
        job_id: [u8; 16],
        principal: Principal,
        boot_id: [u8; 16],
        reservation: Reservation,
        now_ms: u64,
    ) -> Result<Self, StateError> {
        Self::restore(JobRecordFields {
            job_id,
            revision: 1,
            state: JobState::Allocated,
            principal,
            boot_id,
            bytes: reservation.bytes(),
            inodes: reservation.inodes(),
            mounts: reservation.mounts(),
            created_at_ms: now_ms,
            updated_at_ms: now_ms,
        })
    }

    /// Applies one compare-and-set state transition.
    ///
    /// # Errors
    ///
    /// Returns a closed [`StateError`] for a stale revision, invalid edge,
    /// exhausted revision or invalid timestamp.
    pub fn transition(
        self,
        expected_revision: u64,
        next: JobState,
        now_ms: u64,
    ) -> Result<Self, StateError> {
        if self.revision != expected_revision {
            return Err(StateError::StaleRevision);
        }
        if self.revision == MAX_REVISION {
            return Err(StateError::RevisionExhausted);
        }
        if !self.state.allows(next) {
            return Err(StateError::InvalidTransition);
        }
        if now_ms < self.updated_at_ms {
            return Err(StateError::InvalidTimestamp);
        }
        Ok(Self {
            revision: self.revision + 1,
            state: next,
            updated_at_ms: now_ms,
            ..self
        })
    }

    #[must_use]
    pub const fn job_id(self) -> JobId {
        self.job_id
    }
    #[must_use]
    pub const fn revision(self) -> u64 {
        self.revision
    }
    #[must_use]
    pub const fn state(self) -> JobState {
        self.state
    }
    #[must_use]
    pub const fn principal(self) -> Principal {
        self.principal
    }
    #[must_use]
    pub const fn boot_id(self) -> BootId {
        self.boot_id
    }
    #[must_use]
    pub const fn reservation(self) -> Reservation {
        self.reservation
    }
    #[must_use]
    pub const fn created_at_ms(self) -> u64 {
        self.created_at_ms
    }
    #[must_use]
    pub const fn updated_at_ms(self) -> u64 {
        self.updated_at_ms
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct JobRecordFields {
    pub job_id: [u8; 16],
    pub revision: u64,
    pub state: JobState,
    pub principal: Principal,
    pub boot_id: [u8; 16],
    pub bytes: u64,
    pub inodes: u64,
    pub mounts: u32,
    pub created_at_ms: u64,
    pub updated_at_ms: u64,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn transition_graph_is_closed_and_monotonic() {
        let record = record();
        let sealed = record
            .transition(1, JobState::InputSealed, 11)
            .expect("seal transition");
        assert_eq!(sealed.revision(), 2);
        assert_eq!(sealed.state(), JobState::InputSealed);
        assert_eq!(
            sealed.transition(1, JobState::Starting, 12),
            Err(StateError::StaleRevision)
        );
        assert_eq!(
            sealed.transition(2, JobState::Running, 12),
            Err(StateError::InvalidTransition)
        );
        assert_eq!(
            sealed.transition(2, JobState::Unknown, 12),
            Err(StateError::InvalidTransition)
        );
    }

    #[test]
    fn every_known_non_quarantined_state_can_fail_closed_to_quarantine() {
        for state in [
            JobState::Allocated,
            JobState::InputSealed,
            JobState::Starting,
            JobState::Running,
            JobState::Terminating,
            JobState::Terminal,
        ] {
            assert!(state.allows(JobState::Quarantined));
        }
        assert!(!JobState::Unknown.allows(JobState::Quarantined));
        assert!(!JobState::Quarantined.allows(JobState::Quarantined));
    }

    #[test]
    fn restore_rejects_unknown_state_and_signed_wire_overflow() {
        let mut fields = fields();
        fields.state = JobState::Unknown;
        assert_eq!(JobRecord::restore(fields), Err(StateError::UnknownState));
        fields.state = JobState::Allocated;
        fields.revision = MAX_REVISION + 1;
        assert_eq!(JobRecord::restore(fields), Err(StateError::InvalidRevision));
    }

    fn record() -> JobRecord {
        JobRecord::restore(fields()).expect("valid record")
    }

    fn fields() -> JobRecordFields {
        JobRecordFields {
            job_id: [1; 16],
            revision: 1,
            state: JobState::Allocated,
            principal: Principal::create(1000, 1000),
            boot_id: [2; 16],
            bytes: 1024,
            inodes: 4,
            mounts: 1,
            created_at_ms: 10,
            updated_at_ms: 10,
        }
    }
}
