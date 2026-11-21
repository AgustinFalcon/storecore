use std::collections::BTreeMap;
use std::ffi::OsStr;
use std::path::PathBuf;

use crate::runtime::ApprovedRuntime;
use crate::state::{JobId, Principal};
use crate::unit::{DerivedUnits, UnitKind, UnitName, UnitState, encode_job_hex};

pub const MOUNT_BYTES: u64 = 48 * 1024 * 1024;
pub const MOUNT_INODES: u64 = 1024;
pub const DIRECTORY_MODE: u32 = 0o3770;

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
    /// PID 1 reports the derived unit is not loaded (`NoSuchUnit`).
    NotLoaded,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MountSpec {
    name: UnitName,
    what: &'static [u8],
    options: String,
    where_path: PathBuf,
    directory_mode: u32,
}

impl MountSpec {
    #[must_use]
    pub const fn name(&self) -> &UnitName {
        &self.name
    }
    #[must_use]
    pub const fn what(&self) -> &'static [u8] {
        self.what
    }
    #[must_use]
    pub fn options(&self) -> &str {
        &self.options
    }
    #[must_use]
    pub fn where_path(&self) -> &std::path::Path {
        &self.where_path
    }
    #[must_use]
    pub const fn directory_mode(&self) -> u32 {
        self.directory_mode
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
    pub const fn name(&self) -> &UnitName {
        &self.name
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

    /// Internally derived argv: approved Java, `-jar`, approved fat jar.
    #[must_use]
    pub fn argv(&self) -> [&OsStr; 3] {
        [
            self.java.as_os_str(),
            OsStr::new("-jar"),
            self.jar.as_os_str(),
        ]
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
    ///
    /// # Errors
    ///
    /// Returns [`SystemdError::Unavailable`] when `Where` is not an absolute
    /// UTF-8 path or the escaped unit name would exceed systemd's limit.
    pub fn derive(
        job_id: JobId,
        mount_root: PathBuf,
        worker: Principal,
        runtime: &ApprovedRuntime,
    ) -> Result<Self, SystemdError> {
        let mut where_path = mount_root;
        where_path.push(hex_job(job_id));
        let names = DerivedUnits::derive(job_id, &where_path).ok_or(SystemdError::Unavailable)?;
        Ok(Self {
            mount: MountSpec {
                name: *names.mount(),
                what: b"tmpfs",
                options: tmpfs_options(worker),
                where_path,
                directory_mode: DIRECTORY_MODE,
            },
            worker: WorkerSpec {
                name: *names.worker(),
                worker,
                java: runtime.java_path().to_path_buf(),
                jar: runtime.jar_path().to_path_buf(),
                java_digest: runtime.java().digest(),
                jar_digest: runtime.jar().digest(),
            },
        })
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
    pub fn recorded(&self, name: &UnitName) -> Option<UnitState> {
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
            self.units.insert(name.as_bytes().to_vec(), state);
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

fn name_for(kind: UnitKind, spec: &TransientUnits) -> Result<&UnitName, SystemdError> {
    match kind {
        UnitKind::Mount => Ok(spec.mount().name()),
        UnitKind::Worker => Ok(spec.worker().name()),
        UnitKind::Unknown => Err(SystemdError::UnexpectedKind),
    }
}

fn hex_job(job_id: JobId) -> String {
    let hex = encode_job_hex(job_id);
    String::from_utf8(hex.to_vec()).expect("job hex is ascii")
}

fn tmpfs_options(worker: Principal) -> String {
    format!(
        "nosuid,nodev,noexec,size=48M,nr_inodes=1024,mode=03770,uid=0,gid={}",
        worker.gid()
    )
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
            std::path::PathBuf::from("/run/storecore_media/jobs"),
            Principal::create(2000, 2000),
            &runtime,
        )
        .expect("spec");
        assert_eq!(spec.worker().java(), runtime.java_path());
        assert_eq!(spec.worker().jar(), runtime.jar_path());
        assert_eq!(spec.worker().java_digest(), runtime.java().digest());
        assert_eq!(spec.worker().jar_digest(), runtime.jar().digest());
        assert_eq!(
            spec.worker().argv(),
            [
                runtime.java_path().as_os_str(),
                std::ffi::OsStr::new("-jar"),
                runtime.jar_path().as_os_str(),
            ]
        );
        let where_path = spec.mount().where_path().to_string_lossy();
        assert!(where_path.starts_with("/run/storecore_media/jobs/"));
        assert!(!where_path.contains(".."));
        assert_eq!(
            spec.mount().name().as_str().expect("utf8"),
            "run-storecore_media-jobs-07070707070707070707070707070707.mount"
        );
        assert_eq!(
            spec.worker().name().as_str().expect("utf8"),
            "storecore-media-07070707070707070707070707070707.service"
        );
        assert_eq!(spec.mount().what(), b"tmpfs");
        assert_eq!(spec.mount().directory_mode(), 0o3770);
        let options = spec.mount().options();
        assert!(options.contains("noexec"));
        assert!(options.contains("mode=03770"));
        assert!(options.contains("gid=2000"));
        assert!(!options.contains("mode=0777"));
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
            std::path::PathBuf::from("/run/storecore_media/jobs"),
            Principal::create(2000, 2000),
            &runtime,
        )
        .expect("spec");
        let mut systemd = FakeSystemd::new();
        assert_eq!(
            systemd.start_transient(UnitKind::Unknown, &spec),
            Err(SystemdError::UnexpectedKind)
        );
    }

    #[test]
    fn relative_where_is_rejected_before_dbus() {
        let job = JobId::create([9; 16]).expect("job");
        let runtime = approved_runtime();
        assert_eq!(
            TransientUnits::derive(
                job,
                std::path::PathBuf::from("mnt"),
                Principal::create(2000, 2000),
                &runtime,
            ),
            Err(SystemdError::Unavailable)
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
