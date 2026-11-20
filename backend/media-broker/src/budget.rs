#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct BudgetLimits {
    jobs: u32,
    mounts: u32,
    bytes: u64,
    inodes: u64,
    quarantine: u32,
}

impl BudgetLimits {
    pub const STANDARD: Self = Self {
        jobs: 1,
        mounts: 1,
        bytes: 48 * 1024 * 1024,
        inodes: 4096,
        quarantine: 8,
    };

    #[must_use]
    pub const fn create(
        jobs: u32,
        mounts: u32,
        bytes: u64,
        inodes: u64,
        quarantine: u32,
    ) -> Option<Self> {
        if jobs == 0 || mounts == 0 || bytes == 0 || inodes == 0 || quarantine == 0 {
            None
        } else {
            Some(Self {
                jobs,
                mounts,
                bytes,
                inodes,
                quarantine,
            })
        }
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
    pub const fn quarantine(self) -> u32 {
        self.quarantine
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct BudgetReservation {
    jobs: u32,
    mounts: u32,
    bytes: u64,
    inodes: u64,
    quarantine: u32,
}

impl BudgetReservation {
    #[must_use]
    pub const fn allocate(bytes: u64, inodes: u64) -> Option<Self> {
        if bytes == 0 || inodes == 0 {
            None
        } else {
            Some(Self {
                jobs: 1,
                mounts: 1,
                bytes,
                inodes,
                quarantine: 0,
            })
        }
    }

    #[must_use]
    pub const fn quarantine_slot() -> Self {
        Self {
            jobs: 0,
            mounts: 0,
            bytes: 0,
            inodes: 0,
            quarantine: 1,
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct Budget {
    limits: BudgetLimits,
    used_jobs: u32,
    used_mounts: u32,
    used_bytes: u64,
    used_inodes: u64,
    used_quarantine: u32,
}

impl Budget {
    #[must_use]
    pub const fn open(limits: BudgetLimits) -> Self {
        Self {
            limits,
            used_jobs: 0,
            used_mounts: 0,
            used_bytes: 0,
            used_inodes: 0,
            used_quarantine: 0,
        }
    }

    #[must_use]
    pub const fn limits(self) -> BudgetLimits {
        self.limits
    }

    #[must_use]
    pub const fn try_reserve(&self, reservation: BudgetReservation) -> Option<Self> {
        let jobs = self.used_jobs.checked_add(reservation.jobs)?;
        let mounts = self.used_mounts.checked_add(reservation.mounts)?;
        let bytes = self.used_bytes.checked_add(reservation.bytes)?;
        let inodes = self.used_inodes.checked_add(reservation.inodes)?;
        let quarantine = self.used_quarantine.checked_add(reservation.quarantine)?;
        if jobs > self.limits.jobs
            || mounts > self.limits.mounts
            || bytes > self.limits.bytes
            || inodes > self.limits.inodes
            || quarantine > self.limits.quarantine
        {
            return None;
        }
        Some(Self {
            limits: self.limits,
            used_jobs: jobs,
            used_mounts: mounts,
            used_bytes: bytes,
            used_inodes: inodes,
            used_quarantine: quarantine,
        })
    }

    #[must_use]
    pub const fn release(self, reservation: BudgetReservation) -> Option<Self> {
        Some(Self {
            limits: self.limits,
            used_jobs: self.used_jobs.checked_sub(reservation.jobs)?,
            used_mounts: self.used_mounts.checked_sub(reservation.mounts)?,
            used_bytes: self.used_bytes.checked_sub(reservation.bytes)?,
            used_inodes: self.used_inodes.checked_sub(reservation.inodes)?,
            used_quarantine: self.used_quarantine.checked_sub(reservation.quarantine)?,
        })
    }
}
