use crate::budget::{Budget, BudgetLimits, BudgetReservation};
use crate::inventory::{RuntimeInventory, complete_unit, leftover};
use crate::journal::{self, DurableJournal, JournalError};
use crate::state::{
    Admission, DurableIntent, DurableOperation, IsolationProfile, JobRecord, JobState, Principal,
};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ApplyError {
    AdmissionClosed,
    StaleRevision,
    InvalidTransition,
    UnknownOperation,
    BudgetExhausted,
    RuntimePresent,
    Journal,
    Corrupt,
}

impl From<JournalError> for ApplyError {
    fn from(error: JournalError) -> Self {
        match error {
            JournalError::Corrupt => Self::Corrupt,
            JournalError::Unavailable => Self::Journal,
        }
    }
}

pub struct DurableBroker<I> {
    root: PathBuf,
    journal: DurableJournal,
    boot_id: [u8; 16],
    jobs: BTreeMap<[u8; 16], JobRecord>,
    budget: Budget,
    admission: Admission,
    inventory: I,
}

impl<I: RuntimeInventory> DurableBroker<I> {
    /// Opens a durable store, loads the journal and reconciles leftover runtime.
    ///
    /// # Errors
    ///
    /// Corruption, unknown states and unreconciled leftovers close admission.
    pub fn open(
        root: &Path,
        boot_id: [u8; 16],
        limits: BudgetLimits,
        inventory: I,
    ) -> Result<Self, ApplyError> {
        std::fs::create_dir_all(root).map_err(|_| ApplyError::Journal)?;
        if std::fs::symlink_metadata(root)
            .map_err(|_| ApplyError::Journal)?
            .file_type()
            .is_symlink()
        {
            return Err(ApplyError::Journal);
        }
        let journal = DurableJournal::open(&root.join("journal"))?;
        let admission = match journal::load_admission(root) {
            Ok(Admission::Unknown) | Err(JournalError::Corrupt) => {
                journal::persist_admission(root, Admission::Closed)?;
                return Err(ApplyError::Corrupt);
            }
            Ok(value) => value,
            Err(JournalError::Unavailable) => return Err(ApplyError::Journal),
        };
        let loaded = match journal.load() {
            Ok(records) => records,
            Err(JournalError::Corrupt) => {
                journal::persist_admission(root, Admission::Closed)?;
                return Err(ApplyError::Corrupt);
            }
            Err(JournalError::Unavailable) => return Err(ApplyError::Journal),
        };
        let mut jobs = BTreeMap::new();
        let mut budget = Budget::open(limits);
        for record in loaded {
            if matches!(record.state(), JobState::Unknown)
                || matches!(record.operation(), DurableOperation::Unknown)
            {
                journal::persist_admission(root, Admission::Closed)?;
                return Err(ApplyError::Corrupt);
            }
            let reservation = BudgetReservation::allocate(record.bytes(), record.inodes())
                .ok_or(ApplyError::Corrupt)?;
            budget = budget.try_reserve(reservation).ok_or(ApplyError::Corrupt)?;
            if matches!(record.state(), JobState::Quarantined) {
                budget = budget
                    .try_reserve(BudgetReservation::quarantine_slot())
                    .ok_or(ApplyError::Corrupt)?;
            }
            jobs.insert(record.job_id(), record);
        }
        let mut store = Self {
            root: root.to_path_buf(),
            journal,
            boot_id,
            jobs,
            budget,
            admission,
            inventory,
        };
        store.reconcile()?;
        if store.has_unacked_terminal() {
            store.close_admission()?;
        }
        Ok(store)
    }

    #[must_use]
    pub const fn admission(&self) -> Admission {
        self.admission
    }

    #[must_use]
    pub fn inspect(&self, job_id: [u8; 16]) -> Option<JobRecord> {
        self.jobs.get(&job_id).copied()
    }

    pub fn inventory_mut(&mut self) -> &mut I {
        &mut self.inventory
    }

    /// Applies one closed durable operation with compare-and-set revision.
    ///
    /// # Errors
    ///
    /// Unknown operations and illegal transitions close admission. Budget or
    /// CAS failures reject the request without transferring authority.
    pub fn apply(&mut self, intent: DurableIntent) -> Result<Option<JobRecord>, ApplyError> {
        let operation = intent.operation();
        let job_id = intent.job_id();
        let expected_revision = intent.expected_revision();
        let principal = intent.principal();
        let profile = intent.profile();
        if matches!(operation, DurableOperation::Unknown)
            || matches!(profile, IsolationProfile::Unknown)
        {
            self.close_admission()?;
            return Err(ApplyError::UnknownOperation);
        }
        if matches!(operation, DurableOperation::Inspect) {
            return Ok(self.inspect(job_id));
        }
        if matches!(self.admission, Admission::Closed)
            && !matches!(operation, DurableOperation::Acknowledge)
        {
            return Err(ApplyError::AdmissionClosed);
        }
        let result = match operation {
            DurableOperation::Allocate => self.allocate(
                job_id,
                expected_revision,
                principal,
                profile,
                intent.bytes(),
                intent.inodes(),
            ),
            DurableOperation::Seal => self.transition(
                job_id,
                expected_revision,
                principal,
                JobState::Allocated,
                JobState::InputSealed,
                operation,
            ),
            DurableOperation::Start => self.transition(
                job_id,
                expected_revision,
                principal,
                JobState::InputSealed,
                JobState::Starting,
                operation,
            ),
            DurableOperation::Terminate => self.terminate(job_id, expected_revision, principal),
            DurableOperation::Acknowledge => self.acknowledge(job_id, expected_revision, principal),
            DurableOperation::Quarantine => self.quarantine(job_id, expected_revision, principal),
            DurableOperation::Inspect | DurableOperation::Unknown => {
                Err(ApplyError::UnknownOperation)
            }
        };
        match result {
            Err(
                ApplyError::InvalidTransition | ApplyError::UnknownOperation | ApplyError::Corrupt,
            ) => {
                self.close_admission()?;
                result
            }
            other => other,
        }
    }

    fn allocate(
        &mut self,
        job_id: [u8; 16],
        expected_revision: u64,
        principal: Principal,
        profile: IsolationProfile,
        bytes: u64,
        inodes: u64,
    ) -> Result<Option<JobRecord>, ApplyError> {
        if expected_revision != 0 || self.jobs.contains_key(&job_id) {
            return Err(ApplyError::StaleRevision);
        }
        if self.has_unacked_terminal() {
            self.close_admission()?;
            return Err(ApplyError::AdmissionClosed);
        }
        let reservation =
            BudgetReservation::allocate(bytes, inodes).ok_or(ApplyError::InvalidTransition)?;
        let budget = self
            .budget
            .try_reserve(reservation)
            .ok_or(ApplyError::BudgetExhausted)?;
        let record = JobRecord::create(
            DurableOperation::Allocate,
            JobState::Allocated,
            job_id,
            1,
            principal,
            self.boot_id,
            profile,
            false,
            bytes,
            inodes,
        )
        .ok_or(ApplyError::InvalidTransition)?;
        self.journal.persist(record)?;
        self.budget = budget;
        self.jobs.insert(job_id, record);
        Ok(Some(record))
    }

    fn transition(
        &mut self,
        job_id: [u8; 16],
        expected_revision: u64,
        principal: Principal,
        from: JobState,
        to: JobState,
        operation: DurableOperation,
    ) -> Result<Option<JobRecord>, ApplyError> {
        let current = self
            .jobs
            .get(&job_id)
            .copied()
            .ok_or(ApplyError::StaleRevision)?;
        self.authorize(current, expected_revision, principal)?;
        if current.state() != from {
            return Err(ApplyError::InvalidTransition);
        }
        let next = replace(current, operation, to, expected_revision + 1)?;
        self.commit(next)?;
        self.reconcile_job(job_id)?;
        Ok(self.inspect(job_id))
    }

    fn terminate(
        &mut self,
        job_id: [u8; 16],
        expected_revision: u64,
        principal: Principal,
    ) -> Result<Option<JobRecord>, ApplyError> {
        let current = self
            .jobs
            .get(&job_id)
            .copied()
            .ok_or(ApplyError::StaleRevision)?;
        self.authorize(current, expected_revision, principal)?;
        if !matches!(current.state(), JobState::Starting | JobState::Running) {
            return Err(ApplyError::InvalidTransition);
        }
        let next = replace(
            current,
            DurableOperation::Terminate,
            JobState::Terminating,
            expected_revision + 1,
        )?;
        self.commit(next)?;
        self.reconcile_job(job_id)?;
        Ok(self.inspect(job_id))
    }

    fn acknowledge(
        &mut self,
        job_id: [u8; 16],
        expected_revision: u64,
        principal: Principal,
    ) -> Result<Option<JobRecord>, ApplyError> {
        let current = self
            .jobs
            .get(&job_id)
            .copied()
            .ok_or(ApplyError::StaleRevision)?;
        self.authorize(current, expected_revision, principal)?;
        if current.state() != JobState::Terminal {
            return Err(ApplyError::InvalidTransition);
        }
        if leftover(&self.inventory, job_id) {
            self.quarantine(job_id, expected_revision, principal)?;
            return Err(ApplyError::RuntimePresent);
        }
        let reservation = BudgetReservation::allocate(current.bytes(), current.inodes())
            .ok_or(ApplyError::Corrupt)?;
        self.journal.remove(job_id)?;
        self.budget = self
            .budget
            .release(reservation)
            .ok_or(ApplyError::Corrupt)?;
        self.jobs.remove(&job_id);
        if !self.has_unacked_terminal() && !self.has_quarantine() {
            self.admission = Admission::Open;
            journal::persist_admission(&self.root, self.admission)?;
        }
        Ok(None)
    }

    fn quarantine(
        &mut self,
        job_id: [u8; 16],
        expected_revision: u64,
        principal: Principal,
    ) -> Result<Option<JobRecord>, ApplyError> {
        let current = self
            .jobs
            .get(&job_id)
            .copied()
            .ok_or(ApplyError::StaleRevision)?;
        self.authorize(current, expected_revision, principal)?;
        if matches!(current.state(), JobState::Quarantined) {
            self.close_admission()?;
            return Ok(Some(current));
        }
        let next = replace(
            current,
            DurableOperation::Quarantine,
            JobState::Quarantined,
            expected_revision + 1,
        )?;
        let budget = self
            .budget
            .try_reserve(BudgetReservation::quarantine_slot())
            .ok_or(ApplyError::BudgetExhausted)?;
        self.journal.persist(next)?;
        self.budget = budget;
        self.jobs.insert(job_id, next);
        self.close_admission()?;
        Ok(Some(next))
    }

    fn authorize(
        &self,
        current: JobRecord,
        expected_revision: u64,
        principal: Principal,
    ) -> Result<(), ApplyError> {
        if current.revision() != expected_revision || current.principal() != principal {
            return Err(ApplyError::StaleRevision);
        }
        Ok(())
    }

    fn commit(&mut self, record: JobRecord) -> Result<(), ApplyError> {
        self.journal.persist(record)?;
        self.jobs.insert(record.job_id(), record);
        Ok(())
    }

    fn reconcile(&mut self) -> Result<(), ApplyError> {
        let ids: Vec<[u8; 16]> = self.jobs.keys().copied().collect();
        for job_id in ids {
            self.reconcile_job(job_id)?;
        }
        Ok(())
    }

    fn reconcile_job(&mut self, job_id: [u8; 16]) -> Result<(), ApplyError> {
        let Some(current) = self.jobs.get(&job_id).copied() else {
            return Ok(());
        };
        let leftovers = leftover(&self.inventory, job_id);
        let running = complete_unit(&self.inventory, job_id);
        let next_state = match current.state() {
            JobState::Allocated | JobState::InputSealed if leftovers => Some(JobState::Quarantined),
            JobState::Starting if running && !self.inventory.has_pid(job_id) => {
                Some(JobState::Quarantined)
            }
            JobState::Starting if running => Some(JobState::Running),
            JobState::Starting if leftovers && !running => Some(JobState::Quarantined),
            JobState::Running if !running || leftovers && !self.inventory.has_unit(job_id) => {
                Some(JobState::Quarantined)
            }
            JobState::Terminating if !leftovers => Some(JobState::Terminal),
            JobState::Terminal if leftovers => Some(JobState::Quarantined),
            JobState::Unknown => {
                self.close_admission()?;
                return Err(ApplyError::Corrupt);
            }
            _ => None,
        };
        if let Some(JobState::Quarantined) = next_state {
            self.quarantine(job_id, current.revision(), current.principal())?;
            return Ok(());
        }
        if let Some(state) = next_state {
            let next = replace(
                current,
                current.operation(),
                state,
                current
                    .revision()
                    .checked_add(1)
                    .ok_or(ApplyError::Corrupt)?,
            )?;
            self.commit(next)?;
        }
        Ok(())
    }

    fn close_admission(&mut self) -> Result<(), ApplyError> {
        self.admission = Admission::Closed;
        journal::persist_admission(&self.root, self.admission)?;
        Ok(())
    }

    fn has_unacked_terminal(&self) -> bool {
        self.jobs
            .values()
            .any(|job| matches!(job.state(), JobState::Terminal) && !job.acknowledged())
    }

    fn has_quarantine(&self) -> bool {
        self.jobs
            .values()
            .any(|job| matches!(job.state(), JobState::Quarantined))
    }
}

fn replace(
    current: JobRecord,
    operation: DurableOperation,
    state: JobState,
    revision: u64,
) -> Result<JobRecord, ApplyError> {
    JobRecord::create(
        operation,
        state,
        current.job_id(),
        revision,
        current.principal(),
        current.boot_id(),
        current.profile(),
        current.acknowledged(),
        current.bytes(),
        current.inodes(),
    )
    .ok_or(ApplyError::InvalidTransition)
}
