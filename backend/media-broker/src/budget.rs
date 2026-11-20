use crate::state::{JobRecord, JobState, Reservation};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct BudgetLimits {
    jobs: u32,
    mounts: u32,
    bytes: u64,
    inodes: u64,
    quarantine_bytes: u64,
    quarantine_inodes: u64,
}

impl BudgetLimits {
    #[must_use]
    pub const fn create(
        jobs: u32,
        mounts: u32,
        bytes: u64,
        inodes: u64,
        quarantine_bytes: u64,
        quarantine_inodes: u64,
    ) -> Option<Self> {
        if jobs == 0
            || mounts == 0
            || bytes == 0
            || inodes == 0
            || quarantine_bytes == 0
            || quarantine_inodes == 0
        {
            None
        } else {
            Some(Self {
                jobs,
                mounts,
                bytes,
                inodes,
                quarantine_bytes,
                quarantine_inodes,
            })
        }
    }
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub struct BudgetUsage {
    jobs: u32,
    mounts: u32,
    bytes: u64,
    inodes: u64,
    quarantine_bytes: u64,
    quarantine_inodes: u64,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum BudgetError {
    ArithmeticOverflow,
    JobLimit,
    MountLimit,
    ByteLimit,
    InodeLimit,
    QuarantineByteLimit,
    QuarantineInodeLimit,
}

impl BudgetUsage {
    /// Rebuilds aggregate usage exclusively from durable records.
    ///
    /// # Errors
    ///
    /// Returns [`BudgetError::ArithmeticOverflow`] if durable counters cannot be
    /// represented without wrapping.
    pub fn from_records<'a>(
        records: impl IntoIterator<Item = &'a JobRecord>,
    ) -> Result<Self, BudgetError> {
        let mut usage = Self::default();
        for record in records {
            usage = usage.with_record(*record)?;
        }
        Ok(usage)
    }

    /// Verifies that the durable aggregate stays inside every configured cap.
    ///
    /// # Errors
    ///
    /// Returns the first closed budget dimension that is exceeded.
    pub const fn verify(self, limits: BudgetLimits) -> Result<(), BudgetError> {
        if self.jobs > limits.jobs {
            return Err(BudgetError::JobLimit);
        }
        if self.mounts > limits.mounts {
            return Err(BudgetError::MountLimit);
        }
        if self.bytes > limits.bytes {
            return Err(BudgetError::ByteLimit);
        }
        if self.inodes > limits.inodes {
            return Err(BudgetError::InodeLimit);
        }
        if self.quarantine_bytes > limits.quarantine_bytes {
            return Err(BudgetError::QuarantineByteLimit);
        }
        if self.quarantine_inodes > limits.quarantine_inodes {
            return Err(BudgetError::QuarantineInodeLimit);
        }
        Ok(())
    }

    /// Atomically preflights one new active reservation.
    ///
    /// # Errors
    ///
    /// Returns a closed budget error without mutating the current usage.
    pub fn admit(
        self,
        reservation: Reservation,
        limits: BudgetLimits,
    ) -> Result<Self, BudgetError> {
        let candidate = Self {
            jobs: self
                .jobs
                .checked_add(1)
                .ok_or(BudgetError::ArithmeticOverflow)?,
            mounts: self
                .mounts
                .checked_add(reservation.mounts())
                .ok_or(BudgetError::ArithmeticOverflow)?,
            bytes: self
                .bytes
                .checked_add(reservation.bytes())
                .ok_or(BudgetError::ArithmeticOverflow)?,
            inodes: self
                .inodes
                .checked_add(reservation.inodes())
                .ok_or(BudgetError::ArithmeticOverflow)?,
            ..self
        };
        candidate.verify(limits)?;
        Ok(candidate)
    }

    #[must_use]
    pub const fn jobs(self) -> u32 {
        self.jobs
    }
    #[must_use]
    pub const fn mounts(self) -> u32 {
        self.mounts
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
    pub const fn quarantine_bytes(self) -> u64 {
        self.quarantine_bytes
    }
    #[must_use]
    pub const fn quarantine_inodes(self) -> u64 {
        self.quarantine_inodes
    }

    fn with_record(self, record: JobRecord) -> Result<Self, BudgetError> {
        let reservation = record.reservation();
        let mut next = Self {
            jobs: self
                .jobs
                .checked_add(1)
                .ok_or(BudgetError::ArithmeticOverflow)?,
            mounts: self
                .mounts
                .checked_add(reservation.mounts())
                .ok_or(BudgetError::ArithmeticOverflow)?,
            ..self
        };
        if record.state() == JobState::Quarantined {
            next.quarantine_bytes = next
                .quarantine_bytes
                .checked_add(reservation.bytes())
                .ok_or(BudgetError::ArithmeticOverflow)?;
            next.quarantine_inodes = next
                .quarantine_inodes
                .checked_add(reservation.inodes())
                .ok_or(BudgetError::ArithmeticOverflow)?;
        } else {
            next.bytes = next
                .bytes
                .checked_add(reservation.bytes())
                .ok_or(BudgetError::ArithmeticOverflow)?;
            next.inodes = next
                .inodes
                .checked_add(reservation.inodes())
                .ok_or(BudgetError::ArithmeticOverflow)?;
        }
        Ok(next)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::{JobRecordFields, Principal};

    #[test]
    fn every_global_dimension_is_fail_closed() {
        let limits = limits();
        let usage = BudgetUsage::default();
        assert_eq!(
            usage.admit(reservation(101, 1, 1), limits),
            Err(BudgetError::ByteLimit)
        );
        assert_eq!(
            usage.admit(reservation(1, 11, 1), limits),
            Err(BudgetError::InodeLimit)
        );
        assert_eq!(
            usage.admit(reservation(1, 1, 3), limits),
            Err(BudgetError::MountLimit)
        );

        let full =
            BudgetUsage::from_records([record(JobState::Allocated, 1)].iter()).expect("usage");
        assert_eq!(
            full.admit(reservation(1, 1, 1), limits),
            Err(BudgetError::JobLimit)
        );
    }

    #[test]
    fn terminal_without_ack_retains_the_full_reservation() {
        let terminal = record(JobState::Terminal, 1);
        let usage = BudgetUsage::from_records([terminal].iter()).expect("usage");
        assert_eq!(usage.jobs(), 1);
        assert_eq!(usage.mounts(), 1);
        assert_eq!(usage.bytes(), 100);
        assert_eq!(usage.inodes(), 10);
    }

    #[test]
    fn quarantine_has_an_independent_bounded_pool() {
        let quarantined = record(JobState::Quarantined, 1);
        let usage = BudgetUsage::from_records([quarantined].iter()).expect("usage");
        assert_eq!(usage.bytes(), 0);
        assert_eq!(usage.quarantine_bytes(), 100);
        assert_eq!(usage.quarantine_inodes(), 10);
        assert_eq!(usage.verify(limits()), Ok(()));

        let second = record(JobState::Quarantined, 2);
        let overflow = BudgetUsage::from_records([quarantined, second].iter()).expect("usage");
        let quarantine_limits =
            BudgetLimits::create(2, 2, 100, 10, 100, 10).expect("quarantine limits");
        assert_eq!(
            overflow.verify(quarantine_limits),
            Err(BudgetError::QuarantineByteLimit)
        );
    }

    fn limits() -> BudgetLimits {
        BudgetLimits::create(1, 2, 100, 10, 100, 10).expect("limits")
    }

    fn reservation(bytes: u64, inodes: u64, mounts: u32) -> Reservation {
        Reservation::create(bytes, inodes, mounts).expect("reservation")
    }

    fn record(state: JobState, suffix: u8) -> JobRecord {
        JobRecord::restore(JobRecordFields {
            job_id: [suffix; 16],
            revision: 1,
            state,
            principal: Principal::create(1000, 1000),
            boot_id: [9; 16],
            bytes: 100,
            inodes: 10,
            mounts: 1,
            created_at_ms: 1,
            updated_at_ms: 1,
        })
        .expect("record")
    }
}
