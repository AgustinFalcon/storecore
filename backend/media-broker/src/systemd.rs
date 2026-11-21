use std::collections::BTreeMap;
use std::path::PathBuf;

use crate::runtime::ApprovedRuntime;
use crate::state::{JobId, Principal};
use crate::unit::{DerivedUnits, UnitKind, UnitName, UnitState};

pub const MOUNT_BYTES: u64 = 48 * 1024 * 1024;
pub const MOUNT_INODES: u64 = 1024;
const TMPFS_OPTIONS: &[u8] = b"nosuid,nodev,noexec,size=48M,nr_inodes=1024";

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum DbusMethod {
    StartTransientUnit,
    StopUnit,
    GetUnit,
    Unknown,
}

impl DbusMethod {
    #[must_use]
    pub const fn from_wire(value: u8) -> Self {
        match value {
            1 => Self::StartTransientUnit,
            2 => Self::StopUnit,
            3 => Self::GetUnit,
            _ => Self::Unknown,
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum SystemdError {
    UnknownMethod,
    Unavailable,
    UnknownState,
    UnexpectedKind,
    AttestationFailed,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MountSpec {
    name: UnitName,
    what: &'static [u8],
    options: &'static [u8],
    where_path: PathBuf,
}

impl MountSpec {
    #[must_use]
    pub const fn name(&self) -> UnitName {
        self.name
    }
    #[must_use]
    pub const fn what(&self) -> &'static [u8] {
        self.what
    }
    #[must_use]
    pub const fn options(&self) -> &'static [u8] {
        self.options
    }
    #[must_use]
    pub fn where_path(&self) -> &std::path::Path {
        &self.where_path
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct WorkerSpec {
    name: UnitName,
    worker: Principal,
    java: PathBuf,
    jar: PathBuf,
    java_digest: [u8; 32],
    jar_digest: [u8; 32],
}

impl WorkerSpec {
    #[must_use]
    pub const fn name(&self) -> UnitName {
        self.name
    }
    #[must_use]
    pub const fn worker(&self) -> Principal {
        self.worker
    }
    #[must_use]
    pub fn java(&self) -> &std::path::Path {
        &self.java
    }
    #[must_use]
    pub fn jar(&self) -> &std::path::Path {
        &self.jar
    }
    #[must_use]
    pub const fn java_digest(&self) -> [u8; 32] {
        self.java_digest
    }
    #[must_use]
    pub const fn jar_digest(&self) -> [u8; 32] {
        self.jar_digest
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TransientUnits {
    mount: MountSpec,
    worker: WorkerSpec,
}

impl TransientUnits {
    /// Derives mount and worker units exclusively from the job identity and
    /// root-owned configuration. Callers cannot supply unit names, `Where` or
    /// `ExecStart`.
    #[must_use]
    pub fn derive(
        job_id: JobId,
        mount_root: PathBuf,
        worker: Principal,
        runtime: &ApprovedRuntime,
    ) -> Self {
        let names = DerivedUnits::from_job(job_id);
        let mut where_path = mount_root;
        where_path.push(hex_job(job_id));
        Self {
            mount: MountSpec {
                name: names.mount(),
                what: b"tmpfs",
                options: TMPFS_OPTIONS,
                where_path,
            },
            worker: WorkerSpec {
                name: names.worker(),
                worker,
                java: runtime.java_path().to_path_buf(),
                jar: runtime.jar_path().to_path_buf(),
                java_digest: runtime.java().digest(),
                jar_digest: runtime.jar().digest(),
            },
        }
    }

    #[must_use]
    pub const fn mount(&self) -> &MountSpec {
        &self.mount
    }

    #[must_use]
    pub const fn worker(&self) -> &WorkerSpec {
        &self.worker
    }
}

pub trait SystemdControl {
    /// Starts one internally derived transient unit through PID 1.
    ///
    /// # Errors
    ///
    /// Returns [`SystemdError::Unavailable`] or [`SystemdError::UnknownState`]
    /// when the D-Bus result cannot be proven.
    fn start_transient(
        &mut self,
        kind: UnitKind,
        spec: &TransientUnits,
    ) -> Result<UnitState, SystemdError>;

    /// Stops one internally derived unit and verifies it left `Active`.
    ///
    /// # Errors
    ///
    /// Returns a closed [`SystemdError`] when stop or attestation fails.
    fn stop(&mut self, kind: UnitKind, spec: &TransientUnits) -> Result<UnitState, SystemdError>;

    /// Reads the effective unit state. Unknown is fail-closed.
    ///
    /// # Errors
    ///
    /// Returns [`SystemdError`] when the inventory cannot be attested.
    fn attest(&mut self, kind: UnitKind, spec: &TransientUnits) -> Result<UnitState, SystemdError>;
}

#[derive(Default)]
pub struct FakeSystemd {
    units: BTreeMap<Vec<u8>, UnitState>,
    fail_kind: Option<UnitKind>,
    fail_stop: bool,
    stop_as: Option<UnitState>,
}

impl FakeSystemd {
    #[must_use]
    pub fn new() -> Self {
        Self::default()
    }

    #[must_use]
    pub fn fail_kind(mut self, kind: UnitKind) -> Self {
        self.fail_kind = Some(kind);
        self
    }

    #[must_use]
    pub fn fail_stop(mut self) -> Self {
        self.fail_stop = true;
        self
    }

    #[must_use]
    pub fn stop_as(mut self, state: UnitState) -> Self {
        self.stop_as = Some(state);
        self
    }

    #[must_use]
    pub fn recorded(&self, name: UnitName) -> Option<UnitState> {
        self.units.get(name.as_bytes()).copied()
    }
}

impl SystemdControl for FakeSystemd {
    fn start_transient(
        &mut self,
        kind: UnitKind,
        spec: &TransientUnits,
    ) -> Result<UnitState, SystemdError> {
        if matches!(kind, UnitKind::Unknown) {
            return Err(SystemdError::UnexpectedKind);
        }
        if self.fail_kind == Some(kind) {
            return Err(SystemdError::AttestationFailed);
        }
        let name = name_for(kind, spec)?;
        self.units
            .insert(name.as_bytes().to_vec(), UnitState::Active);
        Ok(UnitState::Active)
    }

    fn stop(&mut self, kind: UnitKind, spec: &TransientUnits) -> Result<UnitState, SystemdError> {
        if self.fail_stop {
            return Err(SystemdError::AttestationFailed);
        }
        let name = name_for(kind, spec)?;
        if let Some(state) = self.stop_as {
            self.units
                .insert(name.as_bytes().to_vec(), state);
            return Ok(state);
        }
        self.units
            .insert(name.as_bytes().to_vec(), UnitState::Inactive);
        Ok(UnitState::Inactive)
    }

    fn attest(&mut self, kind: UnitKind, spec: &TransientUnits) -> Result<UnitState, SystemdError> {
        let name = name_for(kind, spec)?;
        match self.units.get(name.as_bytes()).copied() {
            Some(UnitState::Unknown) | None => Err(SystemdError::UnknownState),
            Some(state) => Ok(state),
        }
    }
}

fn name_for(kind: UnitKind, spec: &TransientUnits) -> Result<UnitName, SystemdError> {
    match kind {
        UnitKind::Mount => Ok(spec.mount().name()),
        UnitKind::Worker => Ok(spec.worker().name()),
        UnitKind::Unknown => Err(SystemdError::UnexpectedKind),
    }
}

fn hex_job(job_id: JobId) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut out = String::with_capacity(32);
    for byte in job_id.bytes() {
        out.push(HEX[usize::from(byte >> 4)] as char);
        out.push(HEX[usize::from(byte & 0x0f)] as char);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::{FakeSystemd, SystemdControl, SystemdError, TransientUnits};
    use crate::runtime::ApprovedRuntime;
    use crate::state::{JobId, Principal};
    use crate::unit::{UnitKind, UnitState};
    use sha2::{Digest, Sha256};
    use std::fs::{self, OpenOptions};
    use std::io::Write;
    use std::os::unix::fs::OpenOptionsExt;
    use std::sync::atomic::{AtomicU64, Ordering};

    static NEXT: AtomicU64 = AtomicU64::new(1);

    #[test]
    fn transient_units_ignore_any_client_path_argument() {
        let job = JobId::create([7; 16]).expect("job");
        let runtime = approved_runtime();
        let spec = TransientUnits::derive(
            job,
            std::path::PathBuf::from("/run/storecore-media"),
            Principal::create(2000, 2000),
            &runtime,
        );
        assert_eq!(spec.worker().java(), runtime.java_path());
        assert_eq!(spec.worker().jar(), runtime.jar_path());
        assert_eq!(spec.worker().java_digest(), runtime.java().digest());
        assert_eq!(spec.worker().jar_digest(), runtime.jar().digest());
        let where_path = spec.mount().where_path().to_string_lossy();
        assert!(where_path.starts_with("/run/storecore-media/"));
        assert!(!where_path.contains(".."));
        assert_eq!(spec.mount().what(), b"tmpfs");
        assert!(
            core::str::from_utf8(spec.mount().options())
                .expect("utf8")
                .contains("noexec")
        );
        let mut systemd = FakeSystemd::new();
        assert_eq!(
            systemd.start_transient(UnitKind::Mount, &spec),
            Ok(UnitState::Active)
        );
        assert_eq!(
            systemd.attest(UnitKind::Mount, &spec),
            Ok(UnitState::Active)
        );
    }

    #[test]
    fn unknown_unit_kind_is_rejected_before_dbus() {
        let job = JobId::create([8; 16]).expect("job");
        let runtime = approved_runtime();
        let spec = TransientUnits::derive(
            job,
            std::path::PathBuf::from("/run/storecore-media"),
            Principal::create(2000, 2000),
            &runtime,
        );
        let mut systemd = FakeSystemd::new();
        assert_eq!(
            systemd.start_transient(UnitKind::Unknown, &spec),
            Err(SystemdError::UnexpectedKind)
        );
    }

    fn approved_runtime() -> ApprovedRuntime {
        let id = NEXT.fetch_add(1, Ordering::Relaxed);
        let root = std::env::temp_dir().join(format!(
            "storecore-media-broker-systemd-{}-{id}",
            std::process::id()
        ));
        fs::create_dir(&root).expect("root");
        let java = root.join("java");
        let jar = root.join("worker.jar");
        let java_digest = write(&java, 0o555, b"java");
        let jar_digest = write(&jar, 0o444, b"jar");
        ApprovedRuntime::open(
            &java,
            &jar,
            rustix::process::geteuid().as_raw(),
            java_digest,
            jar_digest,
        )
        .expect("runtime")
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
