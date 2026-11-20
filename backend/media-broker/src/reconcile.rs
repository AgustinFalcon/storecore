use std::collections::{BTreeMap, BTreeSet};

use crate::journal::DurableBlockReason;
use crate::state::{JobId, JobState};
use crate::store::{AdmissionBlock, BrokerStore, StoreError};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum RuntimeState {
    Absent,
    Active,
    Terminal,
    Unknown,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct ObservedJob {
    job_id: JobId,
    state: RuntimeState,
}

impl ObservedJob {
    #[must_use]
    pub const fn create(job_id: JobId, state: RuntimeState) -> Self {
        Self { job_id, state }
    }

    #[must_use]
    pub const fn job_id(self) -> JobId {
        self.job_id
    }
    #[must_use]
    pub const fn state(self) -> RuntimeState {
        self.state
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum AdapterError {
    Unavailable,
}

pub trait RuntimeAdapter {
    /// Enumerates the complete broker-owned aggregate runtime inventory. One
    /// state represents the exact unit, cgroup and mount identity of a job;
    /// adapters must return `Unknown` rather than omit unverifiable evidence.
    ///
    /// # Errors
    ///
    /// Returns [`AdapterError::Unavailable`] when completeness cannot be
    /// proven.
    fn enumerate(&mut self) -> Result<Vec<ObservedJob>, AdapterError>;

    /// Terminates one internally derived runtime identity.
    ///
    /// # Errors
    ///
    /// Returns [`AdapterError::Unavailable`] when termination cannot be
    /// requested or verified.
    fn terminate(&mut self, job_id: JobId) -> Result<RuntimeState, AdapterError>;
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ReconcileStatus {
    Clean,
    AdmissionBlocked,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct ReconcileReport {
    status: ReconcileStatus,
    terminated: u32,
    transitioned: u32,
    mismatches: u32,
}

impl ReconcileReport {
    #[must_use]
    pub const fn status(self) -> ReconcileStatus {
        self.status
    }
    #[must_use]
    pub const fn terminated(self) -> u32 {
        self.terminated
    }
    #[must_use]
    pub const fn transitioned(self) -> u32 {
        self.transitioned
    }
    #[must_use]
    pub const fn mismatches(self) -> u32 {
        self.mismatches
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ReconcileError {
    InventoryUnavailable,
    DuplicateObservation,
    UnknownObservation,
    TerminationUnverified,
    Store(StoreError),
}

/// Reconciles durable jobs against an exact fake/real runtime inventory.
///
/// # Errors
///
/// Any unavailable/unknown observation, duplicate identity, unverified
/// termination or durable transition failure closes admission and returns a
/// closed [`ReconcileError`].
pub fn reconcile(
    store: &mut BrokerStore,
    adapter: &mut impl RuntimeAdapter,
    now_ms: u64,
) -> Result<ReconcileReport, ReconcileError> {
    store
        .require_recovery_pending()
        .map_err(ReconcileError::Store)?;
    let observations = adapter.enumerate().map_err(|_| {
        fail_closed(
            store,
            DurableBlockReason::ReconciliationUnavailable,
            AdmissionBlock::ReconciliationUnavailable,
            ReconcileError::InventoryUnavailable,
        )
    })?;
    let mut inventory = BTreeMap::new();
    for observation in observations {
        if observation.state() == RuntimeState::Unknown {
            return Err(fail_closed(
                store,
                DurableBlockReason::ReconciliationUnavailable,
                AdmissionBlock::ReconciliationUnavailable,
                ReconcileError::UnknownObservation,
            ));
        }
        if inventory
            .insert(observation.job_id(), observation.state())
            .is_some()
        {
            return Err(fail_closed(
                store,
                DurableBlockReason::ReconciliationMismatch,
                AdmissionBlock::ReconciliationMismatch,
                ReconcileError::DuplicateObservation,
            ));
        }
    }

    let records: Vec<_> = store.records().collect();
    let durable_ids: BTreeSet<_> = records.iter().map(|record| record.job_id()).collect();
    let mut report = MutableReport::default();

    for (job_id, state) in inventory
        .iter()
        .filter(|(job_id, _)| !durable_ids.contains(job_id))
    {
        record_mismatch(store, &mut report)?;
        if *state == RuntimeState::Active {
            terminate_verified(store, adapter, *job_id)?;
            report.terminated += 1;
        }
    }

    for record in records {
        let observed = inventory
            .get(&record.job_id())
            .copied()
            .unwrap_or(RuntimeState::Absent);
        if record.state().expects_runtime() {
            match observed {
                RuntimeState::Active => {
                    terminate_verified(store, adapter, record.job_id())?;
                    report.terminated += 1;
                    transition(
                        store,
                        record.job_id(),
                        record.revision(),
                        JobState::Terminal,
                        now_ms,
                    )?;
                    report.transitioned += 1;
                }
                RuntimeState::Terminal => {
                    transition(
                        store,
                        record.job_id(),
                        record.revision(),
                        JobState::Terminal,
                        now_ms,
                    )?;
                    report.transitioned += 1;
                }
                RuntimeState::Absent => {
                    record_mismatch(store, &mut report)?;
                    quarantine(store, record.job_id(), record.revision(), now_ms)?;
                    report.transitioned += 1;
                }
                RuntimeState::Unknown => {
                    unreachable!("unknown observations are rejected at the boundary")
                }
            }
        } else {
            reconcile_non_running(store, adapter, record, observed, now_ms, &mut report)?;
        }
    }

    let admission = store
        .finish_reconciliation(report.mismatches != 0)
        .map_err(ReconcileError::Store)?;
    Ok(report.freeze(admission))
}

fn reconcile_non_running(
    store: &mut BrokerStore,
    adapter: &mut impl RuntimeAdapter,
    record: crate::state::JobRecord,
    observed: RuntimeState,
    now_ms: u64,
    report: &mut MutableReport,
) -> Result<(), ReconcileError> {
    let consistent = matches!(
        (record.state(), observed),
        (
            JobState::Allocated | JobState::InputSealed,
            RuntimeState::Absent
        ) | (
            JobState::Terminal,
            RuntimeState::Absent | RuntimeState::Terminal
        )
    );
    if consistent {
        return Ok(());
    }
    record_mismatch(store, report)?;
    if observed == RuntimeState::Active {
        terminate_verified(store, adapter, record.job_id())?;
        report.terminated += 1;
    }
    if record.state() != JobState::Quarantined {
        quarantine(store, record.job_id(), record.revision(), now_ms)?;
        report.transitioned += 1;
    }
    Ok(())
}

fn terminate_verified(
    store: &mut BrokerStore,
    adapter: &mut impl RuntimeAdapter,
    job_id: JobId,
) -> Result<(), ReconcileError> {
    if let Ok(RuntimeState::Terminal) = adapter.terminate(job_id) {
        Ok(())
    } else {
        Err(fail_closed(
            store,
            DurableBlockReason::ReconciliationUnavailable,
            AdmissionBlock::ReconciliationUnavailable,
            ReconcileError::TerminationUnverified,
        ))
    }
}

fn quarantine(
    store: &mut BrokerStore,
    job_id: JobId,
    revision: u64,
    now_ms: u64,
) -> Result<(), ReconcileError> {
    transition(store, job_id, revision, JobState::Quarantined, now_ms)
}

fn transition(
    store: &mut BrokerStore,
    job_id: JobId,
    revision: u64,
    next: JobState,
    now_ms: u64,
) -> Result<(), ReconcileError> {
    if let Err(error) = store.transition_reconciled(job_id, revision, next, now_ms) {
        Err(fail_closed(
            store,
            DurableBlockReason::ReconciliationUnavailable,
            AdmissionBlock::ReconciliationUnavailable,
            ReconcileError::Store(error),
        ))
    } else {
        Ok(())
    }
}

fn fail_closed(
    store: &mut BrokerStore,
    durable_reason: DurableBlockReason,
    admission_reason: AdmissionBlock,
    error: ReconcileError,
) -> ReconcileError {
    match store.block_durably(durable_reason, admission_reason) {
        Ok(()) => error,
        Err(store_error) => ReconcileError::Store(store_error),
    }
}

fn record_mismatch(
    store: &mut BrokerStore,
    report: &mut MutableReport,
) -> Result<(), ReconcileError> {
    store
        .persist_intervention(DurableBlockReason::ReconciliationMismatch)
        .map_err(ReconcileError::Store)?;
    report.mismatch();
    Ok(())
}

#[derive(Default)]
struct MutableReport {
    terminated: u32,
    transitioned: u32,
    mismatches: u32,
}

impl MutableReport {
    fn mismatch(&mut self) {
        self.mismatches += 1;
    }

    const fn freeze(self, admission: crate::store::AdmissionStatus) -> ReconcileReport {
        ReconcileReport {
            status: if self.mismatches == 0
                && matches!(admission, crate::store::AdmissionStatus::Open)
            {
                ReconcileStatus::Clean
            } else {
                ReconcileStatus::AdmissionBlocked
            },
            terminated: self.terminated,
            transitioned: self.transitioned,
            mismatches: self.mismatches,
        }
    }
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeMap;
    use std::fs;
    use std::os::unix::fs::PermissionsExt;
    use std::panic::{AssertUnwindSafe, catch_unwind};
    use std::sync::atomic::{AtomicU64, Ordering};

    use super::*;
    use crate::budget::BudgetLimits;
    use crate::state::{Principal, Reservation};
    use crate::store::{AdmissionStatus, BrokerStore};

    static NEXT_FIXTURE: AtomicU64 = AtomicU64::new(1);

    #[test]
    fn expected_active_runtime_is_terminated_and_made_terminal() {
        let fixture = Fixture::new();
        let mut active = fixture.ready_store();
        let running = running_job(&mut active, [1; 16]);
        drop(active);
        let mut store = fixture.pending_store();
        let mut adapter = FakeAdapter::with(running.job_id(), RuntimeState::Active);
        let report = reconcile(&mut store, &mut adapter, 5).expect("reconcile");
        assert_eq!(report.status(), ReconcileStatus::Clean);
        assert_eq!(report.terminated(), 1);
        assert_eq!(report.transitioned(), 1);
        assert_eq!(
            store.record(running.job_id()).expect("record").state(),
            JobState::Terminal
        );
        assert_eq!(store.admission_status(), AdmissionStatus::Open);
    }

    #[test]
    fn unexpected_runtime_is_terminated_quarantined_and_blocks_admission() {
        let fixture = Fixture::new();
        let mut active = fixture.ready_store();
        let allocated = active
            .allocate([2; 16], principal(), [9; 16], reservation(), 1)
            .expect("allocate");
        drop(active);
        let mut store = fixture.pending_store();
        let mut adapter = FakeAdapter::with(allocated.job_id(), RuntimeState::Active);
        let report = reconcile(&mut store, &mut adapter, 2).expect("reconcile");
        assert_eq!(report.status(), ReconcileStatus::AdmissionBlocked);
        assert_eq!(report.mismatches(), 1);
        assert_eq!(
            store.record(allocated.job_id()).expect("record").state(),
            JobState::Quarantined
        );
        assert_eq!(
            store.admission_status(),
            AdmissionStatus::Blocked(AdmissionBlock::ReconciliationMismatch)
        );
    }

    #[test]
    fn orphan_and_unknown_inventory_fail_closed() {
        let fixture = Fixture::new();
        let mut store = fixture.pending_store();
        let orphan = JobId::create([3; 16]).expect("job id");
        let mut adapter = FakeAdapter::with(orphan, RuntimeState::Terminal);
        let report = reconcile(&mut store, &mut adapter, 1).expect("orphan report");
        assert_eq!(report.status(), ReconcileStatus::AdmissionBlocked);

        let second = Fixture::new();
        let mut store = second.pending_store();
        let mut adapter = FakeAdapter::with(orphan, RuntimeState::Unknown);
        assert_eq!(
            reconcile(&mut store, &mut adapter, 1),
            Err(ReconcileError::UnknownObservation)
        );
        assert_eq!(
            store.admission_status(),
            AdmissionStatus::Blocked(AdmissionBlock::ReconciliationUnavailable)
        );
    }

    #[test]
    fn orphan_intervention_latch_survives_a_clean_restart_inventory() {
        let fixture = Fixture::new();
        let orphan = JobId::create([31; 16]).expect("job id");
        let mut store = fixture.pending_store();
        let mut adapter = FakeAdapter::with(orphan, RuntimeState::Active);
        let report = reconcile(&mut store, &mut adapter, 1).expect("orphan report");
        assert_eq!(report.status(), ReconcileStatus::AdmissionBlocked);
        assert_eq!(report.terminated(), 1);
        assert_eq!(report.mismatches(), 1);
        drop(store);

        let mut restored = fixture.pending_store();
        assert_eq!(
            restored.admission_status(),
            AdmissionStatus::RecoveryPending
        );
        let mut empty = FakeAdapter::empty();
        let report = reconcile(&mut restored, &mut empty, 2).expect("restart reconcile");
        assert_eq!(report.status(), ReconcileStatus::AdmissionBlocked);
        assert_eq!(report.mismatches(), 0);
        assert_eq!(
            restored.admission_status(),
            AdmissionStatus::Blocked(AdmissionBlock::ReconciliationMismatch)
        );
        assert_eq!(
            restored.allocate([32; 16], principal(), [33; 16], reservation(), 3),
            Err(StoreError::AdmissionClosed)
        );
    }

    #[test]
    fn intervention_is_durable_before_a_terminating_adapter_can_crash() {
        let fixture = Fixture::new();
        let orphan = JobId::create([36; 16]).expect("job id");
        let mut store = fixture.pending_store();
        let mut adapter = CrashOnTerminateAdapter { orphan };
        let crashed = catch_unwind(AssertUnwindSafe(|| {
            let _ = reconcile(&mut store, &mut adapter, 1);
        }));
        assert!(crashed.is_err());
        drop(store);

        let mut restored = fixture.pending_store();
        let mut empty = FakeAdapter::empty();
        let report = reconcile(&mut restored, &mut empty, 2).expect("restart reconcile");
        assert_eq!(report.status(), ReconcileStatus::AdmissionBlocked);
        assert_eq!(
            restored.admission_status(),
            AdmissionStatus::Blocked(AdmissionBlock::ReconciliationMismatch)
        );
    }

    #[test]
    fn latch_failure_prevents_runtime_termination() {
        let fixture = Fixture::new();
        let orphan = JobId::create([37; 16]).expect("job id");
        let mut store = fixture.pending_store();
        store.fail_next_latch_before_create();
        let mut adapter = FailIfTerminatedAdapter { orphan };
        assert_eq!(
            reconcile(&mut store, &mut adapter, 1),
            Err(ReconcileError::Store(StoreError::Journal(
                crate::journal::JournalError::WriteFailed
            )))
        );
        assert_eq!(
            store.admission_status(),
            AdmissionStatus::Blocked(AdmissionBlock::JournalFailure)
        );
    }

    #[test]
    fn reconciliation_rejects_non_pending_store_before_adapter_effects() {
        let fixture = Fixture::new();
        let mut store = fixture.ready_store();
        let mut adapter = PanicAdapter;
        assert_eq!(
            reconcile(&mut store, &mut adapter, 2),
            Err(ReconcileError::Store(StoreError::ReconciliationNotPending))
        );

        let allocated = store
            .allocate([34; 16], principal(), [35; 16], reservation(), 3)
            .expect("allocate");
        assert_eq!(
            store.transition(
                allocated.job_id(),
                allocated.revision(),
                principal(),
                allocated.boot_id(),
                JobState::Running,
                4,
            ),
            Err(StoreError::State(
                crate::state::StateError::InvalidTransition
            ))
        );
        assert_eq!(
            reconcile(&mut store, &mut adapter, 5),
            Err(ReconcileError::Store(StoreError::ReconciliationNotPending))
        );
    }

    #[test]
    fn unverified_termination_blocks_admission_without_faking_terminal() {
        let fixture = Fixture::new();
        let mut active = fixture.ready_store();
        let running = running_job(&mut active, [4; 16]);
        drop(active);
        let mut store = fixture.pending_store();
        let mut adapter = FakeAdapter::with(running.job_id(), RuntimeState::Active);
        adapter.termination.clear();

        assert_eq!(
            reconcile(&mut store, &mut adapter, 5),
            Err(ReconcileError::TerminationUnverified)
        );
        assert_eq!(
            store.record(running.job_id()).expect("record").state(),
            JobState::Running
        );
        assert_eq!(
            store.admission_status(),
            AdmissionStatus::Blocked(AdmissionBlock::ReconciliationUnavailable)
        );
    }

    #[test]
    fn persisted_quarantine_never_reopens_admission_after_restart() {
        let fixture = Fixture::new();
        let mut active = fixture.ready_store();
        let allocated = active
            .allocate([5; 16], principal(), [7; 16], reservation(), 1)
            .expect("allocate");
        active
            .transition(
                allocated.job_id(),
                1,
                principal(),
                allocated.boot_id(),
                JobState::Quarantined,
                2,
            )
            .expect("quarantine");
        drop(active);

        let mut store = fixture.pending_store();
        let mut adapter = FakeAdapter::empty();
        let report = reconcile(&mut store, &mut adapter, 3).expect("reconcile quarantine");
        assert_eq!(report.status(), ReconcileStatus::AdmissionBlocked);
        assert_eq!(report.mismatches(), 1);
        assert_eq!(
            store.admission_status(),
            AdmissionStatus::Blocked(AdmissionBlock::ReconciliationMismatch)
        );
        assert_eq!(
            store.allocate([6; 16], principal(), [8; 16], reservation(), 4),
            Err(StoreError::AdmissionClosed)
        );
    }

    fn running_job(store: &mut BrokerStore, job_id: [u8; 16]) -> crate::state::JobRecord {
        let allocated = store
            .allocate(job_id, principal(), [8; 16], reservation(), 1)
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
        let starting = store
            .transition(
                sealed.job_id(),
                2,
                principal(),
                sealed.boot_id(),
                JobState::Starting,
                3,
            )
            .expect("starting");
        store
            .transition(
                starting.job_id(),
                3,
                principal(),
                starting.boot_id(),
                JobState::Running,
                4,
            )
            .expect("running")
    }

    const fn principal() -> Principal {
        Principal::create(1000, 1000)
    }

    fn reservation() -> Reservation {
        Reservation::create(100, 4, 1).expect("reservation")
    }

    struct FakeAdapter {
        inventory: Vec<ObservedJob>,
        termination: BTreeMap<JobId, RuntimeState>,
    }

    impl FakeAdapter {
        const fn empty() -> Self {
            Self {
                inventory: Vec::new(),
                termination: BTreeMap::new(),
            }
        }

        fn with(job_id: JobId, state: RuntimeState) -> Self {
            let mut termination = BTreeMap::new();
            termination.insert(job_id, RuntimeState::Terminal);
            Self {
                inventory: vec![ObservedJob::create(job_id, state)],
                termination,
            }
        }
    }

    impl RuntimeAdapter for FakeAdapter {
        fn enumerate(&mut self) -> Result<Vec<ObservedJob>, AdapterError> {
            Ok(self.inventory.clone())
        }

        fn terminate(&mut self, job_id: JobId) -> Result<RuntimeState, AdapterError> {
            self.termination
                .get(&job_id)
                .copied()
                .ok_or(AdapterError::Unavailable)
        }
    }

    struct PanicAdapter;

    impl RuntimeAdapter for PanicAdapter {
        fn enumerate(&mut self) -> Result<Vec<ObservedJob>, AdapterError> {
            panic!("adapter enumeration must not run outside RecoveryPending")
        }

        fn terminate(&mut self, _job_id: JobId) -> Result<RuntimeState, AdapterError> {
            panic!("adapter termination must not run outside RecoveryPending")
        }
    }

    struct CrashOnTerminateAdapter {
        orphan: JobId,
    }

    impl RuntimeAdapter for CrashOnTerminateAdapter {
        fn enumerate(&mut self) -> Result<Vec<ObservedJob>, AdapterError> {
            Ok(vec![ObservedJob::create(self.orphan, RuntimeState::Active)])
        }

        fn terminate(&mut self, _job_id: JobId) -> Result<RuntimeState, AdapterError> {
            panic!("simulated crash after the runtime termination effect")
        }
    }

    struct FailIfTerminatedAdapter {
        orphan: JobId,
    }

    impl RuntimeAdapter for FailIfTerminatedAdapter {
        fn enumerate(&mut self) -> Result<Vec<ObservedJob>, AdapterError> {
            Ok(vec![ObservedJob::create(self.orphan, RuntimeState::Active)])
        }

        fn terminate(&mut self, _job_id: JobId) -> Result<RuntimeState, AdapterError> {
            panic!("termination must not run before intervention is durable")
        }
    }

    struct Fixture {
        root: std::path::PathBuf,
        owner: u32,
    }

    impl Fixture {
        fn new() -> Self {
            let id = NEXT_FIXTURE.fetch_add(1, Ordering::Relaxed);
            let root = std::env::temp_dir().join(format!(
                "storecore-media-broker-reconcile-{}-{id}",
                std::process::id()
            ));
            fs::create_dir(&root).expect("create fixture");
            fs::set_permissions(&root, fs::Permissions::from_mode(0o700)).expect("permissions");
            Self {
                root,
                owner: rustix::process::geteuid().as_raw(),
            }
        }

        fn pending_store(&self) -> BrokerStore {
            BrokerStore::open(
                &self.root,
                self.owner,
                BudgetLimits::create(8, 8, 4096, 256, 4096, 256).expect("limits"),
            )
            .expect("store")
        }

        fn ready_store(&self) -> BrokerStore {
            let mut store = self.pending_store();
            let mut adapter = FakeAdapter::empty();
            let report = reconcile(&mut store, &mut adapter, 1).expect("initial reconcile");
            assert_eq!(report.status(), ReconcileStatus::Clean);
            store
        }
    }

    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.root);
        }
    }
}
