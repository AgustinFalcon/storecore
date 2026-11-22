//! Blocking allowlisted adapter for systemd's Manager D-Bus API.
//!
//! The client never supplies a method name, unit name, `Where` or `ExecStart`.
//! Tests keep [`crate::systemd::FakeSystemd`]; this type talks to PID 1 only
//! when [`ZbusSystemd::connect_system`] is called.

use std::thread;
use std::time::{Duration, Instant};

use zbus::blocking::{Connection, Proxy, connection::Builder};
use zbus::zvariant::{OwnedObjectPath, Value};

use crate::systemd::{SystemdControl, SystemdError, TransientUnits};
use crate::unit::{UnitKind, UnitName, UnitState};

const SYSTEMD_DESTINATION: &str = "org.freedesktop.systemd1";
const SYSTEMD_MANAGER_PATH: &str = "/org/freedesktop/systemd1";
const SYSTEMD_MANAGER_INTERFACE: &str = "org.freedesktop.systemd1.Manager";
const SYSTEMD_UNIT_INTERFACE: &str = "org.freedesktop.systemd1.Unit";
const JOB_PATH_PREFIX: &str = "/org/freedesktop/systemd1/job/";
const UNIT_PATH_PREFIX: &str = "/org/freedesktop/systemd1/unit/";
const START_MODE: &str = "fail";
const STOP_MODE: &str = "fail";
const NO_SUCH_UNIT: &str = "org.freedesktop.systemd1.NoSuchUnit";
const METHOD_TIMEOUT: Duration = Duration::from_secs(30);
const POLL_INTERVAL: Duration = Duration::from_millis(50);
/// `IMAGE_IO_V1` worker heap. Derived internally; the client cannot supply it.
const WORKER_MEMORY_MAX_BYTES: u64 = 192 * 1024 * 1024;
const WORKER_TASKS_MAX: u64 = 64;

/// System-bus client for the allowlisted Manager methods. Construction is the
/// only way to open D-Bus; unit tests never call it.
pub struct ZbusSystemd {
    connection: Connection,
}

impl ZbusSystemd {
    /// Opens the system bus used by PID 1. Never falls back to a session bus.
    ///
    /// # Errors
    ///
    /// Returns [`SystemdError::Unavailable`] when the system bus cannot be opened.
    pub fn connect_system() -> Result<Self, SystemdError> {
        let connection = Builder::system()
            .map_err(|_| SystemdError::Unavailable)?
            .method_timeout(METHOD_TIMEOUT)
            .build()
            .map_err(|_| SystemdError::Unavailable)?;
        Ok(Self { connection })
    }

    fn manager(&self) -> Result<Proxy<'_>, SystemdError> {
        Proxy::new(
            &self.connection,
            SYSTEMD_DESTINATION,
            SYSTEMD_MANAGER_PATH,
            SYSTEMD_MANAGER_INTERFACE,
        )
        .map_err(|_| SystemdError::Unavailable)
    }

    fn start(
        &self,
        name: &str,
        properties: Vec<(&'static str, Value<'static>)>,
    ) -> Result<(), SystemdError> {
        let auxiliary: Vec<(&str, Vec<(&str, Value<'static>)>)> = Vec::new();
        let job: OwnedObjectPath = self
            .manager()?
            .call(
                "StartTransientUnit",
                &(name, START_MODE, properties, auxiliary),
            )
            .map_err(|_| SystemdError::Unavailable)?;
        validate_job_path(&job)
    }

    fn stop_unit(&self, name: &str) -> Result<(), SystemdError> {
        let job: OwnedObjectPath = self
            .manager()?
            .call("StopUnit", &(name, STOP_MODE))
            .map_err(from_zbus)?;
        validate_job_path(&job)
    }

    fn active_state(&self, name: &str) -> Result<UnitState, SystemdError> {
        let unit_path: OwnedObjectPath = self
            .manager()?
            .call("GetUnit", &(name,))
            .map_err(from_zbus)?;
        if !unit_path.as_str().starts_with(UNIT_PATH_PREFIX)
            || unit_path.as_str().len() == UNIT_PATH_PREFIX.len()
        {
            return Err(SystemdError::Unavailable);
        }
        let unit = Proxy::new(
            &self.connection,
            SYSTEMD_DESTINATION,
            &unit_path,
            SYSTEMD_UNIT_INTERFACE,
        )
        .map_err(|_| SystemdError::Unavailable)?;
        let active: String = unit
            .get_property("ActiveState")
            .map_err(|_| SystemdError::Unavailable)?;
        match UnitState::from_active_state(&active) {
            UnitState::Unknown => Err(SystemdError::UnknownState),
            state => Ok(state),
        }
    }

    fn wait_state(
        &self,
        name: &str,
        accept: impl Fn(UnitState) -> bool,
    ) -> Result<UnitState, SystemdError> {
        let deadline = Instant::now() + METHOD_TIMEOUT;
        loop {
            match self.active_state(name) {
                Ok(state) if accept(state) => return Ok(state),
                Ok(UnitState::Failed) => return Ok(UnitState::Failed),
                Ok(state) if Instant::now() >= deadline => return Ok(state),
                Err(error) if Instant::now() >= deadline => return Err(error),
                Ok(_) | Err(_) => thread::sleep(POLL_INTERVAL),
            }
        }
    }
}

impl SystemdControl for ZbusSystemd {
    fn start_transient(
        &mut self,
        kind: UnitKind,
        spec: &TransientUnits,
    ) -> Result<UnitState, SystemdError> {
        let name = unit_name(kind, spec)?;
        self.start(&name, properties(kind, spec)?)?;
        self.wait_state(&name, UnitState::is_active)
    }

    fn stop(&mut self, kind: UnitKind, spec: &TransientUnits) -> Result<UnitState, SystemdError> {
        let name = unit_name(kind, spec)?;
        if let Err(error) = self.stop_unit(&name) {
            return match self.active_state(&name) {
                Ok(state @ (UnitState::Inactive | UnitState::Failed)) => Ok(state),
                Err(SystemdError::NotLoaded) => Ok(UnitState::Inactive),
                _ => Err(error),
            };
        }
        match self.wait_state(&name, |state| {
            matches!(state, UnitState::Inactive | UnitState::Failed)
        }) {
            Ok(state) => Ok(state),
            Err(SystemdError::NotLoaded) => Ok(UnitState::Inactive),
            other => other,
        }
    }

    fn attest(&mut self, kind: UnitKind, spec: &TransientUnits) -> Result<UnitState, SystemdError> {
        self.active_state(&unit_name(kind, spec)?)
    }
}

fn unit_name(kind: UnitKind, spec: &TransientUnits) -> Result<String, SystemdError> {
    let name = match kind {
        UnitKind::Mount => spec.mount().name(),
        UnitKind::Worker => spec.worker().name(),
        UnitKind::Unknown => return Err(SystemdError::UnexpectedKind),
    };
    required_name(name)
}

fn properties(
    kind: UnitKind,
    spec: &TransientUnits,
) -> Result<Vec<(&'static str, Value<'static>)>, SystemdError> {
    match kind {
        UnitKind::Mount => mount_properties(spec),
        UnitKind::Worker => worker_properties(spec),
        UnitKind::Unknown => Err(SystemdError::UnexpectedKind),
    }
}

pub(crate) fn mount_properties(
    spec: &TransientUnits,
) -> Result<Vec<(&'static str, Value<'static>)>, SystemdError> {
    let where_path = spec
        .mount()
        .where_path()
        .to_str()
        .ok_or(SystemdError::Unavailable)?
        .to_owned();
    let what = utf8(spec.mount().what())?.to_owned();
    let options = spec.mount().options().to_owned();
    Ok(vec![
        (
            "Description",
            Value::from("StoreCore isolated media workspace".to_owned()),
        ),
        ("CollectMode", Value::from("inactive-or-failed".to_owned())),
        ("What", Value::from(what)),
        ("Where", Value::from(where_path)),
        ("Type", Value::from("tmpfs".to_owned())),
        ("Options", Value::from(options)),
        ("DirectoryMode", Value::from(spec.mount().directory_mode())),
    ])
}

pub(crate) fn worker_properties(
    spec: &TransientUnits,
) -> Result<Vec<(&'static str, Value<'static>)>, SystemdError> {
    let executable = spec
        .worker()
        .java()
        .to_str()
        .ok_or(SystemdError::Unavailable)?
        .to_owned();
    let jar = spec
        .worker()
        .jar()
        .to_str()
        .ok_or(SystemdError::Unavailable)?
        .to_owned();
    let argv = vec![executable.clone(), "-jar".to_owned(), jar];
    let mount = required_name(spec.mount().name())?;
    let workspace = spec
        .mount()
        .where_path()
        .to_str()
        .ok_or(SystemdError::Unavailable)?
        .to_owned();
    Ok(vec![
        (
            "Description",
            Value::from("StoreCore isolated media worker".to_owned()),
        ),
        ("CollectMode", Value::from("inactive-or-failed".to_owned())),
        ("Requires", Value::from(vec![mount.clone()])),
        ("After", Value::from(vec![mount])),
        ("Type", Value::from("exec".to_owned())),
        ("ExecStart", Value::from(vec![(executable, argv, false)])),
        (
            "User",
            Value::from(spec.worker().worker().uid().to_string()),
        ),
        (
            "Group",
            Value::from(spec.worker().worker().gid().to_string()),
        ),
        ("WorkingDirectory", Value::from(workspace.clone())),
        ("NoNewPrivileges", Value::from(true)),
        ("ProtectSystem", Value::from("strict".to_owned())),
        ("ReadWritePaths", Value::from(vec![workspace.clone()])),
        (
            "Environment",
            Value::from(vec![format!("TMPDIR={workspace}")]),
        ),
        ("RemainAfterExit", Value::from(true)),
        ("StandardOutput", Value::from("journal".to_owned())),
        ("StandardError", Value::from("journal".to_owned())),
        ("MemoryAccounting", Value::from(true)),
        ("MemoryMax", Value::from(WORKER_MEMORY_MAX_BYTES)),
        ("MemorySwapMax", Value::from(0u64)),
        ("TasksAccounting", Value::from(true)),
        ("TasksMax", Value::from(WORKER_TASKS_MAX)),
    ])
}

fn required_name(name: &UnitName) -> Result<String, SystemdError> {
    name.as_str()
        .map(str::to_owned)
        .ok_or(SystemdError::Unavailable)
}

fn utf8(bytes: &[u8]) -> Result<&str, SystemdError> {
    core::str::from_utf8(bytes).map_err(|_| SystemdError::Unavailable)
}

fn from_zbus(error: zbus::Error) -> SystemdError {
    match error {
        zbus::Error::MethodError(name, _, _) => classify_dbus_name(name.as_str()),
        _ => SystemdError::Unavailable,
    }
}

fn classify_dbus_name(name: &str) -> SystemdError {
    if name == NO_SUCH_UNIT {
        SystemdError::NotLoaded
    } else {
        SystemdError::Unavailable
    }
}

fn validate_job_path(path: &OwnedObjectPath) -> Result<(), SystemdError> {
    if path.as_str().starts_with(JOB_PATH_PREFIX)
        && path.as_str().len() > JOB_PATH_PREFIX.len()
        && path.as_str()[JOB_PATH_PREFIX.len()..]
            .bytes()
            .all(|byte| byte.is_ascii_digit())
    {
        Ok(())
    } else {
        Err(SystemdError::Unavailable)
    }
}

#[cfg(test)]
mod tests {
    use super::{
        WORKER_MEMORY_MAX_BYTES, WORKER_TASKS_MAX, ZbusSystemd, classify_dbus_name,
        mount_properties, worker_properties,
    };
    use crate::runtime::ApprovedRuntime;
    use crate::state::{JobId, Principal};
    use crate::systemd::{SystemdControl, SystemdError, TransientUnits};
    use crate::unit::{UnitKind, UnitState};
    use sha2::{Digest, Sha256};
    use std::fs::{self, OpenOptions};
    use std::io::Write;
    use std::os::unix::fs::{self as unix_fs, OpenOptionsExt};
    use std::path::{Path, PathBuf};
    use std::process::Command;
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::thread;
    use std::time::{Duration, Instant};

    /// Golden `SELF_TEST` request.bin used by Verify's packaged-worker step.
    const SELF_TEST_REQUEST: [u8; 64] = [
        0x53, 0x43, 0x4d, 0x57, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x34, 0x01, 0x02, 0x00,
        0x00, 0x91, 0xb9, 0xd4, 0xac, 0x9d, 0x2f, 0x4a, 0xd9, 0xa7, 0x2e, 0x08, 0xba, 0x53, 0x0b,
        0x57, 0xc0, 0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17, 0x18, 0x19, 0x1a, 0x1b, 0x1c, 0x1d,
        0x1e, 0x1f, 0x20, 0x21, 0x22, 0x23, 0x24, 0x25, 0x26, 0x27, 0x28, 0x29, 0x2a, 0x2b, 0x2c,
        0x2d, 0x2e, 0x2f, 0x30,
    ];

    static NEXT: AtomicU64 = AtomicU64::new(1);

    #[test]
    fn derived_properties_never_include_a_client_exec_or_where() {
        let job = JobId::create([0xab; 16]).expect("job");
        let runtime = approved_runtime();
        let spec = TransientUnits::derive(
            job,
            std::path::PathBuf::from("/run/storecore_media/jobs"),
            Principal::create(2000, 2000),
            &runtime,
        )
        .expect("spec");
        let mount = mount_properties(&spec).expect("mount");
        let worker = worker_properties(&spec).expect("worker");
        let keys: Vec<&str> = mount.iter().map(|(key, _)| *key).collect();
        assert!(keys.contains(&"Where"));
        assert!(!keys.contains(&"ExecStart"));
        let worker_keys: Vec<&str> = worker.iter().map(|(key, _)| *key).collect();
        assert!(worker_keys.contains(&"ExecStart"));
        assert!(worker_keys.contains(&"NoNewPrivileges"));
        assert!(worker_keys.contains(&"ProtectSystem"));
        assert!(worker_keys.contains(&"ReadWritePaths"));
        assert!(worker_keys.contains(&"Environment"));
        assert!(worker_keys.contains(&"RemainAfterExit"));
        assert!(worker_keys.contains(&"StandardOutput"));
        assert!(worker_keys.contains(&"StandardError"));
        assert!(worker_keys.contains(&"MemoryAccounting"));
        assert!(worker_keys.contains(&"MemoryMax"));
        assert!(worker_keys.contains(&"MemorySwapMax"));
        assert!(worker_keys.contains(&"TasksAccounting"));
        assert!(worker_keys.contains(&"TasksMax"));
        let memory_max = worker
            .iter()
            .find(|(key, _)| *key == "MemoryMax")
            .map(|(_, value)| format!("{value:?}"));
        assert!(
            memory_max
                .as_deref()
                .is_some_and(|value| value.contains(&WORKER_MEMORY_MAX_BYTES.to_string())),
            "MemoryMax must be the internal 192MiB ceiling, got {memory_max:?}"
        );
        let swap_max = worker
            .iter()
            .find(|(key, _)| *key == "MemorySwapMax")
            .map(|(_, value)| format!("{value:?}"));
        assert!(
            swap_max.as_deref().is_some_and(|value| value.contains('0')),
            "MemorySwapMax must be the internal zero, got {swap_max:?}"
        );
        let protect = worker
            .iter()
            .find(|(key, _)| *key == "ProtectSystem")
            .map(|(_, value)| format!("{value:?}"));
        assert!(
            protect
                .as_deref()
                .is_some_and(|value| value.contains("strict")),
            "ProtectSystem must be the internal literal strict, got {protect:?}"
        );
        let writable = worker
            .iter()
            .find(|(key, _)| *key == "ReadWritePaths")
            .map(|(_, value)| format!("{value:?}"));
        let where_path = spec.mount().where_path().to_str().expect("utf8 where");
        assert!(
            writable
                .as_deref()
                .is_some_and(|value| value.contains(where_path)),
            "ReadWritePaths must be the derived Where {where_path}, got {writable:?}"
        );
        let environment = worker
            .iter()
            .find(|(key, _)| *key == "Environment")
            .map(|(_, value)| format!("{value:?}"));
        assert!(
            environment
                .as_deref()
                .is_some_and(|value| value.contains(&format!("TMPDIR={where_path}"))),
            "TMPDIR must be the derived Where {where_path}, got {environment:?}"
        );
        assert!(keys.contains(&"DirectoryMode"));
        assert!(spec.mount().options().contains("mode=03770"));
        assert!(spec.mount().options().contains("gid=2000"));
        assert_eq!(
            spec.mount().name().as_str().expect("utf8"),
            "run-storecore_media-jobs-abababababababababababababababab.mount"
        );
        assert_eq!(spec.worker().argv()[1], "-jar");
        assert_eq!(spec.worker().argv()[0], spec.worker().java());
        assert_eq!(spec.worker().argv()[2], spec.worker().jar());
    }

    #[test]
    fn collected_unit_is_not_loaded_other_dbus_errors_stay_unavailable() {
        assert_eq!(
            classify_dbus_name("org.freedesktop.systemd1.NoSuchUnit"),
            SystemdError::NotLoaded
        );
        assert_eq!(
            classify_dbus_name("org.freedesktop.DBus.Error.Disconnected"),
            SystemdError::Unavailable
        );
        assert_eq!(
            classify_dbus_name("org.freedesktop.DBus.Error.Failed"),
            SystemdError::Unavailable
        );
    }

    #[test]
    #[ignore = "requires root, systemd PID 1, and the system bus"]
    fn pid1_starts_and_stops_derived_tmpfs_mount() {
        assert_eq!(
            fs::read_to_string("/proc/1/comm")
                .expect("pid1 comm")
                .trim(),
            "systemd"
        );
        assert_eq!(
            rustix::process::geteuid().as_raw(),
            0,
            "PID 1 harness must run as root"
        );
        fs::create_dir_all("/run/storecore_media/jobs").expect("jobs root");
        let mut systemd = ZbusSystemd::connect_system().expect("system bus");
        let job = JobId::create([0x11; 16]).expect("job");
        let runtime = approved_runtime();
        let spec = TransientUnits::derive(
            job,
            std::path::PathBuf::from("/run/storecore_media/jobs"),
            Principal::create(2102, 2102),
            &runtime,
        )
        .expect("spec");
        let started = systemd
            .start_transient(UnitKind::Mount, &spec)
            .expect("start mount");
        assert_eq!(started, UnitState::Active);
        let where_path = spec.mount().where_path().display().to_string();
        let mounts = fs::read_to_string("/proc/self/mountinfo").expect("mountinfo");
        assert!(
            mounts
                .lines()
                .any(|line| line.contains(&where_path) && line.contains("tmpfs")),
            "effective tmpfs missing for {where_path}"
        );
        assert_eq!(
            systemd.attest(UnitKind::Mount, &spec).expect("attest"),
            UnitState::Active
        );
        let stopped = systemd.stop(UnitKind::Mount, &spec).expect("stop");
        assert!(matches!(stopped, UnitState::Inactive | UnitState::Failed));
        let mounts_after =
            fs::read_to_string("/proc/self/mountinfo").expect("mountinfo after stop");
        assert!(
            !mounts_after
                .lines()
                .any(|line| line.contains(&where_path) && line.contains("tmpfs")),
            "tmpfs still mounted after stop at {where_path}"
        );
    }

    #[test]
    #[ignore = "requires root, systemd PID 1, approved Java/jar, and the system bus"]
    fn pid1_starts_worker_self_test_on_derived_tmpfs() {
        assert_eq!(
            fs::read_to_string("/proc/1/comm")
                .expect("pid1 comm")
                .trim(),
            "systemd"
        );
        assert_eq!(
            rustix::process::geteuid().as_raw(),
            0,
            "PID 1 harness must run as root"
        );
        fs::create_dir_all("/run/storecore_media/jobs").expect("jobs root");
        let mut systemd = ZbusSystemd::connect_system().expect("system bus");
        let job = JobId::create([0x22; 16]).expect("job");
        let runtime = approved_pid1_runtime();
        let worker = Principal::create(2102, 2102);
        let spec = TransientUnits::derive(
            job,
            std::path::PathBuf::from("/run/storecore_media/jobs"),
            worker,
            &runtime,
        )
        .expect("spec");
        let started_mount = systemd
            .start_transient(UnitKind::Mount, &spec)
            .expect("start mount");
        assert_eq!(started_mount, UnitState::Active);
        let where_path = spec.mount().where_path().to_path_buf();
        write_self_test_request(&where_path, 2101, worker.gid());
        assert_request_owned_by_backend(&where_path, 2101);
        let started_worker = systemd.start_transient(UnitKind::Worker, &spec);
        let result_path = where_path.join("result.bin");
        if started_worker != Ok(UnitState::Active) {
            dump_worker_unit(&spec, started_worker, &where_path);
        }
        assert_worker_cgroup_v2(&spec);
        wait_for_worker_result(
            &result_path,
            worker.uid(),
            &spec,
            started_worker,
            &where_path,
            Duration::from_secs(30),
        );
        assert!(
            !where_path.join("output.bin").exists(),
            "SELF_TEST must not write output.bin"
        );
        assert_eq!(
            started_worker.expect("start worker"),
            UnitState::Active,
            "RemainAfterExit keeps the worker Active after SELF_TEST exits"
        );
        assert_eq!(
            systemd
                .attest(UnitKind::Worker, &spec)
                .expect("attest worker"),
            UnitState::Active
        );
        let stopped_worker = systemd.stop(UnitKind::Worker, &spec).expect("stop worker");
        assert!(matches!(
            stopped_worker,
            UnitState::Inactive | UnitState::Failed
        ));
        let stopped_mount = systemd.stop(UnitKind::Mount, &spec).expect("stop mount");
        assert!(matches!(
            stopped_mount,
            UnitState::Inactive | UnitState::Failed
        ));
    }

    #[test]
    #[ignore = "requires root, systemd PID 1, approved Java/jar, and the system bus"]
    fn pid1_starts_worker_normalize_on_derived_tmpfs() {
        assert_eq!(
            fs::read_to_string("/proc/1/comm")
                .expect("pid1 comm")
                .trim(),
            "systemd"
        );
        assert_eq!(
            rustix::process::geteuid().as_raw(),
            0,
            "PID 1 harness must run as root"
        );
        fs::create_dir_all("/run/storecore_media/jobs").expect("jobs root");
        let mut systemd = ZbusSystemd::connect_system().expect("system bus");
        let job = JobId::create([0x33; 16]).expect("job");
        let runtime = approved_pid1_runtime();
        let worker = Principal::create(2102, 2102);
        let spec = TransientUnits::derive(
            job,
            std::path::PathBuf::from("/run/storecore_media/jobs"),
            worker,
            &runtime,
        )
        .expect("spec");
        let started_mount = systemd
            .start_transient(UnitKind::Mount, &spec)
            .expect("start mount");
        assert_eq!(started_mount, UnitState::Active);
        let where_path = spec.mount().where_path().to_path_buf();
        write_normalize_workspace(&where_path, 2101, worker.gid());
        assert_request_owned_by_backend(&where_path, 2101);
        assert_input_owned_by_backend(&where_path, 2101);
        let started_worker = systemd.start_transient(UnitKind::Worker, &spec);
        let result_path = where_path.join("result.bin");
        if started_worker != Ok(UnitState::Active) {
            dump_worker_unit(&spec, started_worker, &where_path);
        }
        assert_worker_cgroup_v2(&spec);
        wait_for_worker_result(
            &result_path,
            worker.uid(),
            &spec,
            started_worker,
            &where_path,
            Duration::from_secs(60),
        );
        assert_accepted_normalize_artifacts(&where_path, worker.uid());
        assert_eq!(
            started_worker.expect("start worker"),
            UnitState::Active,
            "RemainAfterExit keeps the worker Active after NORMALIZE exits"
        );
        assert_eq!(
            systemd
                .attest(UnitKind::Worker, &spec)
                .expect("attest worker"),
            UnitState::Active
        );
        let stopped_worker = systemd.stop(UnitKind::Worker, &spec).expect("stop worker");
        assert!(matches!(
            stopped_worker,
            UnitState::Inactive | UnitState::Failed
        ));
        let stopped_mount = systemd.stop(UnitKind::Mount, &spec).expect("stop mount");
        assert!(matches!(
            stopped_mount,
            UnitState::Inactive | UnitState::Failed
        ));
    }

    #[test]
    fn normalize_request_frame_matches_worker_v1_layout() {
        let input = [0xffu8, 0xd8, 0xff, 0xd9];
        let frame = encode_normalize_request(&input);
        assert_eq!(&frame[..4], &[0x53, 0x43, 0x4d, 0x57]);
        assert_eq!(frame[4], 1, "REQUEST frame");
        assert_eq!(frame[5], 0);
        assert_eq!(&frame[6..8], &[0, 0]);
        assert_eq!(
            u32::from_be_bytes(frame[8..12].try_into().expect("length")),
            176
        );
        assert_eq!(frame[12], 1, "V1");
        assert_eq!(frame[13], 1, "NORMALIZE");
        assert_eq!(frame.len(), 188);
    }

    fn approved_runtime() -> ApprovedRuntime {
        let id = NEXT.fetch_add(1, Ordering::Relaxed);
        let root = std::env::temp_dir().join(format!(
            "storecore-media-broker-dbus-{}-{id}",
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

    fn write(path: &Path, mode: u32, bytes: &[u8]) -> [u8; 32] {
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

    fn approved_pid1_runtime() -> ApprovedRuntime {
        let java =
            PathBuf::from(std::env::var("STORECORE_MEDIA_JAVA").expect("STORECORE_MEDIA_JAVA"));
        let jar = PathBuf::from(std::env::var("STORECORE_MEDIA_JAR").expect("STORECORE_MEDIA_JAR"));
        let java_digest = Sha256::digest(fs::read(&java).expect("java bytes")).into();
        let jar_digest = Sha256::digest(fs::read(&jar).expect("jar bytes")).into();
        ApprovedRuntime::open(&java, &jar, 0, java_digest, jar_digest).expect("runtime")
    }

    fn write_self_test_request(where_path: &Path, backend_uid: u32, worker_gid: u32) {
        write_backend_owned(
            where_path,
            "request.bin",
            &SELF_TEST_REQUEST,
            backend_uid,
            worker_gid,
        );
    }

    fn write_normalize_workspace(where_path: &Path, backend_uid: u32, worker_gid: u32) {
        let input: &[u8] =
            include_bytes!("../../media-worker/src/test/resources/goldens/input-jpeg.jpg");
        write_backend_owned(where_path, "input.bin", input, backend_uid, worker_gid);
        write_backend_owned(
            where_path,
            "request.bin",
            &encode_normalize_request(input),
            backend_uid,
            worker_gid,
        );
    }

    fn write_backend_owned(
        where_path: &Path,
        name: &str,
        bytes: &[u8],
        backend_uid: u32,
        worker_gid: u32,
    ) {
        let path = where_path.join(name);
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .mode(0o640)
            .open(&path)
            .unwrap_or_else(|error| panic!("create {name}: {error}"));
        file.write_all(bytes)
            .unwrap_or_else(|error| panic!("write {name}: {error}"));
        file.sync_all()
            .unwrap_or_else(|error| panic!("sync {name}: {error}"));
        drop(file);
        unix_fs::chown(&path, Some(backend_uid), Some(worker_gid))
            .unwrap_or_else(|error| panic!("chown {name}: {error}"));
    }

    fn encode_normalize_request(input: &[u8]) -> Vec<u8> {
        const MIB: u64 = 1024 * 1024;
        let digest = Sha256::digest(input);
        let mut payload = Vec::new();
        payload.push(1);
        payload.push(1);
        payload.extend_from_slice(&0u16.to_be_bytes());
        payload.extend_from_slice(&0x1234_5678_1234_5678u64.to_be_bytes());
        payload.extend_from_slice(&0x9234_5678_1234_5678u64.to_be_bytes());
        payload.extend(0u8..32);
        payload.push(1);
        payload.push(0);
        payload.extend_from_slice(&0u16.to_be_bytes());
        payload.extend_from_slice(
            &u64::try_from(input.len())
                .expect("input size")
                .to_be_bytes(),
        );
        payload.extend_from_slice(&digest);
        payload.extend_from_slice(&(10 * MIB).to_be_bytes());
        payload.extend_from_slice(&(20 * MIB).to_be_bytes());
        payload.extend_from_slice(&320i32.to_be_bytes());
        payload.extend_from_slice(&6_000i32.to_be_bytes());
        payload.extend_from_slice(&16_000_000u64.to_be_bytes());
        payload.extend_from_slice(&(192 * MIB).to_be_bytes());
        payload.extend_from_slice(&(48 * MIB).to_be_bytes());
        payload.extend_from_slice(&12_000u64.to_be_bytes());
        payload.extend_from_slice(&1i32.to_be_bytes());
        payload.extend_from_slice(&(64 * 1024u64).to_be_bytes());
        payload.extend_from_slice(&1_024i32.to_be_bytes());
        payload.extend_from_slice(&MIB.to_be_bytes());
        let mut frame = Vec::new();
        frame.extend_from_slice(&0x5343_4d57u32.to_be_bytes());
        frame.push(1);
        frame.push(0);
        frame.extend_from_slice(&0u16.to_be_bytes());
        frame.extend_from_slice(
            &u32::try_from(payload.len())
                .expect("payload size")
                .to_be_bytes(),
        );
        frame.extend_from_slice(&payload);
        frame
    }

    fn assert_request_owned_by_backend(where_path: &Path, backend_uid: u32) {
        assert_file_owned_by(where_path, "request.bin", backend_uid);
    }

    fn assert_input_owned_by_backend(where_path: &Path, backend_uid: u32) {
        assert_file_owned_by(where_path, "input.bin", backend_uid);
    }

    fn assert_file_owned_by(where_path: &Path, name: &str, uid: u32) {
        let path = where_path.join(name);
        let descriptor = rustix::fs::open(
            &path,
            rustix::fs::OFlags::RDONLY | rustix::fs::OFlags::NOFOLLOW,
            rustix::fs::Mode::empty(),
        )
        .unwrap_or_else(|error| panic!("open {name}: {error}"));
        let stat =
            rustix::fs::fstat(&descriptor).unwrap_or_else(|error| panic!("fstat {name}: {error}"));
        assert_eq!(stat.st_uid, uid, "{name} must be owned by uid {uid}");
    }

    fn assert_accepted_normalize_artifacts(where_path: &Path, worker_uid: u32) {
        assert_file_owned_by(where_path, "output.bin", worker_uid);
        let output = rustix::fs::open(
            where_path.join("output.bin"),
            rustix::fs::OFlags::RDONLY | rustix::fs::OFlags::NOFOLLOW,
            rustix::fs::Mode::empty(),
        )
        .expect("open output.bin");
        let output_stat = rustix::fs::fstat(&output).expect("fstat output.bin");
        assert!(output_stat.st_size > 0, "NORMALIZE must write output.bin");
        let result = fs::read(where_path.join("result.bin")).expect("read result.bin");
        assert!(result.len() > 12, "result.bin too short");
        assert_eq!(&result[..4], &[0x53, 0x43, 0x4d, 0x57]);
        assert_eq!(result[4], 2, "RESPONSE frame");
        assert_eq!(result[12], 1, "ACCEPTED");
    }

    fn assert_worker_cgroup_v2(spec: &TransientUnits) {
        let name = spec.worker().name().as_str().expect("worker unit name");
        let shown = Command::new("systemctl")
            .args(["show", name, "-p", "ControlGroup", "--value"])
            .output()
            .expect("systemctl ControlGroup");
        let relative = String::from_utf8_lossy(&shown.stdout).trim().to_owned();
        assert!(
            !relative.is_empty(),
            "ControlGroup empty for {name}: {}",
            String::from_utf8_lossy(&shown.stderr)
        );
        let dir = Path::new("/sys/fs/cgroup").join(relative.trim_start_matches('/'));
        assert!(
            dir.is_dir(),
            "worker cgroup v2 missing at {} (ControlGroup={relative})",
            dir.display()
        );
        let controllers = fs::read_to_string(dir.join("cgroup.controllers"))
            .unwrap_or_else(|error| panic!("cgroup.controllers: {error}"));
        assert!(
            controllers
                .split_whitespace()
                .any(|controller| controller == "memory"),
            "memory controller absent from {}: {controllers}",
            dir.display()
        );
        let memory_current = fs::read_to_string(dir.join("memory.current"))
            .unwrap_or_else(|error| panic!("memory.current: {error}"));
        memory_current
            .trim()
            .parse::<u64>()
            .unwrap_or_else(|error| panic!("memory.current integer: {error}"));
        let memory_max = fs::read_to_string(dir.join("memory.max"))
            .unwrap_or_else(|error| panic!("memory.max: {error}"));
        assert_eq!(
            memory_max.trim(),
            WORKER_MEMORY_MAX_BYTES.to_string(),
            "memory.max must be the derived 192MiB ceiling at {}",
            dir.display()
        );
        let swap_max = fs::read_to_string(dir.join("memory.swap.max"))
            .unwrap_or_else(|error| panic!("memory.swap.max: {error}"));
        assert_eq!(swap_max.trim(), "0", "memory.swap.max must be 0");
        let tasks_max = fs::read_to_string(dir.join("pids.max"))
            .unwrap_or_else(|error| panic!("pids.max: {error}"));
        assert_eq!(
            tasks_max.trim(),
            WORKER_TASKS_MAX.to_string(),
            "pids.max must be the derived TasksMax at {}",
            dir.display()
        );
    }

    fn wait_for_worker_result(
        path: &Path,
        worker_uid: u32,
        spec: &TransientUnits,
        started: Result<UnitState, SystemdError>,
        where_path: &Path,
        timeout: Duration,
    ) {
        let deadline = Instant::now() + timeout;
        loop {
            if let Ok(descriptor) = rustix::fs::open(
                path,
                rustix::fs::OFlags::RDONLY | rustix::fs::OFlags::NOFOLLOW,
                rustix::fs::Mode::empty(),
            ) {
                let stat = rustix::fs::fstat(&descriptor).expect("fstat result.bin");
                if stat.st_size > 0 {
                    assert_eq!(
                        stat.st_uid, worker_uid,
                        "result.bin must be owned by the worker uid"
                    );
                    return;
                }
            }
            if Instant::now() >= deadline {
                dump_worker_unit(spec, started, where_path);
                panic!("worker did not write result.bin at {}", path.display());
            }
            thread::sleep(Duration::from_millis(50));
        }
    }

    fn dump_worker_unit(
        spec: &TransientUnits,
        started: Result<UnitState, SystemdError>,
        where_path: &Path,
    ) {
        let name = spec
            .worker()
            .name()
            .as_str()
            .unwrap_or("storecore-media-worker.service");
        eprintln!("worker start_transient={started:?} unit={name}");
        let listing = Command::new("ls")
            .args(["-la", where_path.to_str().unwrap_or(".")])
            .output()
            .expect("ls workspace");
        eprintln!("workspace:\n{}", String::from_utf8_lossy(&listing.stdout));
        let status = Command::new("systemctl")
            .args([
                "show",
                name,
                "-p",
                "Id",
                "-p",
                "ActiveState",
                "-p",
                "SubState",
                "-p",
                "Result",
                "-p",
                "ExecMainStatus",
                "-p",
                "ExecMainCode",
                "-p",
                "User",
                "-p",
                "FragmentPath",
            ])
            .output()
            .expect("systemctl show");
        eprintln!(
            "systemctl show:\n{}",
            String::from_utf8_lossy(&status.stdout)
        );
        let journal = Command::new("journalctl")
            .args(["-b", "-u", name, "--no-pager", "-n", "80"])
            .output()
            .expect("journalctl");
        eprintln!("journalctl:\n{}", String::from_utf8_lossy(&journal.stdout));
        if !journal.stderr.is_empty() {
            eprintln!(
                "journalctl stderr:\n{}",
                String::from_utf8_lossy(&journal.stderr)
            );
        }
    }
}
