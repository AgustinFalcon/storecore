use std::path::PathBuf;

use crate::runtime::{ApprovedRuntime, RuntimeError};
use crate::state::{JobId, JobRecord, JobState, Principal};
use crate::store::{AdmissionStatus, BrokerStore, StoreError};
use crate::systemd::{SystemdControl, SystemdError, TransientUnits};
use crate::unit::{UnitKind, UnitState};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum DaemonError {
    Store(StoreError),
    Systemd(SystemdError),
    Runtime(RuntimeError),
    NotSealed,
    AttestationFailed,
    RollbackFailed,
}

pub struct BrokerDaemon<Control> {
    store: BrokerStore,
    systemd: Control,
    runtime: ApprovedRuntime,
    mount_root: PathBuf,
    worker: Principal,
}

impl<Control: SystemdControl> BrokerDaemon<Control> {
    #[must_use]
    pub fn new(
        store: BrokerStore,
        systemd: Control,
        runtime: ApprovedRuntime,
        mount_root: PathBuf,
        worker: Principal,
    ) -> Self {
        Self {
            store,
            systemd,
            runtime,
            mount_root,
            worker,
        }
    }

    #[must_use]
    pub const fn store(&self) -> &BrokerStore {
        &self.store
    }

    #[must_use]
    pub fn store_mut(&mut self) -> &mut BrokerStore {
        &mut self.store
    }

    #[must_use]
    pub fn systemd(&self) -> &Control {
        &self.systemd
    }

    /// Starts PID-1 transient mount and worker units for a sealed job.
    ///
    /// Unit names, `Where` and `ExecStart` are derived internally. A non-`Active`
    /// attestation fails closed and does not invent `Running`.
    ///
    /// # Errors
    ///
    /// Returns a closed [`DaemonError`] without claiming a live runtime when
    /// the durable transition or D-Bus attestation cannot be proven.
    pub fn start(
        &mut self,
        job_id: JobId,
        expected_revision: u64,
        principal: Principal,
        now_ms: u64,
    ) -> Result<JobRecord, DaemonError> {
        let current = self.store.record(job_id).map_err(DaemonError::Store)?;
        if current.principal() != principal {
            return Err(DaemonError::Store(StoreError::AuthorityDenied));
        }
        if current.state() != JobState::InputSealed {
            return Err(DaemonError::NotSealed);
        }
        self.runtime.confirm().map_err(DaemonError::Runtime)?;
        let starting = self
            .store
            .transition(
                job_id,
                expected_revision,
                principal,
                current.boot_id(),
                JobState::Starting,
                now_ms,
            )
            .map_err(DaemonError::Store)?;
        let spec =
            TransientUnits::derive(job_id, self.mount_root.clone(), self.worker, &self.runtime);
        if let Err(error) = self.start_kind(UnitKind::Mount, &spec) {
            return Err(self.abort_start(error, &spec, &starting, now_ms));
        }
        if let Err(error) = self.start_kind(UnitKind::Worker, &spec) {
            return Err(self.abort_start(error, &spec, &starting, now_ms));
        }
        match self.store.transition(
            job_id,
            starting.revision(),
            principal,
            starting.boot_id(),
            JobState::Running,
            now_ms,
        ) {
            Ok(record) => Ok(record),
            Err(error) => {
                Err(self.abort_start(DaemonError::Store(error), &spec, &starting, now_ms))
            }
        }
    }
}

impl<Control: SystemdControl> BrokerDaemon<Control> {
    fn start_kind(&mut self, kind: UnitKind, spec: &TransientUnits) -> Result<(), DaemonError> {
        match self.systemd.start_transient(kind, spec) {
            Ok(UnitState::Active) => {}
            Ok(UnitState::Unknown) => return Err(DaemonError::Systemd(SystemdError::UnknownState)),
            Ok(_) => return Err(DaemonError::AttestationFailed),
            Err(error) => return Err(DaemonError::Systemd(error)),
        }
        match self.systemd.attest(kind, spec) {
            Ok(state) if state.is_active() => Ok(()),
            Ok(UnitState::Unknown) => Err(DaemonError::Systemd(SystemdError::UnknownState)),
            Ok(_) => Err(DaemonError::AttestationFailed),
            Err(error) => Err(DaemonError::Systemd(error)),
        }
    }

    fn abort_start(
        &mut self,
        error: DaemonError,
        spec: &TransientUnits,
        starting: &JobRecord,
        now_ms: u64,
    ) -> DaemonError {
        self.rollback_units(spec, starting, now_ms)
            .err()
            .unwrap_or(error)
    }

    fn rollback_units(
        &mut self,
        spec: &TransientUnits,
        starting: &JobRecord,
        now_ms: u64,
    ) -> Result<(), DaemonError> {
        let worker_cleared = unit_cleared(self.systemd.stop(UnitKind::Worker, spec));
        let mount_cleared = unit_cleared(self.systemd.stop(UnitKind::Mount, spec));
        if worker_cleared && mount_cleared {
            if self.store.admission_status() != AdmissionStatus::Open {
                return Ok(());
            }
            self.store
                .transition(
                    starting.job_id(),
                    starting.revision(),
                    starting.principal(),
                    starting.boot_id(),
                    JobState::Terminal,
                    now_ms,
                )
                .map(|_| ())
                .map_err(DaemonError::Store)
        } else {
            self.store
                .quarantine_and_latch(starting.job_id(), starting.revision(), now_ms)
                .map_err(DaemonError::Store)?;
            Err(DaemonError::RollbackFailed)
        }
    }
}

fn unit_cleared(result: Result<UnitState, SystemdError>) -> bool {
    matches!(result, Ok(UnitState::Inactive | UnitState::Failed))
}

#[cfg(test)]
mod tests {
    use super::{BrokerDaemon, DaemonError};
    use crate::budget::BudgetLimits;
    use crate::journal::{DurableBlockReason, JournalError};
    use crate::reconcile::{ReconcileStatus, RuntimeAdapter, reconcile};
    use crate::runtime::{ApprovedRuntime, RuntimeError};
    use crate::state::{JobId, JobState, Principal, Reservation};
    use crate::store::{AdmissionBlock, AdmissionStatus, BrokerStore, StoreError};
    use crate::systemd::{FakeSystemd, SystemdError};
    use crate::unit::{DerivedUnits, UnitKind, UnitState};
    use sha2::{Digest, Sha256};
    use std::fs::{self, OpenOptions};
    use std::io::Write;
    use std::os::unix::fs::{OpenOptionsExt, PermissionsExt};
    use std::sync::atomic::{AtomicU64, Ordering};

    static NEXT: AtomicU64 = AtomicU64::new(1);

    #[test]
    fn start_derives_units_and_reaches_running() {
        let mut fixture = Fixture::new();
        let allocated = fixture
            .daemon
            .store_mut()
            .allocate([9; 16], principal(), [3; 16], reservation(), 1)
            .expect("allocate");
        let sealed = fixture
            .daemon
            .store_mut()
            .transition(
                allocated.job_id(),
                1,
                principal(),
                allocated.boot_id(),
                JobState::InputSealed,
                2,
            )
            .expect("seal");
        let running = fixture
            .daemon
            .start(sealed.job_id(), sealed.revision(), principal(), 3)
            .expect("start");
        assert_eq!(running.state(), JobState::Running);
    }

    #[test]
    fn start_rejects_unsealed_jobs_without_dbus() {
        let mut fixture = Fixture::new();
        let allocated = fixture
            .daemon
            .store_mut()
            .allocate([10; 16], principal(), [4; 16], reservation(), 1)
            .expect("allocate");
        assert_eq!(
            fixture.daemon.start(allocated.job_id(), 1, principal(), 2),
            Err(DaemonError::NotSealed)
        );
        assert_eq!(
            fixture
                .daemon
                .store()
                .record(allocated.job_id())
                .expect("record")
                .state(),
            JobState::Allocated
        );
    }

    #[test]
    fn start_stops_units_when_worker_fails_after_mount() {
        let mut fixture = Fixture::failing(UnitKind::Worker);
        let allocated = fixture
            .daemon
            .store_mut()
            .allocate([11; 16], principal(), [5; 16], reservation(), 1)
            .expect("allocate");
        let sealed = fixture
            .daemon
            .store_mut()
            .transition(
                allocated.job_id(),
                1,
                principal(),
                allocated.boot_id(),
                JobState::InputSealed,
                2,
            )
            .expect("seal");
        assert_eq!(
            fixture
                .daemon
                .start(sealed.job_id(), sealed.revision(), principal(), 3),
            Err(DaemonError::Systemd(SystemdError::AttestationFailed))
        );
        let names = DerivedUnits::from_job(sealed.job_id());
        assert_ne!(
            fixture.daemon.systemd().recorded(names.mount()),
            Some(UnitState::Active)
        );
        assert_ne!(
            fixture.daemon.systemd().recorded(names.worker()),
            Some(UnitState::Active)
        );
        assert_eq!(
            fixture
                .daemon
                .store()
                .record(sealed.job_id())
                .expect("record")
                .state(),
            JobState::Terminal
        );
        assert_eq!(
            fixture.daemon.store().admission_status(),
            AdmissionStatus::Open
        );
    }

    #[test]
    fn start_blocks_admission_when_stop_is_not_attested() {
        let mut fixture = Fixture::failing_stop(UnitKind::Worker);
        let allocated = fixture
            .daemon
            .store_mut()
            .allocate([12; 16], principal(), [6; 16], reservation(), 1)
            .expect("allocate");
        let sealed = fixture
            .daemon
            .store_mut()
            .transition(
                allocated.job_id(),
                1,
                principal(),
                allocated.boot_id(),
                JobState::InputSealed,
                2,
            )
            .expect("seal");
        assert_eq!(
            fixture
                .daemon
                .start(sealed.job_id(), sealed.revision(), principal(), 3),
            Err(DaemonError::RollbackFailed)
        );
        let names = DerivedUnits::from_job(sealed.job_id());
        assert_eq!(
            fixture.daemon.systemd().recorded(names.mount()),
            Some(UnitState::Active)
        );
        assert_eq!(
            fixture
                .daemon
                .store()
                .record(sealed.job_id())
                .expect("record")
                .state(),
            JobState::Quarantined
        );
        assert_eq!(
            fixture.daemon.store().admission_status(),
            AdmissionStatus::Blocked(AdmissionBlock::ReconciliationMismatch)
        );
        assert_eq!(
            fixture.daemon.store().durable_block(),
            Some(DurableBlockReason::ReconciliationMismatch)
        );
    }

    #[test]
    fn start_quarantines_when_stop_stays_in_transition() {
        for (suffix, state) in [
            (15_u8, UnitState::Activating),
            (16, UnitState::Deactivating),
        ] {
            let mut fixture = Fixture::stop_as(UnitKind::Worker, state);
            let allocated = fixture
                .daemon
                .store_mut()
                .allocate([suffix; 16], principal(), [suffix; 16], reservation(), 1)
                .expect("allocate");
            let sealed = fixture
                .daemon
                .store_mut()
                .transition(
                    allocated.job_id(),
                    1,
                    principal(),
                    allocated.boot_id(),
                    JobState::InputSealed,
                    2,
                )
                .expect("seal");
            assert_eq!(
                fixture
                    .daemon
                    .start(sealed.job_id(), sealed.revision(), principal(), 3),
                Err(DaemonError::RollbackFailed)
            );
            assert_eq!(
                fixture
                    .daemon
                    .store()
                    .record(sealed.job_id())
                    .expect("record")
                    .state(),
                JobState::Quarantined
            );
            assert_eq!(
                fixture.daemon.store().admission_status(),
                AdmissionStatus::Blocked(AdmissionBlock::ReconciliationMismatch)
            );
            assert_eq!(
                fixture.daemon.store().durable_block(),
                Some(DurableBlockReason::ReconciliationMismatch)
            );
        }
    }

    #[test]
    fn start_quarantines_when_running_persist_and_stop_fail() {
        let mut fixture = Fixture::stop_fails();
        let allocated = fixture
            .daemon
            .store_mut()
            .allocate([17; 16], principal(), [9; 16], reservation(), 1)
            .expect("allocate");
        let sealed = fixture
            .daemon
            .store_mut()
            .transition(
                allocated.job_id(),
                1,
                principal(),
                allocated.boot_id(),
                JobState::InputSealed,
                2,
            )
            .expect("seal");
        fixture
            .daemon
            .store_mut()
            .fail_persist_after_rename_skipping(1);
        assert_eq!(
            fixture
                .daemon
                .start(sealed.job_id(), sealed.revision(), principal(), 3),
            Err(DaemonError::RollbackFailed)
        );
        assert_eq!(
            fixture
                .daemon
                .store()
                .record(sealed.job_id())
                .expect("record")
                .state(),
            JobState::Quarantined
        );
        assert_eq!(
            fixture.daemon.store().admission_status(),
            AdmissionStatus::Blocked(AdmissionBlock::ReconciliationMismatch)
        );
        assert_eq!(
            fixture.daemon.store().durable_block(),
            Some(DurableBlockReason::ReconciliationMismatch)
        );
    }

    #[test]
    fn start_stops_units_when_running_persist_fails() {
        let mut fixture = Fixture::new();
        let allocated = fixture
            .daemon
            .store_mut()
            .allocate([13; 16], principal(), [7; 16], reservation(), 1)
            .expect("allocate");
        let sealed = fixture
            .daemon
            .store_mut()
            .transition(
                allocated.job_id(),
                1,
                principal(),
                allocated.boot_id(),
                JobState::InputSealed,
                2,
            )
            .expect("seal");
        fixture
            .daemon
            .store_mut()
            .fail_persist_after_rename_skipping(1);
        assert_eq!(
            fixture
                .daemon
                .start(sealed.job_id(), sealed.revision(), principal(), 3),
            Err(DaemonError::Store(StoreError::Journal(
                JournalError::DirectorySyncFailed
            )))
        );
        let names = DerivedUnits::from_job(sealed.job_id());
        assert_ne!(
            fixture.daemon.systemd().recorded(names.mount()),
            Some(UnitState::Active)
        );
        assert_ne!(
            fixture.daemon.systemd().recorded(names.worker()),
            Some(UnitState::Active)
        );
        assert_eq!(
            fixture
                .daemon
                .store()
                .record(sealed.job_id())
                .expect("record")
                .state(),
            JobState::Starting
        );
        assert_eq!(
            fixture.daemon.store().admission_status(),
            AdmissionStatus::Blocked(AdmissionBlock::JournalFailure)
        );
    }

    #[test]
    fn start_rejects_replaced_runtime_before_starting() {
        let mut fixture = Fixture::new();
        let allocated = fixture
            .daemon
            .store_mut()
            .allocate([14; 16], principal(), [8; 16], reservation(), 1)
            .expect("allocate");
        let sealed = fixture
            .daemon
            .store_mut()
            .transition(
                allocated.job_id(),
                1,
                principal(),
                allocated.boot_id(),
                JobState::InputSealed,
                2,
            )
            .expect("seal");
        fs::remove_file(&fixture.java).expect("unlink");
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .mode(0o555)
            .open(&fixture.java)
            .expect("replace");
        file.write_all(b"java-replaced").expect("write");
        file.sync_all().expect("sync");
        assert_eq!(
            fixture
                .daemon
                .start(sealed.job_id(), sealed.revision(), principal(), 3),
            Err(DaemonError::Runtime(RuntimeError::DigestMismatch))
        );
        assert_eq!(
            fixture
                .daemon
                .store()
                .record(sealed.job_id())
                .expect("record")
                .state(),
            JobState::InputSealed
        );
        assert_eq!(
            fixture.daemon.store().admission_status(),
            AdmissionStatus::Open
        );
    }

    const fn principal() -> Principal {
        Principal::create(1000, 1000)
    }

    fn reservation() -> Reservation {
        Reservation::create(100, 4, 1).expect("reservation")
    }

    struct Fixture {
        daemon: BrokerDaemon<FakeSystemd>,
        root: std::path::PathBuf,
        java: std::path::PathBuf,
    }

    impl Fixture {
        fn new() -> Self {
            Self::with_systemd(FakeSystemd::new())
        }

        fn failing(kind: UnitKind) -> Self {
            Self::with_systemd(FakeSystemd::new().fail_kind(kind))
        }

        fn failing_stop(kind: UnitKind) -> Self {
            Self::with_systemd(FakeSystemd::new().fail_kind(kind).fail_stop())
        }

        fn stop_fails() -> Self {
            Self::with_systemd(FakeSystemd::new().fail_stop())
        }

        fn stop_as(kind: UnitKind, state: UnitState) -> Self {
            Self::with_systemd(FakeSystemd::new().fail_kind(kind).stop_as(state))
        }

        fn with_systemd(systemd: FakeSystemd) -> Self {
            let id = NEXT.fetch_add(1, Ordering::Relaxed);
            let root = std::env::temp_dir().join(format!(
                "storecore-media-broker-daemon-{}-{id}",
                std::process::id()
            ));
            fs::create_dir(&root).expect("root");
            fs::set_permissions(&root, fs::Permissions::from_mode(0o700)).expect("perm");
            let journal = root.join("journal");
            fs::create_dir(&journal).expect("journal");
            fs::set_permissions(&journal, fs::Permissions::from_mode(0o700)).expect("jperm");
            let owner = rustix::process::geteuid().as_raw();
            let mut store = BrokerStore::open(
                &journal,
                owner,
                BudgetLimits::create(8, 8, 4096, 256, 4096, 256).expect("limits"),
            )
            .expect("store");
            let mut empty = EmptyAdapter;
            let report = reconcile(&mut store, &mut empty, 1).expect("reconcile");
            assert_eq!(report.status(), ReconcileStatus::Clean);
            assert_eq!(store.admission_status(), AdmissionStatus::Open);

            let java = root.join("java");
            let jar = root.join("worker.jar");
            let java_digest = write(&java, 0o555, b"java");
            let jar_digest = write(&jar, 0o444, b"jar");
            let runtime = ApprovedRuntime::open(&java, &jar, owner, java_digest, jar_digest)
                .expect("runtime");
            let daemon = BrokerDaemon::new(
                store,
                systemd,
                runtime,
                root.join("mnt"),
                Principal::create(2000, 2000),
            );
            Self { daemon, root, java }
        }
    }

    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.root);
        }
    }

    struct EmptyAdapter;

    impl RuntimeAdapter for EmptyAdapter {
        fn enumerate(
            &mut self,
        ) -> Result<Vec<crate::reconcile::ObservedJob>, crate::reconcile::AdapterError> {
            Ok(Vec::new())
        }

        fn terminate(
            &mut self,
            _job_id: JobId,
        ) -> Result<crate::reconcile::RuntimeState, crate::reconcile::AdapterError> {
            Err(crate::reconcile::AdapterError::Unavailable)
        }
    }

    fn write(path: &std::path::Path, mode: u32, bytes: &[u8]) -> [u8; 32] {
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .mode(mode)
            .open(path)
            .expect("create");
        file.write_all(bytes).expect("write");
        file.sync_all().expect("sync");
        Sha256::digest(bytes).into()
    }
}
