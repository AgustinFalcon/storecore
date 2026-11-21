use std::collections::BTreeMap;
use std::path::Path;

use crate::budget::{BudgetError, BudgetLimits, BudgetUsage};
use crate::journal::{DurableBlockReason, Journal, JournalError};
use crate::state::{BootId, JobId, JobRecord, JobState, Principal, Reservation, StateError};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum AdmissionBlock {
    JournalFailure,
    BudgetViolation,
    InvalidTransition,
    ReconciliationMismatch,
    ReconciliationUnavailable,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum AdmissionStatus {
    RecoveryPending,
    Open,
    Blocked(AdmissionBlock),
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum StoreOpenError {
    Journal(JournalError),
    Budget(BudgetError),
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum StoreError {
    AdmissionClosed,
    DuplicateJob,
    MissingJob,
    AuthorityDenied,
    ReconciliationNotPending,
    Budget(BudgetError),
    State(StateError),
    Journal(JournalError),
}

pub struct BrokerStore {
    journal: Journal,
    records: BTreeMap<JobId, JobRecord>,
    usage: BudgetUsage,
    limits: BudgetLimits,
    admission: AdmissionStatus,
    durable_block: Option<DurableBlockReason>,
}

impl BrokerStore {
    /// Opens and validates the complete durable broker state.
    ///
    /// # Errors
    ///
    /// Returns a closed [`StoreOpenError`] for any journal corruption or
    /// aggregate-budget violation. The caller must not admit work on error.
    pub fn open(
        root: &Path,
        expected_owner: u32,
        limits: BudgetLimits,
    ) -> Result<Self, StoreOpenError> {
        let journal = Journal::open(root, expected_owner).map_err(StoreOpenError::Journal)?;
        let snapshot = journal.load().map_err(StoreOpenError::Journal)?;
        let durable_block = snapshot.durable_block();
        let records = snapshot.into_records();
        let usage = BudgetUsage::from_records(records.values()).map_err(StoreOpenError::Budget)?;
        Ok(Self {
            journal,
            records,
            usage,
            limits,
            admission: AdmissionStatus::RecoveryPending,
            durable_block,
        })
    }

    /// Reserves all global dimensions and durably allocates one job.
    ///
    /// # Errors
    ///
    /// Returns a closed [`StoreError`] without partially updating in-memory
    /// state. Any journal error permanently closes admission for this process.
    pub fn allocate(
        &mut self,
        job_id: [u8; 16],
        principal: Principal,
        boot_id: [u8; 16],
        reservation: Reservation,
        now_ms: u64,
    ) -> Result<JobRecord, StoreError> {
        if self.admission != AdmissionStatus::Open {
            return Err(StoreError::AdmissionClosed);
        }
        let record = JobRecord::allocate(job_id, principal, boot_id, reservation, now_ms)
            .map_err(StoreError::State)?;
        if self.records.contains_key(&record.job_id()) {
            return Err(StoreError::DuplicateJob);
        }
        let candidate_usage = self
            .usage
            .admit(reservation, self.limits)
            .map_err(StoreError::Budget)?;
        self.persist_or_block(record)?;
        self.records.insert(record.job_id(), record);
        self.usage = candidate_usage;
        Ok(record)
    }

    /// Applies an authority-bound compare-and-set transition.
    ///
    /// # Errors
    ///
    /// Returns a closed [`StoreError`] for missing identity, authority drift,
    /// stale revision, invalid edge or a durable journal failure.
    pub fn transition(
        &mut self,
        job_id: JobId,
        expected_revision: u64,
        principal: Principal,
        boot_id: BootId,
        next: JobState,
        now_ms: u64,
    ) -> Result<JobRecord, StoreError> {
        if self.admission != AdmissionStatus::Open {
            return Err(StoreError::AdmissionClosed);
        }
        let current = self.record(job_id)?;
        if current.principal() != principal || current.boot_id() != boot_id {
            return Err(StoreError::AuthorityDenied);
        }
        match self.transition_internal(current, expected_revision, next, now_ms) {
            Ok(updated) => {
                if updated.state() == JobState::Quarantined {
                    self.block_durably(
                        DurableBlockReason::ReconciliationMismatch,
                        AdmissionBlock::ReconciliationMismatch,
                    )?;
                }
                Ok(updated)
            }
            Err(StoreError::State(
                error @ (StateError::InvalidTransition
                | StateError::UnknownState
                | StateError::InvalidTimestamp
                | StateError::RevisionExhausted),
            )) => {
                self.block_durably(
                    DurableBlockReason::InvalidTransition,
                    AdmissionBlock::InvalidTransition,
                )?;
                Err(StoreError::State(error))
            }
            Err(error) => Err(error),
        }
    }

    #[must_use]
    pub const fn admission_status(&self) -> AdmissionStatus {
        self.admission
    }

    #[must_use]
    pub const fn usage(&self) -> BudgetUsage {
        self.usage
    }

    pub fn records(&self) -> impl Iterator<Item = JobRecord> + '_ {
        self.records.values().copied()
    }

    pub(crate) fn block(&mut self, reason: AdmissionBlock) {
        if !matches!(self.admission, AdmissionStatus::Blocked(_)) {
            self.admission = AdmissionStatus::Blocked(reason);
        }
    }

    pub(crate) fn block_durably(
        &mut self,
        durable_reason: DurableBlockReason,
        admission_reason: AdmissionBlock,
    ) -> Result<(), StoreError> {
        self.persist_intervention(durable_reason)?;
        let effective_reason = self
            .durable_block
            .map_or(admission_reason, Self::admission_reason);
        self.block(effective_reason);
        Ok(())
    }

    pub(crate) fn persist_intervention(
        &mut self,
        durable_reason: DurableBlockReason,
    ) -> Result<(), StoreError> {
        if self.durable_block.is_none() {
            self.journal.latch_block(durable_reason).map_err(|error| {
                self.block(AdmissionBlock::JournalFailure);
                StoreError::Journal(error)
            })?;
            self.durable_block = Some(durable_reason);
        }
        Ok(())
    }

    pub(crate) fn record(&self, job_id: JobId) -> Result<JobRecord, StoreError> {
        self.records
            .get(&job_id)
            .copied()
            .ok_or(StoreError::MissingJob)
    }

    pub(crate) fn transition_reconciled(
        &mut self,
        job_id: JobId,
        expected_revision: u64,
        next: JobState,
        now_ms: u64,
    ) -> Result<JobRecord, StoreError> {
        if self.admission != AdmissionStatus::RecoveryPending {
            return Err(StoreError::ReconciliationNotPending);
        }
        let current = self.record(job_id)?;
        self.transition_internal(current, expected_revision, next, now_ms)
    }

    pub(crate) fn require_recovery_pending(&self) -> Result<(), StoreError> {
        if self.admission == AdmissionStatus::RecoveryPending {
            Ok(())
        } else {
            Err(StoreError::ReconciliationNotPending)
        }
    }

    pub(crate) fn finish_reconciliation(
        &mut self,
        mismatches: bool,
    ) -> Result<AdmissionStatus, StoreError> {
        if self.admission != AdmissionStatus::RecoveryPending {
            return Err(StoreError::ReconciliationNotPending);
        }
        let requires_intervention = mismatches
            || self
                .records
                .values()
                .any(|record| record.state() == JobState::Quarantined);
        if requires_intervention {
            self.block_durably(
                DurableBlockReason::ReconciliationMismatch,
                AdmissionBlock::ReconciliationMismatch,
            )?;
        }
        self.admission = if let Some(reason) = self.durable_block {
            AdmissionStatus::Blocked(Self::admission_reason(reason))
        } else if self.usage.verify(self.limits).is_err() {
            AdmissionStatus::Blocked(AdmissionBlock::BudgetViolation)
        } else {
            AdmissionStatus::Open
        };
        Ok(self.admission)
    }

    fn transition_internal(
        &mut self,
        current: JobRecord,
        expected_revision: u64,
        next: JobState,
        now_ms: u64,
    ) -> Result<JobRecord, StoreError> {
        let updated = current
            .transition(expected_revision, next, now_ms)
            .map_err(StoreError::State)?;
        self.persist_or_block(updated)?;
        self.records.insert(updated.job_id(), updated);
        self.usage = BudgetUsage::from_records(self.records.values()).map_err(|error| {
            self.block(AdmissionBlock::BudgetViolation);
            StoreError::Budget(error)
        })?;
        if self.admission != AdmissionStatus::RecoveryPending
            && self.usage.verify(self.limits).is_err()
        {
            self.block(AdmissionBlock::BudgetViolation);
        }
        Ok(updated)
    }

    fn persist_or_block(&mut self, record: JobRecord) -> Result<(), StoreError> {
        self.journal.persist(record).map_err(|error| {
            self.block(AdmissionBlock::JournalFailure);
            StoreError::Journal(error)
        })
    }

    const fn admission_reason(reason: DurableBlockReason) -> AdmissionBlock {
        match reason {
            DurableBlockReason::ReconciliationMismatch => AdmissionBlock::ReconciliationMismatch,
            DurableBlockReason::ReconciliationUnavailable => {
                AdmissionBlock::ReconciliationUnavailable
            }
            DurableBlockReason::InvalidTransition | DurableBlockReason::Unknown => {
                AdmissionBlock::InvalidTransition
            }
        }
    }

    #[cfg(test)]
    pub(crate) fn fail_next_persist_after_rename(&self) {
        self.journal.fail_next_persist_after_rename();
    }

    #[cfg(test)]
    pub(crate) fn fail_persist_after_rename_skipping(&self, skip: u32) {
        self.journal.fail_persist_after_rename_skipping(skip);
    }

    #[cfg(test)]
    pub(crate) fn fail_next_latch_before_create(&self) {
        self.journal.fail_next_latch_before_create();
    }
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::os::unix::fs::PermissionsExt;
    use std::sync::atomic::{AtomicU64, Ordering};

    use super::*;

    static NEXT_FIXTURE: AtomicU64 = AtomicU64::new(1);

    #[test]
    fn allocation_and_cas_survive_a_restart() {
        let fixture = Fixture::new();
        let mut store = fixture.ready_store(limits());
        let allocated = store
            .allocate([1; 16], principal(), [2; 16], reservation(100, 2, 1), 1)
            .expect("allocate");
        let sealed = store
            .transition(
                allocated.job_id(),
                1,
                principal(),
                allocated.boot_id(),
                JobState::InputSealed,
                2,
            )
            .expect("seal");
        drop(store);

        let mut restored = fixture.pending_store(limits());
        assert_eq!(
            restored.admission_status(),
            AdmissionStatus::RecoveryPending
        );
        assert_eq!(
            restored.allocate([13; 16], principal(), [14; 16], reservation(1, 1, 1), 3),
            Err(StoreError::AdmissionClosed)
        );
        assert_eq!(
            restored.finish_reconciliation(false),
            Ok(AdmissionStatus::Open)
        );
        assert_eq!(restored.record(sealed.job_id()), Ok(sealed));
        assert_eq!(restored.usage().jobs(), 1);
        assert_eq!(restored.usage().bytes(), 100);
    }

    #[test]
    fn stale_revision_and_authority_drift_do_not_mutate_state() {
        let fixture = Fixture::new();
        let mut store = fixture.ready_store(limits());
        let allocated = store
            .allocate([3; 16], principal(), [4; 16], reservation(10, 1, 1), 1)
            .expect("allocate");
        assert_eq!(
            store.transition(
                allocated.job_id(),
                2,
                principal(),
                allocated.boot_id(),
                JobState::InputSealed,
                2,
            ),
            Err(StoreError::State(StateError::StaleRevision))
        );
        assert_eq!(
            store.transition(
                allocated.job_id(),
                1,
                Principal::create(2000, 2000),
                allocated.boot_id(),
                JobState::InputSealed,
                2,
            ),
            Err(StoreError::AuthorityDenied)
        );
        assert_eq!(store.record(allocated.job_id()), Ok(allocated));
    }

    #[test]
    fn terminal_jobs_keep_budget_and_exhaustion_rejects_new_work() {
        let fixture = Fixture::new();
        let limits = BudgetLimits::create(1, 1, 100, 2, 100, 2).expect("limits");
        let mut store = fixture.ready_store(limits);
        let allocated = store
            .allocate([5; 16], principal(), [6; 16], reservation(100, 2, 1), 1)
            .expect("allocate");
        let quarantined = store
            .transition(
                allocated.job_id(),
                1,
                principal(),
                allocated.boot_id(),
                JobState::Quarantined,
                2,
            )
            .expect("quarantine");
        assert_eq!(quarantined.state(), JobState::Quarantined);
        assert_eq!(store.usage().jobs(), 1);
        assert_eq!(
            store.allocate([7; 16], principal(), [8; 16], reservation(1, 1, 1), 3),
            Err(StoreError::AdmissionClosed)
        );
        drop(store);
        let mut restored = fixture.pending_store(limits);
        assert_eq!(
            restored.finish_reconciliation(false),
            Ok(AdmissionStatus::Blocked(
                AdmissionBlock::ReconciliationMismatch
            ))
        );
    }

    #[test]
    fn uncertain_journal_commit_closes_future_admission() {
        let fixture = Fixture::new();
        let mut store = fixture.ready_store(limits());
        let allocated = store
            .allocate([9; 16], principal(), [10; 16], reservation(1, 1, 1), 1)
            .expect("allocate");
        store.fail_next_persist_after_rename();

        assert_eq!(
            store.transition(
                allocated.job_id(),
                1,
                principal(),
                allocated.boot_id(),
                JobState::InputSealed,
                2,
            ),
            Err(StoreError::Journal(JournalError::DirectorySyncFailed))
        );
        assert_eq!(
            store.admission_status(),
            AdmissionStatus::Blocked(AdmissionBlock::JournalFailure)
        );
        assert_eq!(
            store.transition(
                allocated.job_id(),
                1,
                principal(),
                allocated.boot_id(),
                JobState::InputSealed,
                3,
            ),
            Err(StoreError::AdmissionClosed)
        );
        drop(store);

        let mut restored = fixture.pending_store(limits());
        let committed = restored
            .record(allocated.job_id())
            .expect("committed record");
        assert_eq!(committed.revision(), 2);
        assert_eq!(committed.state(), JobState::InputSealed);
        assert_eq!(
            restored.finish_reconciliation(false),
            Ok(AdmissionStatus::Open)
        );
    }

    #[test]
    fn invalid_transition_closes_public_mutations() {
        let fixture = Fixture::new();
        let mut store = fixture.ready_store(limits());
        let allocated = store
            .allocate([11; 16], principal(), [12; 16], reservation(1, 1, 1), 1)
            .expect("allocate");
        assert_eq!(
            store.transition(
                allocated.job_id(),
                1,
                principal(),
                allocated.boot_id(),
                JobState::Running,
                2,
            ),
            Err(StoreError::State(StateError::InvalidTransition))
        );
        assert_eq!(
            store.admission_status(),
            AdmissionStatus::Blocked(AdmissionBlock::InvalidTransition)
        );
        assert_eq!(
            store.transition(
                allocated.job_id(),
                1,
                principal(),
                allocated.boot_id(),
                JobState::InputSealed,
                3,
            ),
            Err(StoreError::AdmissionClosed)
        );
    }

    #[test]
    fn unknown_transition_closes_public_mutations() {
        let fixture = Fixture::new();
        let mut store = fixture.ready_store(limits());
        let allocated = store
            .allocate([15; 16], principal(), [16; 16], reservation(1, 1, 1), 1)
            .expect("allocate");
        assert_eq!(
            store.transition(
                allocated.job_id(),
                1,
                principal(),
                allocated.boot_id(),
                JobState::Unknown,
                2,
            ),
            Err(StoreError::State(StateError::InvalidTransition))
        );
        assert_eq!(
            store.admission_status(),
            AdmissionStatus::Blocked(AdmissionBlock::InvalidTransition)
        );
    }

    #[test]
    fn a_second_store_cannot_bypass_cas_or_budgets() {
        let fixture = Fixture::new();
        let first = fixture.pending_store(limits());
        assert!(matches!(
            BrokerStore::open(&fixture.root, fixture.owner, limits()),
            Err(StoreOpenError::Journal(JournalError::LockUnavailable))
        ));
        drop(first);
        assert!(BrokerStore::open(&fixture.root, fixture.owner, limits()).is_ok());
    }

    fn limits() -> BudgetLimits {
        BudgetLimits::create(4, 4, 1000, 100, 1000, 100).expect("limits")
    }

    fn reservation(bytes: u64, inodes: u64, mounts: u32) -> Reservation {
        Reservation::create(bytes, inodes, mounts).expect("reservation")
    }

    const fn principal() -> Principal {
        Principal::create(1000, 1000)
    }

    struct Fixture {
        root: std::path::PathBuf,
        owner: u32,
    }

    impl Fixture {
        fn new() -> Self {
            let id = NEXT_FIXTURE.fetch_add(1, Ordering::Relaxed);
            let root = std::env::temp_dir().join(format!(
                "storecore-media-broker-store-{}-{id}",
                std::process::id()
            ));
            fs::create_dir(&root).expect("create fixture");
            fs::set_permissions(&root, fs::Permissions::from_mode(0o700)).expect("permissions");
            Self {
                root,
                owner: rustix::process::geteuid().as_raw(),
            }
        }

        fn pending_store(&self, limits: BudgetLimits) -> BrokerStore {
            BrokerStore::open(&self.root, self.owner, limits).expect("store")
        }

        fn ready_store(&self, limits: BudgetLimits) -> BrokerStore {
            let mut store = self.pending_store(limits);
            assert_eq!(
                store.finish_reconciliation(false),
                Ok(AdmissionStatus::Open)
            );
            store
        }
    }

    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.root);
        }
    }
}
