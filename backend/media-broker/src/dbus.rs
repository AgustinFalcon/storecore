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
/// `IMAGE_IO_V1` timeout (12 s). Derived internally; the client cannot supply it.
const WORKER_RUNTIME_MAX_USEC: u64 = 12_000_000;
/// Stop grace after `RuntimeMax`. Derived internally; the client cannot supply it.
const WORKER_TIMEOUT_STOP_USEC: u64 = 1_000_000;
/// Open-file ceiling. Derived internally; the client cannot supply it.
const WORKER_LIMIT_NOFILE: u64 = 1024;
/// Process ceiling. Derived internally; the client cannot supply it.
const WORKER_LIMIT_NPROC: u64 = 64;
/// Core-dump ceiling. Derived internally; the client cannot supply it.
const WORKER_LIMIT_CORE: u64 = 0;
/// Per-file size ceiling (`IMAGE_IO_V1` workspace). Derived internally; the
/// client cannot supply it. This is not the aggregated tmpfs quota.
const WORKER_LIMIT_FSIZE: u64 = crate::systemd::MOUNT_BYTES;
/// CPU-time ceiling in seconds (`IMAGE_IO_V1` timeout). Derived internally;
/// the client cannot supply it. This is `RLIMIT_CPU`, not `CPUQuota`.
const WORKER_LIMIT_CPU: u64 = WORKER_RUNTIME_MAX_USEC / 1_000_000;
/// Address-space ceiling. Derived internally as 32× `IMAGE_IO_V1` heap so
/// `HotSpot` can map the runtime while remaining bounded. Equal to
/// `MemoryMax` core-dumps the JVM because virtual size exceeds RSS. This is
/// `RLIMIT_AS`, not `MemoryMax`. The client cannot supply it.
const WORKER_LIMIT_AS: u64 = 32 * WORKER_MEMORY_MAX_BYTES;
/// Data-segment ceiling. Derived internally as the same 32× `IMAGE_IO_V1`
/// heap used by `LimitAS` so `brk` cannot outgrow that bound. This is
/// `RLIMIT_DATA`, not `LimitAS` and not `MemoryMax`. The client cannot
/// supply it.
const WORKER_LIMIT_DATA: u64 = WORKER_LIMIT_AS;
/// Stack ceiling. Derived internally as 8 MiB (`RLIMIT_STACK`), the usual
/// Linux default, so native/`HotSpot` threads can start while remaining
/// bounded. This is not `LimitAS`. The client cannot supply it.
const WORKER_LIMIT_STACK: u64 = 8 * 1024 * 1024;

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
            .map_err(|error| {
                eprintln!("StartTransientUnit {name}: {error}");
                SystemdError::Unavailable
            })?;
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
        ("RuntimeMaxUSec", Value::from(WORKER_RUNTIME_MAX_USEC)),
        ("TimeoutStopUSec", Value::from(WORKER_TIMEOUT_STOP_USEC)),
        ("KillMode", Value::from("control-group".to_owned())),
        ("KillSignal", Value::from(9i32)),
        ("LimitNOFILE", Value::from(WORKER_LIMIT_NOFILE)),
        ("LimitNPROC", Value::from(WORKER_LIMIT_NPROC)),
        ("LimitCORE", Value::from(WORKER_LIMIT_CORE)),
        ("LimitFSIZE", Value::from(WORKER_LIMIT_FSIZE)),
        ("LimitCPU", Value::from(WORKER_LIMIT_CPU)),
        ("LimitAS", Value::from(WORKER_LIMIT_AS)),
        ("LimitDATA", Value::from(WORKER_LIMIT_DATA)),
        ("LimitSTACK", Value::from(WORKER_LIMIT_STACK)),
        ("PrivateNetwork", Value::from(true)),
        ("PrivateTmp", Value::from(true)),
        ("PrivateDevices", Value::from(true)),
        ("RestrictRealtime", Value::from(true)),
        ("LockPersonality", Value::from(true)),
        ("ProtectKernelTunables", Value::from(true)),
        ("ProtectControlGroups", Value::from(true)),
        ("ProtectHostname", Value::from(true)),
        ("RestrictSUIDSGID", Value::from(true)),
        ("ProtectClock", Value::from(true)),
        ("ProtectKernelLogs", Value::from(true)),
        ("ProtectKernelModules", Value::from(true)),
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
        WORKER_LIMIT_AS, WORKER_LIMIT_CORE, WORKER_LIMIT_CPU, WORKER_LIMIT_DATA,
        WORKER_LIMIT_FSIZE, WORKER_LIMIT_NOFILE, WORKER_LIMIT_NPROC, WORKER_LIMIT_STACK,
        WORKER_MEMORY_MAX_BYTES, WORKER_RUNTIME_MAX_USEC, WORKER_TASKS_MAX,
        WORKER_TIMEOUT_STOP_USEC, ZbusSystemd, classify_dbus_name, mount_properties,
        worker_properties,
    };
    use crate::budget::{BudgetError, BudgetLimits};
    use crate::runtime::{ApprovedRuntime, RuntimeError};
    use crate::state::{JobId, Principal, Reservation};
    use crate::store::{AdmissionStatus, BrokerStore, StoreError};
    use crate::systemd::{MOUNT_BYTES, MOUNT_INODES, SystemdControl, SystemdError, TransientUnits};
    use crate::unit::{UnitKind, UnitState};
    use sha2::{Digest, Sha256};
    use std::fs::{self, OpenOptions};
    use std::io::Write;
    use std::os::unix::fs::{self as unix_fs, OpenOptionsExt, PermissionsExt};
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

    /// Bytes a harness allocator writes inside the worker cgroup to exceed `MemoryMax`.
    const WORKER_OOM_PROBE_BYTES: usize = 256 * 1024 * 1024;

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
    fn derived_worker_timeout_matches_image_io_v1() {
        let job = JobId::create([0xab; 16]).expect("job");
        let runtime = approved_runtime();
        let spec = TransientUnits::derive(
            job,
            std::path::PathBuf::from("/run/storecore_media/jobs"),
            Principal::create(2000, 2000),
            &runtime,
        )
        .expect("spec");
        let worker = worker_properties(&spec).expect("worker");
        let keys: Vec<&str> = worker.iter().map(|(key, _)| *key).collect();
        assert!(keys.contains(&"RuntimeMaxUSec"));
        assert!(keys.contains(&"TimeoutStopUSec"));
        let runtime_max = worker
            .iter()
            .find(|(key, _)| *key == "RuntimeMaxUSec")
            .map(|(_, value)| format!("{value:?}"));
        assert!(
            runtime_max
                .as_deref()
                .is_some_and(|value| value.contains(&WORKER_RUNTIME_MAX_USEC.to_string())),
            "RuntimeMaxUSec must be the internal 12s ceiling, got {runtime_max:?}"
        );
        let timeout_stop = worker
            .iter()
            .find(|(key, _)| *key == "TimeoutStopUSec")
            .map(|(_, value)| format!("{value:?}"));
        assert!(
            timeout_stop
                .as_deref()
                .is_some_and(|value| value.contains(&WORKER_TIMEOUT_STOP_USEC.to_string())),
            "TimeoutStopUSec must be the internal 1s grace, got {timeout_stop:?}"
        );
    }

    #[test]
    fn derived_worker_oom_kills_the_cgroup() {
        let job = JobId::create([0xab; 16]).expect("job");
        let runtime = approved_runtime();
        let spec = TransientUnits::derive(
            job,
            std::path::PathBuf::from("/run/storecore_media/jobs"),
            Principal::create(2000, 2000),
            &runtime,
        )
        .expect("spec");
        let worker = worker_properties(&spec).expect("worker");
        let keys: Vec<&str> = worker.iter().map(|(key, _)| *key).collect();
        assert!(keys.contains(&"KillMode"));
        assert!(keys.contains(&"KillSignal"));
        assert!(!keys.contains(&"MemoryOOMGroup"));
        assert!(!keys.contains(&"OOMPolicy"));
        let kill_mode = worker
            .iter()
            .find(|(key, _)| *key == "KillMode")
            .map(|(_, value)| format!("{value:?}"));
        assert!(
            kill_mode
                .as_deref()
                .is_some_and(|value| value.contains("control-group")),
            "KillMode must be control-group, got {kill_mode:?}"
        );
        let kill_signal = worker
            .iter()
            .find(|(key, _)| *key == "KillSignal")
            .map(|(_, value)| format!("{value:?}"));
        assert!(
            kill_signal
                .as_deref()
                .is_some_and(|value| value.contains('9')),
            "KillSignal must be SIGKILL, got {kill_signal:?}"
        );
        assert!(!keys.contains(&"RestrictAddressFamilies"));
        assert!(!keys.contains(&"CPUQuota"));
        assert!(keys.contains(&"LimitNOFILE"));
        assert!(keys.contains(&"LimitNPROC"));
        assert!(keys.contains(&"LimitCORE"));
        assert!(keys.contains(&"LimitFSIZE"));
        assert!(keys.contains(&"PrivateNetwork"));
        let nofile = worker
            .iter()
            .find(|(key, _)| *key == "LimitNOFILE")
            .map(|(_, value)| format!("{value:?}"));
        assert!(
            nofile
                .as_deref()
                .is_some_and(|value| value.contains(&WORKER_LIMIT_NOFILE.to_string())),
            "LimitNOFILE must be the internal 1024 ceiling, got {nofile:?}"
        );
        let nproc = worker
            .iter()
            .find(|(key, _)| *key == "LimitNPROC")
            .map(|(_, value)| format!("{value:?}"));
        assert!(
            nproc
                .as_deref()
                .is_some_and(|value| value.contains(&WORKER_LIMIT_NPROC.to_string())),
            "LimitNPROC must be the internal 64 ceiling, got {nproc:?}"
        );
        let core = worker
            .iter()
            .find(|(key, _)| *key == "LimitCORE")
            .map(|(_, value)| format!("{value:?}"));
        assert!(
            core.as_deref()
                .is_some_and(|value| value.contains(&WORKER_LIMIT_CORE.to_string())),
            "LimitCORE must be the internal zero, got {core:?}"
        );
        let fsize = worker
            .iter()
            .find(|(key, _)| *key == "LimitFSIZE")
            .map(|(_, value)| format!("{value:?}"));
        assert!(
            fsize
                .as_deref()
                .is_some_and(|value| value.contains(&WORKER_LIMIT_FSIZE.to_string())),
            "LimitFSIZE must be the internal workspace ceiling, got {fsize:?}"
        );
        let private_network = worker
            .iter()
            .find(|(key, _)| *key == "PrivateNetwork")
            .map(|(_, value)| format!("{value:?}"));
        assert!(
            private_network
                .as_deref()
                .is_some_and(|value| value.contains("true")),
            "PrivateNetwork must be the internal true, got {private_network:?}"
        );
    }

    #[test]
    fn derived_worker_limit_cpu_is_rlimit_not_quota() {
        let job = JobId::create([0xab; 16]).expect("job");
        let runtime = approved_runtime();
        let spec = TransientUnits::derive(
            job,
            std::path::PathBuf::from("/run/storecore_media/jobs"),
            Principal::create(2000, 2000),
            &runtime,
        )
        .expect("spec");
        let worker = worker_properties(&spec).expect("worker");
        let keys: Vec<&str> = worker.iter().map(|(key, _)| *key).collect();
        assert!(keys.contains(&"LimitCPU"));
        assert!(!keys.contains(&"CPUQuota"));
        let cpu = worker
            .iter()
            .find(|(key, _)| *key == "LimitCPU")
            .map(|(_, value)| format!("{value:?}"));
        assert!(
            cpu.as_deref()
                .is_some_and(|value| value.contains(&WORKER_LIMIT_CPU.to_string())),
            "LimitCPU must be the internal 12s ceiling, got {cpu:?}"
        );
    }

    #[test]
    fn derived_worker_limit_as_is_rlimit_not_cgroup() {
        let job = JobId::create([0xab; 16]).expect("job");
        let runtime = approved_runtime();
        let spec = TransientUnits::derive(
            job,
            std::path::PathBuf::from("/run/storecore_media/jobs"),
            Principal::create(2000, 2000),
            &runtime,
        )
        .expect("spec");
        let worker = worker_properties(&spec).expect("worker");
        let keys: Vec<&str> = worker.iter().map(|(key, _)| *key).collect();
        assert!(keys.contains(&"LimitAS"));
        assert!(keys.contains(&"MemoryMax"));
        assert!(!keys.contains(&"ProtectHome"));
        assert!(!keys.contains(&"RestrictAddressFamilies"));
        assert!(!keys.contains(&"CPUQuota"));
        let limit_as = worker
            .iter()
            .find(|(key, _)| *key == "LimitAS")
            .map(|(_, value)| format!("{value:?}"));
        assert_ne!(
            WORKER_LIMIT_AS, WORKER_MEMORY_MAX_BYTES,
            "LimitAS must exceed MemoryMax so the JVM can map the runtime"
        );
        assert!(
            limit_as
                .as_deref()
                .is_some_and(|value| value.contains(&WORKER_LIMIT_AS.to_string())),
            "LimitAS must be the internal address-space ceiling, got {limit_as:?}"
        );
    }

    #[test]
    fn derived_worker_limit_data_is_rlimit_not_as() {
        let job = JobId::create([0xab; 16]).expect("job");
        let runtime = approved_runtime();
        let spec = TransientUnits::derive(
            job,
            std::path::PathBuf::from("/run/storecore_media/jobs"),
            Principal::create(2000, 2000),
            &runtime,
        )
        .expect("spec");
        let worker = worker_properties(&spec).expect("worker");
        let keys: Vec<&str> = worker.iter().map(|(key, _)| *key).collect();
        assert!(keys.contains(&"LimitDATA"));
        assert!(keys.contains(&"LimitAS"));
        assert!(!keys.contains(&"ProtectHome"));
        assert!(!keys.contains(&"RestrictAddressFamilies"));
        assert!(!keys.contains(&"CPUQuota"));
        let limit_data = worker
            .iter()
            .find(|(key, _)| *key == "LimitDATA")
            .map(|(_, value)| format!("{value:?}"));
        assert_ne!(
            WORKER_LIMIT_DATA, WORKER_MEMORY_MAX_BYTES,
            "LimitDATA must exceed MemoryMax so brk can grow under the JVM"
        );
        assert!(
            limit_data
                .as_deref()
                .is_some_and(|value| value.contains(&WORKER_LIMIT_DATA.to_string())),
            "LimitDATA must be the internal data-segment ceiling, got {limit_data:?}"
        );
    }

    #[test]
    fn derived_worker_limit_stack_is_rlimit() {
        let job = JobId::create([0xab; 16]).expect("job");
        let runtime = approved_runtime();
        let spec = TransientUnits::derive(
            job,
            std::path::PathBuf::from("/run/storecore_media/jobs"),
            Principal::create(2000, 2000),
            &runtime,
        )
        .expect("spec");
        let worker = worker_properties(&spec).expect("worker");
        let keys: Vec<&str> = worker.iter().map(|(key, _)| *key).collect();
        assert!(keys.contains(&"LimitSTACK"));
        assert!(!keys.contains(&"ProtectHome"));
        assert!(!keys.contains(&"RestrictAddressFamilies"));
        assert!(!keys.contains(&"CPUQuota"));
        let limit_stack = worker
            .iter()
            .find(|(key, _)| *key == "LimitSTACK")
            .map(|(_, value)| format!("{value:?}"));
        assert!(
            limit_stack
                .as_deref()
                .is_some_and(|value| value.contains(&WORKER_LIMIT_STACK.to_string())),
            "LimitSTACK must be the internal 8 MiB ceiling, got {limit_stack:?}"
        );
    }

    #[test]
    fn derived_worker_private_tmp() {
        let job = JobId::create([0xab; 16]).expect("job");
        let runtime = approved_runtime();
        let spec = TransientUnits::derive(
            job,
            std::path::PathBuf::from("/run/storecore_media/jobs"),
            Principal::create(2000, 2000),
            &runtime,
        )
        .expect("spec");
        let worker = worker_properties(&spec).expect("worker");
        let keys: Vec<&str> = worker.iter().map(|(key, _)| *key).collect();
        assert!(keys.contains(&"PrivateTmp"));
        assert!(!keys.contains(&"RestrictAddressFamilies"));
        assert!(!keys.contains(&"CPUQuota"));
        let private_tmp = worker
            .iter()
            .find(|(key, _)| *key == "PrivateTmp")
            .map(|(_, value)| format!("{value:?}"));
        assert!(
            private_tmp
                .as_deref()
                .is_some_and(|value| value.contains("true")),
            "PrivateTmp must be the internal true, got {private_tmp:?}"
        );
    }

    #[test]
    fn derived_worker_protect_home() {
        let job = JobId::create([0xab; 16]).expect("job");
        let runtime = approved_runtime();
        let spec = TransientUnits::derive(
            job,
            std::path::PathBuf::from("/run/storecore_media/jobs"),
            Principal::create(2000, 2000),
            &runtime,
        )
        .expect("spec");
        let worker = worker_properties(&spec).expect("worker");
        let keys: Vec<&str> = worker.iter().map(|(key, _)| *key).collect();
        assert!(!keys.contains(&"ProtectHome"));
        assert!(!keys.contains(&"RestrictAddressFamilies"));
        assert!(!keys.contains(&"CPUQuota"));
    }

    #[test]
    fn derived_worker_private_devices() {
        let job = JobId::create([0xab; 16]).expect("job");
        let runtime = approved_runtime();
        let spec = TransientUnits::derive(
            job,
            std::path::PathBuf::from("/run/storecore_media/jobs"),
            Principal::create(2000, 2000),
            &runtime,
        )
        .expect("spec");
        let worker = worker_properties(&spec).expect("worker");
        let keys: Vec<&str> = worker.iter().map(|(key, _)| *key).collect();
        assert!(keys.contains(&"PrivateDevices"));
        assert!(!keys.contains(&"ProtectHome"));
        assert!(!keys.contains(&"RestrictAddressFamilies"));
        assert!(!keys.contains(&"CPUQuota"));
        let private_devices = worker
            .iter()
            .find(|(key, _)| *key == "PrivateDevices")
            .map(|(_, value)| format!("{value:?}"));
        assert!(
            private_devices
                .as_deref()
                .is_some_and(|value| value.contains("true")),
            "PrivateDevices must be the internal true, got {private_devices:?}"
        );
    }

    #[test]
    fn derived_worker_restrict_realtime() {
        let job = JobId::create([0xab; 16]).expect("job");
        let runtime = approved_runtime();
        let spec = TransientUnits::derive(
            job,
            std::path::PathBuf::from("/run/storecore_media/jobs"),
            Principal::create(2000, 2000),
            &runtime,
        )
        .expect("spec");
        let worker = worker_properties(&spec).expect("worker");
        let keys: Vec<&str> = worker.iter().map(|(key, _)| *key).collect();
        assert!(keys.contains(&"RestrictRealtime"));
        assert!(!keys.contains(&"ProtectHome"));
        assert!(!keys.contains(&"RestrictAddressFamilies"));
        assert!(!keys.contains(&"CPUQuota"));
        let restrict_realtime = worker
            .iter()
            .find(|(key, _)| *key == "RestrictRealtime")
            .map(|(_, value)| format!("{value:?}"));
        assert!(
            restrict_realtime
                .as_deref()
                .is_some_and(|value| value.contains("true")),
            "RestrictRealtime must be the internal true, got {restrict_realtime:?}"
        );
    }

    #[test]
    fn derived_worker_lock_personality() {
        let job = JobId::create([0xab; 16]).expect("job");
        let runtime = approved_runtime();
        let spec = TransientUnits::derive(
            job,
            std::path::PathBuf::from("/run/storecore_media/jobs"),
            Principal::create(2000, 2000),
            &runtime,
        )
        .expect("spec");
        let worker = worker_properties(&spec).expect("worker");
        let keys: Vec<&str> = worker.iter().map(|(key, _)| *key).collect();
        assert!(keys.contains(&"LockPersonality"));
        assert!(!keys.contains(&"ProtectHome"));
        assert!(!keys.contains(&"RestrictAddressFamilies"));
        assert!(!keys.contains(&"CPUQuota"));
        let lock_personality = worker
            .iter()
            .find(|(key, _)| *key == "LockPersonality")
            .map(|(_, value)| format!("{value:?}"));
        assert!(
            lock_personality
                .as_deref()
                .is_some_and(|value| value.contains("true")),
            "LockPersonality must be the internal true, got {lock_personality:?}"
        );
    }

    #[test]
    fn derived_worker_protect_kernel_tunables() {
        let job = JobId::create([0xab; 16]).expect("job");
        let runtime = approved_runtime();
        let spec = TransientUnits::derive(
            job,
            std::path::PathBuf::from("/run/storecore_media/jobs"),
            Principal::create(2000, 2000),
            &runtime,
        )
        .expect("spec");
        let worker = worker_properties(&spec).expect("worker");
        let keys: Vec<&str> = worker.iter().map(|(key, _)| *key).collect();
        assert!(keys.contains(&"ProtectKernelTunables"));
        assert!(!keys.contains(&"ProtectHome"));
        assert!(!keys.contains(&"RestrictAddressFamilies"));
        assert!(!keys.contains(&"CPUQuota"));
        let protect_kernel_tunables = worker
            .iter()
            .find(|(key, _)| *key == "ProtectKernelTunables")
            .map(|(_, value)| format!("{value:?}"));
        assert!(
            protect_kernel_tunables
                .as_deref()
                .is_some_and(|value| value.contains("true")),
            "ProtectKernelTunables must be the internal true, got {protect_kernel_tunables:?}"
        );
    }

    #[test]
    fn derived_worker_protect_control_groups() {
        let job = JobId::create([0xab; 16]).expect("job");
        let runtime = approved_runtime();
        let spec = TransientUnits::derive(
            job,
            std::path::PathBuf::from("/run/storecore_media/jobs"),
            Principal::create(2000, 2000),
            &runtime,
        )
        .expect("spec");
        let worker = worker_properties(&spec).expect("worker");
        let keys: Vec<&str> = worker.iter().map(|(key, _)| *key).collect();
        assert!(keys.contains(&"ProtectControlGroups"));
        assert!(!keys.contains(&"ProtectHome"));
        assert!(!keys.contains(&"RestrictAddressFamilies"));
        assert!(!keys.contains(&"CPUQuota"));
        let protect_control_groups = worker
            .iter()
            .find(|(key, _)| *key == "ProtectControlGroups")
            .map(|(_, value)| format!("{value:?}"));
        assert!(
            protect_control_groups
                .as_deref()
                .is_some_and(|value| value.contains("true")),
            "ProtectControlGroups must be the internal true, got {protect_control_groups:?}"
        );
    }

    #[test]
    fn derived_worker_protect_hostname() {
        let job = JobId::create([0xab; 16]).expect("job");
        let runtime = approved_runtime();
        let spec = TransientUnits::derive(
            job,
            std::path::PathBuf::from("/run/storecore_media/jobs"),
            Principal::create(2000, 2000),
            &runtime,
        )
        .expect("spec");
        let worker = worker_properties(&spec).expect("worker");
        let keys: Vec<&str> = worker.iter().map(|(key, _)| *key).collect();
        assert!(keys.contains(&"ProtectHostname"));
        assert!(!keys.contains(&"ProtectHome"));
        assert!(!keys.contains(&"RestrictAddressFamilies"));
        assert!(!keys.contains(&"CPUQuota"));
        let protect_hostname = worker
            .iter()
            .find(|(key, _)| *key == "ProtectHostname")
            .map(|(_, value)| format!("{value:?}"));
        assert!(
            protect_hostname
                .as_deref()
                .is_some_and(|value| value.contains("true")),
            "ProtectHostname must be the internal true, got {protect_hostname:?}"
        );
    }

    #[test]
    fn derived_worker_restrict_suidsgid() {
        let job = JobId::create([0xab; 16]).expect("job");
        let runtime = approved_runtime();
        let spec = TransientUnits::derive(
            job,
            std::path::PathBuf::from("/run/storecore_media/jobs"),
            Principal::create(2000, 2000),
            &runtime,
        )
        .expect("spec");
        let worker = worker_properties(&spec).expect("worker");
        let keys: Vec<&str> = worker.iter().map(|(key, _)| *key).collect();
        assert!(keys.contains(&"RestrictSUIDSGID"));
        assert!(!keys.contains(&"ProtectHome"));
        assert!(!keys.contains(&"RestrictAddressFamilies"));
        assert!(!keys.contains(&"CPUQuota"));
        let restrict_suidsgid = worker
            .iter()
            .find(|(key, _)| *key == "RestrictSUIDSGID")
            .map(|(_, value)| format!("{value:?}"));
        assert!(
            restrict_suidsgid
                .as_deref()
                .is_some_and(|value| value.contains("true")),
            "RestrictSUIDSGID must be the internal true, got {restrict_suidsgid:?}"
        );
    }

    #[test]
    fn derived_worker_protect_clock() {
        let job = JobId::create([0xab; 16]).expect("job");
        let runtime = approved_runtime();
        let spec = TransientUnits::derive(
            job,
            std::path::PathBuf::from("/run/storecore_media/jobs"),
            Principal::create(2000, 2000),
            &runtime,
        )
        .expect("spec");
        let worker = worker_properties(&spec).expect("worker");
        let keys: Vec<&str> = worker.iter().map(|(key, _)| *key).collect();
        assert!(keys.contains(&"ProtectClock"));
        assert!(!keys.contains(&"ProtectHome"));
        assert!(!keys.contains(&"RestrictAddressFamilies"));
        assert!(!keys.contains(&"CPUQuota"));
        let protect_clock = worker
            .iter()
            .find(|(key, _)| *key == "ProtectClock")
            .map(|(_, value)| format!("{value:?}"));
        assert!(
            protect_clock
                .as_deref()
                .is_some_and(|value| value.contains("true")),
            "ProtectClock must be the internal true, got {protect_clock:?}"
        );
    }

    #[test]
    fn derived_worker_protect_kernel_logs() {
        let job = JobId::create([0xab; 16]).expect("job");
        let runtime = approved_runtime();
        let spec = TransientUnits::derive(
            job,
            std::path::PathBuf::from("/run/storecore_media/jobs"),
            Principal::create(2000, 2000),
            &runtime,
        )
        .expect("spec");
        let worker = worker_properties(&spec).expect("worker");
        let keys: Vec<&str> = worker.iter().map(|(key, _)| *key).collect();
        assert!(keys.contains(&"ProtectKernelLogs"));
        assert!(!keys.contains(&"ProtectHome"));
        assert!(!keys.contains(&"RestrictAddressFamilies"));
        assert!(!keys.contains(&"CPUQuota"));
        let protect_kernel_logs = worker
            .iter()
            .find(|(key, _)| *key == "ProtectKernelLogs")
            .map(|(_, value)| format!("{value:?}"));
        assert!(
            protect_kernel_logs
                .as_deref()
                .is_some_and(|value| value.contains("true")),
            "ProtectKernelLogs must be the internal true, got {protect_kernel_logs:?}"
        );
    }

    #[test]
    fn derived_worker_protect_kernel_modules() {
        let job = JobId::create([0xab; 16]).expect("job");
        let runtime = approved_runtime();
        let spec = TransientUnits::derive(
            job,
            std::path::PathBuf::from("/run/storecore_media/jobs"),
            Principal::create(2000, 2000),
            &runtime,
        )
        .expect("spec");
        let worker = worker_properties(&spec).expect("worker");
        let keys: Vec<&str> = worker.iter().map(|(key, _)| *key).collect();
        assert!(keys.contains(&"ProtectKernelModules"));
        assert!(!keys.contains(&"ProtectHome"));
        assert!(!keys.contains(&"RestrictAddressFamilies"));
        assert!(!keys.contains(&"CPUQuota"));
        let protect_kernel_modules = worker
            .iter()
            .find(|(key, _)| *key == "ProtectKernelModules")
            .map(|(_, value)| format!("{value:?}"));
        assert!(
            protect_kernel_modules
                .as_deref()
                .is_some_and(|value| value.contains("true")),
            "ProtectKernelModules must be the internal true, got {protect_kernel_modules:?}"
        );
    }

    #[test]
    fn two_jobs_do_not_share_read_write_paths() {
        let runtime = approved_runtime();
        let spec_a = TransientUnits::derive(
            JobId::create([0x44; 16]).expect("job a"),
            std::path::PathBuf::from("/run/storecore_media/jobs"),
            Principal::create(2000, 2000),
            &runtime,
        )
        .expect("spec a");
        let spec_b = TransientUnits::derive(
            JobId::create([0x55; 16]).expect("job b"),
            std::path::PathBuf::from("/run/storecore_media/jobs"),
            Principal::create(2000, 2000),
            &runtime,
        )
        .expect("spec b");
        let where_a = spec_a.mount().where_path().to_str().expect("where a");
        let where_b = spec_b.mount().where_path().to_str().expect("where b");
        assert_ne!(where_a, where_b, "jobs must not share Where");
        let worker_a = worker_properties(&spec_a).expect("worker a");
        let worker_b = worker_properties(&spec_b).expect("worker b");
        let writable_a = worker_a
            .iter()
            .find(|(key, _)| *key == "ReadWritePaths")
            .map(|(_, value)| format!("{value:?}"));
        let writable_b = worker_b
            .iter()
            .find(|(key, _)| *key == "ReadWritePaths")
            .map(|(_, value)| format!("{value:?}"));
        assert!(
            writable_a
                .as_deref()
                .is_some_and(|value| value.contains(where_a) && !value.contains(where_b)),
            "worker A ReadWritePaths must be only Where A, got {writable_a:?}"
        );
        assert!(
            writable_b
                .as_deref()
                .is_some_and(|value| value.contains(where_b) && !value.contains(where_a)),
            "worker B ReadWritePaths must be only Where B, got {writable_b:?}"
        );
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
    #[ignore = "requires root, systemd PID 1, approved Java/jar, and the system bus"]
    fn pid1_isolates_worker_read_write_paths_per_job() {
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
        let runtime = approved_pid1_runtime();
        let worker = Principal::create(2102, 2102);
        let spec_a = start_pid1_self_test_worker(
            &mut systemd,
            JobId::create([0x44; 16]).expect("job a"),
            &runtime,
            worker,
        );
        let spec_b = start_pid1_self_test_worker(
            &mut systemd,
            JobId::create([0x55; 16]).expect("job b"),
            &runtime,
            worker,
        );
        let where_a = spec_a.mount().where_path().to_path_buf();
        let where_b = spec_b.mount().where_path().to_path_buf();
        assert_worker_job_isolation(&spec_a, &where_b);
        assert_worker_job_isolation(&spec_b, &where_a);
        stop_pid1_worker(&mut systemd, &spec_a);
        stop_pid1_worker(&mut systemd, &spec_b);
    }

    #[test]
    #[ignore = "requires root, systemd PID 1, approved Java/jar, and the system bus"]
    fn pid1_uid_a_process_cannot_traverse_job_tmpfs() {
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
        let job = JobId::create([0x66; 16]).expect("job");
        let runtime = approved_pid1_runtime();
        let worker = Principal::create(2102, 2102);
        let spec = TransientUnits::derive(
            job,
            PathBuf::from("/run/storecore_media/jobs"),
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
        assert_uid_a_process(&where_path);
        let stopped_mount = systemd.stop(UnitKind::Mount, &spec).expect("stop mount");
        assert!(matches!(
            stopped_mount,
            UnitState::Inactive | UnitState::Failed
        ));
    }

    #[test]
    #[ignore = "requires root, systemd PID 1, approved Java/jar, and the system bus"]
    fn pid1_worker_fails_without_request_then_restarts() {
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
        let job = JobId::create([0x77; 16]).expect("job");
        let runtime = approved_pid1_runtime();
        let worker = Principal::create(2102, 2102);
        let spec = TransientUnits::derive(
            job,
            PathBuf::from("/run/storecore_media/jobs"),
            worker,
            &runtime,
        )
        .expect("spec");
        let started_mount = systemd
            .start_transient(UnitKind::Mount, &spec)
            .expect("start mount");
        assert_eq!(started_mount, UnitState::Active);
        let where_path = spec.mount().where_path().to_path_buf();
        let name = spec.worker().name().as_str().expect("worker unit name");
        let first = systemd.start_transient(UnitKind::Worker, &spec);
        if first.is_err() {
            dump_worker_unit(&spec, first, &where_path);
        }
        wait_unknown_exit_journal(name, Duration::from_secs(15), &spec, first, &where_path);
        assert!(
            !where_path.join("result.bin").exists(),
            "failed worker must not write result.bin"
        );
        let stopped_failed = systemd.stop(UnitKind::Worker, &spec).expect("stop failed");
        assert!(matches!(
            stopped_failed,
            UnitState::Inactive | UnitState::Failed
        ));
        reset_failed_unit(name);
        write_self_test_request(&where_path, 2101, worker.gid());
        assert_request_owned_by_backend(&where_path, 2101);
        let restarted = systemd.start_transient(UnitKind::Worker, &spec);
        if restarted != Ok(UnitState::Active) {
            dump_worker_unit(&spec, restarted, &where_path);
        }
        wait_for_worker_result(
            &where_path.join("result.bin"),
            worker.uid(),
            &spec,
            restarted,
            &where_path,
            Duration::from_secs(30),
        );
        assert_eq!(restarted.expect("restart worker"), UnitState::Active);
        wait_exec_main_status(
            name,
            "0",
            Duration::from_secs(15),
            &spec,
            restarted,
            &where_path,
        );
        stop_pid1_worker(&mut systemd, &spec);
    }

    #[test]
    #[ignore = "requires root, systemd PID 1, approved Java/jar, and the system bus"]
    fn pid1_rejects_substituted_runtime_jar() {
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
        let (jar, runtime) = copied_pid1_runtime();
        runtime.confirm().expect("unmodified runtime");
        let job = JobId::create([0x88; 16]).expect("job");
        let worker = Principal::create(2102, 2102);
        let spec = TransientUnits::derive(
            job,
            PathBuf::from("/run/storecore_media/jobs"),
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
        fs::write(&jar, b"substituted-storecore-jar\n").expect("substitute jar");
        assert_eq!(
            runtime.confirm(),
            Err(RuntimeError::DigestMismatch),
            "daemon start must refuse a substituted jar"
        );
        assert!(
            !where_path.join("result.bin").exists(),
            "substituted runtime must not start the worker"
        );
        let stopped_mount = systemd.stop(UnitKind::Mount, &spec).expect("stop mount");
        assert!(matches!(
            stopped_mount,
            UnitState::Inactive | UnitState::Failed
        ));
    }

    #[test]
    #[ignore = "requires root, systemd PID 1, approved Java/jar, and the system bus"]
    fn pid1_worker_runtime_max_stops_frozen_mainpid() {
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
        let job = JobId::create([0x99; 16]).expect("job");
        let runtime = approved_pid1_runtime();
        let worker = Principal::create(2102, 2102);
        let spec = TransientUnits::derive(
            job,
            PathBuf::from("/run/storecore_media/jobs"),
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
        let name = spec.worker().name().as_str().expect("worker unit name");
        let started_worker = systemd.start_transient(UnitKind::Worker, &spec);
        if started_worker.is_err() {
            dump_worker_unit(&spec, started_worker, &where_path);
            panic!("StartTransientUnit rejected derived RuntimeMaxUSec");
        }
        freeze_worker_main_pid(name);
        let runtime_max = systemctl_property(name, "RuntimeMaxUSec");
        assert!(
            runtime_max == WORKER_RUNTIME_MAX_USEC.to_string() || runtime_max == "12s",
            "PID 1 must apply the derived IMAGE_IO_V1 timeout, got {runtime_max}"
        );
        wait_runtime_timeout_journal(
            name,
            Duration::from_secs(20),
            &spec,
            started_worker,
            &where_path,
        );
        assert!(
            !where_path.join("result.bin").exists(),
            "frozen worker must not finish SELF_TEST before RuntimeMax"
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
    fn pid1_worker_memory_max_oom_kills_cgroup() {
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
        let job = JobId::create([0xaa; 16]).expect("job");
        let runtime = approved_pid1_runtime();
        let worker = Principal::create(2102, 2102);
        let spec = TransientUnits::derive(
            job,
            PathBuf::from("/run/storecore_media/jobs"),
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
        let name = spec.worker().name().as_str().expect("worker unit name");
        let started_worker = systemd.start_transient(UnitKind::Worker, &spec);
        if started_worker.is_err() {
            dump_worker_unit(&spec, started_worker, &where_path);
            panic!("StartTransientUnit rejected derived KillMode");
        }
        freeze_worker_main_pid(name);
        let kill_mode = systemctl_property(name, "KillMode");
        assert_eq!(
            kill_mode, "control-group",
            "PID 1 must apply derived KillMode, got {kill_mode}"
        );
        oom_worker_cgroup(name);
        wait_oom_kill_journal(
            name,
            Duration::from_secs(20),
            &spec,
            started_worker,
            &where_path,
        );
        assert!(
            !where_path.join("result.bin").exists(),
            "oom-killed worker must not finish SELF_TEST"
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
    fn pid1_worker_limit_nofile() {
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
        let job = JobId::create([0xcc; 16]).expect("job");
        let runtime = approved_pid1_runtime();
        let worker = Principal::create(2102, 2102);
        let spec = TransientUnits::derive(
            job,
            PathBuf::from("/run/storecore_media/jobs"),
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
        let name = spec.worker().name().as_str().expect("worker unit name");
        let started_worker = systemd.start_transient(UnitKind::Worker, &spec);
        if started_worker.is_err() {
            dump_worker_unit(&spec, started_worker, &where_path);
            panic!("StartTransientUnit rejected derived LimitNOFILE");
        }
        let nofile = systemctl_property(name, "LimitNOFILE");
        assert!(
            nofile == "1024" || nofile.starts_with("1024:"),
            "PID 1 must apply derived LimitNOFILE, got {nofile}"
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
    fn pid1_worker_private_network() {
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
        let job = JobId::create([0xdd; 16]).expect("job");
        let runtime = approved_pid1_runtime();
        let worker = Principal::create(2102, 2102);
        let spec = TransientUnits::derive(
            job,
            PathBuf::from("/run/storecore_media/jobs"),
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
        let name = spec.worker().name().as_str().expect("worker unit name");
        let started_worker = systemd.start_transient(UnitKind::Worker, &spec);
        if started_worker.is_err() {
            dump_worker_unit(&spec, started_worker, &where_path);
            panic!("StartTransientUnit rejected derived PrivateNetwork");
        }
        let private_network = systemctl_property(name, "PrivateNetwork");
        assert!(
            private_network == "yes" || private_network == "true",
            "PID 1 must apply derived PrivateNetwork, got {private_network}"
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
    fn pid1_worker_limit_nproc() {
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
        let job = JobId::create([0xee; 16]).expect("job");
        let runtime = approved_pid1_runtime();
        let worker = Principal::create(2102, 2102);
        let spec = TransientUnits::derive(
            job,
            PathBuf::from("/run/storecore_media/jobs"),
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
        let name = spec.worker().name().as_str().expect("worker unit name");
        let started_worker = systemd.start_transient(UnitKind::Worker, &spec);
        if started_worker.is_err() {
            dump_worker_unit(&spec, started_worker, &where_path);
            panic!("StartTransientUnit rejected derived LimitNPROC");
        }
        let nproc = systemctl_property(name, "LimitNPROC");
        assert!(
            nproc == "64" || nproc.starts_with("64:"),
            "PID 1 must apply derived LimitNPROC, got {nproc}"
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
    fn pid1_worker_limit_core() {
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
        let job = JobId::create([0xff; 16]).expect("job");
        let runtime = approved_pid1_runtime();
        let worker = Principal::create(2102, 2102);
        let spec = TransientUnits::derive(
            job,
            PathBuf::from("/run/storecore_media/jobs"),
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
        let name = spec.worker().name().as_str().expect("worker unit name");
        let started_worker = systemd.start_transient(UnitKind::Worker, &spec);
        if started_worker.is_err() {
            dump_worker_unit(&spec, started_worker, &where_path);
            panic!("StartTransientUnit rejected derived LimitCORE");
        }
        let core = systemctl_property(name, "LimitCORE");
        assert!(
            core == "0" || core.starts_with("0:"),
            "PID 1 must apply derived LimitCORE, got {core}"
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
    fn pid1_worker_limit_fsize() {
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
        let job = JobId::create([0x10; 16]).expect("job");
        let runtime = approved_pid1_runtime();
        let worker = Principal::create(2102, 2102);
        let spec = TransientUnits::derive(
            job,
            PathBuf::from("/run/storecore_media/jobs"),
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
        let name = spec.worker().name().as_str().expect("worker unit name");
        let started_worker = systemd.start_transient(UnitKind::Worker, &spec);
        if started_worker.is_err() {
            dump_worker_unit(&spec, started_worker, &where_path);
            panic!("StartTransientUnit rejected derived LimitFSIZE");
        }
        let fsize = systemctl_property(name, "LimitFSIZE");
        let expected = WORKER_LIMIT_FSIZE.to_string();
        assert!(
            fsize == expected || fsize.starts_with(&format!("{expected}:")),
            "PID 1 must apply derived LimitFSIZE, got {fsize}"
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
    fn pid1_worker_limit_cpu() {
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
        let job = JobId::create([0x12; 16]).expect("job");
        let runtime = approved_pid1_runtime();
        let worker = Principal::create(2102, 2102);
        let spec = TransientUnits::derive(
            job,
            PathBuf::from("/run/storecore_media/jobs"),
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
        let name = spec.worker().name().as_str().expect("worker unit name");
        let started_worker = systemd.start_transient(UnitKind::Worker, &spec);
        if started_worker.is_err() {
            dump_worker_unit(&spec, started_worker, &where_path);
            panic!("StartTransientUnit rejected derived LimitCPU");
        }
        let cpu = systemctl_property(name, "LimitCPU");
        let expected = WORKER_LIMIT_CPU.to_string();
        assert!(
            cpu == expected || cpu.starts_with(&format!("{expected}:")),
            "PID 1 must apply derived LimitCPU, got {cpu}"
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
    fn pid1_worker_private_tmp() {
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
        let job = JobId::create([0x13; 16]).expect("job");
        let runtime = approved_pid1_runtime();
        let worker = Principal::create(2102, 2102);
        let spec = TransientUnits::derive(
            job,
            PathBuf::from("/run/storecore_media/jobs"),
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
        let name = spec.worker().name().as_str().expect("worker unit name");
        let started_worker = systemd.start_transient(UnitKind::Worker, &spec);
        if started_worker.is_err() {
            dump_worker_unit(&spec, started_worker, &where_path);
            panic!("StartTransientUnit rejected derived PrivateTmp");
        }
        let private_tmp = systemctl_property(name, "PrivateTmp");
        assert!(
            private_tmp == "yes" || private_tmp == "true",
            "PID 1 must apply derived PrivateTmp, got {private_tmp}"
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
    fn pid1_worker_protect_home() {
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
        let job = JobId::create([0x14; 16]).expect("job");
        let runtime = approved_pid1_runtime();
        let worker = Principal::create(2102, 2102);
        let spec = TransientUnits::derive(
            job,
            PathBuf::from("/run/storecore_media/jobs"),
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
        let name = spec.worker().name().as_str().expect("worker unit name");
        let started_worker = systemd.start_transient(UnitKind::Worker, &spec);
        if started_worker.is_err() {
            dump_worker_unit(&spec, started_worker, &where_path);
            panic!("StartTransientUnit failed after leaving ProtectHome unset");
        }
        let protect_home = systemctl_property(name, "ProtectHome");
        assert!(
            protect_home == "no" || protect_home == "false" || protect_home.is_empty(),
            "PID 1 must not apply ProtectHome, got {protect_home}"
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
    fn pid1_worker_private_devices() {
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
        let job = JobId::create([0x15; 16]).expect("job");
        let runtime = approved_pid1_runtime();
        let worker = Principal::create(2102, 2102);
        let spec = TransientUnits::derive(
            job,
            PathBuf::from("/run/storecore_media/jobs"),
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
        let name = spec.worker().name().as_str().expect("worker unit name");
        let started_worker = systemd.start_transient(UnitKind::Worker, &spec);
        if started_worker.is_err() {
            dump_worker_unit(&spec, started_worker, &where_path);
            panic!("StartTransientUnit rejected derived PrivateDevices");
        }
        let private_devices = systemctl_property(name, "PrivateDevices");
        assert!(
            private_devices == "yes" || private_devices == "true",
            "PID 1 must apply derived PrivateDevices, got {private_devices}"
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
    fn pid1_worker_restrict_realtime() {
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
        let job = JobId::create([0x16; 16]).expect("job");
        let runtime = approved_pid1_runtime();
        let worker = Principal::create(2102, 2102);
        let spec = TransientUnits::derive(
            job,
            PathBuf::from("/run/storecore_media/jobs"),
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
        let name = spec.worker().name().as_str().expect("worker unit name");
        let started_worker = systemd.start_transient(UnitKind::Worker, &spec);
        if started_worker.is_err() {
            dump_worker_unit(&spec, started_worker, &where_path);
            panic!("StartTransientUnit rejected derived RestrictRealtime");
        }
        let restrict_realtime = systemctl_property(name, "RestrictRealtime");
        assert!(
            restrict_realtime == "yes" || restrict_realtime == "true",
            "PID 1 must apply derived RestrictRealtime, got {restrict_realtime}"
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
    fn pid1_worker_lock_personality() {
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
        let job = JobId::create([0x17; 16]).expect("job");
        let runtime = approved_pid1_runtime();
        let worker = Principal::create(2102, 2102);
        let spec = TransientUnits::derive(
            job,
            PathBuf::from("/run/storecore_media/jobs"),
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
        let name = spec.worker().name().as_str().expect("worker unit name");
        let started_worker = systemd.start_transient(UnitKind::Worker, &spec);
        if started_worker.is_err() {
            dump_worker_unit(&spec, started_worker, &where_path);
            panic!("StartTransientUnit rejected derived LockPersonality");
        }
        let lock_personality = systemctl_property(name, "LockPersonality");
        assert!(
            lock_personality == "yes" || lock_personality == "true",
            "PID 1 must apply derived LockPersonality, got {lock_personality}"
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
    fn pid1_worker_protect_kernel_tunables() {
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
        let job = JobId::create([0x18; 16]).expect("job");
        let runtime = approved_pid1_runtime();
        let worker = Principal::create(2102, 2102);
        let spec = TransientUnits::derive(
            job,
            PathBuf::from("/run/storecore_media/jobs"),
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
        let name = spec.worker().name().as_str().expect("worker unit name");
        let started_worker = systemd.start_transient(UnitKind::Worker, &spec);
        if started_worker.is_err() {
            dump_worker_unit(&spec, started_worker, &where_path);
            panic!("StartTransientUnit rejected derived ProtectKernelTunables");
        }
        let protect_kernel_tunables = systemctl_property(name, "ProtectKernelTunables");
        assert!(
            protect_kernel_tunables == "yes" || protect_kernel_tunables == "true",
            "PID 1 must apply derived ProtectKernelTunables, got {protect_kernel_tunables}"
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
    fn pid1_worker_protect_control_groups() {
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
        let job = JobId::create([0x19; 16]).expect("job");
        let runtime = approved_pid1_runtime();
        let worker = Principal::create(2102, 2102);
        let spec = TransientUnits::derive(
            job,
            PathBuf::from("/run/storecore_media/jobs"),
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
        let name = spec.worker().name().as_str().expect("worker unit name");
        let started_worker = systemd.start_transient(UnitKind::Worker, &spec);
        if started_worker.is_err() {
            dump_worker_unit(&spec, started_worker, &where_path);
            panic!("StartTransientUnit rejected derived ProtectControlGroups");
        }
        let protect_control_groups = systemctl_property(name, "ProtectControlGroups");
        assert!(
            protect_control_groups == "yes" || protect_control_groups == "true",
            "PID 1 must apply derived ProtectControlGroups, got {protect_control_groups}"
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
    fn pid1_worker_protect_hostname() {
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
        let job = JobId::create([0x1a; 16]).expect("job");
        let runtime = approved_pid1_runtime();
        let worker = Principal::create(2102, 2102);
        let spec = TransientUnits::derive(
            job,
            PathBuf::from("/run/storecore_media/jobs"),
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
        let name = spec.worker().name().as_str().expect("worker unit name");
        let started_worker = systemd.start_transient(UnitKind::Worker, &spec);
        if started_worker.is_err() {
            dump_worker_unit(&spec, started_worker, &where_path);
            panic!("StartTransientUnit rejected derived ProtectHostname");
        }
        let protect_hostname = systemctl_property(name, "ProtectHostname");
        assert!(
            protect_hostname == "yes" || protect_hostname == "true",
            "PID 1 must apply derived ProtectHostname, got {protect_hostname}"
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
    fn pid1_worker_restrict_suidsgid() {
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
        let job = JobId::create([0x1b; 16]).expect("job");
        let runtime = approved_pid1_runtime();
        let worker = Principal::create(2102, 2102);
        let spec = TransientUnits::derive(
            job,
            PathBuf::from("/run/storecore_media/jobs"),
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
        let name = spec.worker().name().as_str().expect("worker unit name");
        let started_worker = systemd.start_transient(UnitKind::Worker, &spec);
        if started_worker.is_err() {
            dump_worker_unit(&spec, started_worker, &where_path);
            panic!("StartTransientUnit rejected derived RestrictSUIDSGID");
        }
        let restrict_suidsgid = systemctl_property(name, "RestrictSUIDSGID");
        assert!(
            restrict_suidsgid == "yes" || restrict_suidsgid == "true",
            "PID 1 must apply derived RestrictSUIDSGID, got {restrict_suidsgid}"
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
    fn pid1_worker_protect_clock() {
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
        let job = JobId::create([0x1c; 16]).expect("job");
        let runtime = approved_pid1_runtime();
        let worker = Principal::create(2102, 2102);
        let spec = TransientUnits::derive(
            job,
            PathBuf::from("/run/storecore_media/jobs"),
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
        let name = spec.worker().name().as_str().expect("worker unit name");
        let started_worker = systemd.start_transient(UnitKind::Worker, &spec);
        if started_worker.is_err() {
            dump_worker_unit(&spec, started_worker, &where_path);
            panic!("StartTransientUnit rejected derived ProtectClock");
        }
        let protect_clock = systemctl_property(name, "ProtectClock");
        assert!(
            protect_clock == "yes" || protect_clock == "true",
            "PID 1 must apply derived ProtectClock, got {protect_clock}"
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
    fn pid1_worker_protect_kernel_logs() {
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
        let job = JobId::create([0x1d; 16]).expect("job");
        let runtime = approved_pid1_runtime();
        let worker = Principal::create(2102, 2102);
        let spec = TransientUnits::derive(
            job,
            PathBuf::from("/run/storecore_media/jobs"),
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
        let name = spec.worker().name().as_str().expect("worker unit name");
        let started_worker = systemd.start_transient(UnitKind::Worker, &spec);
        if started_worker.is_err() {
            dump_worker_unit(&spec, started_worker, &where_path);
            panic!("StartTransientUnit rejected derived ProtectKernelLogs");
        }
        let protect_kernel_logs = systemctl_property(name, "ProtectKernelLogs");
        assert!(
            protect_kernel_logs == "yes" || protect_kernel_logs == "true",
            "PID 1 must apply derived ProtectKernelLogs, got {protect_kernel_logs}"
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
    fn pid1_worker_protect_kernel_modules() {
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
        let job = JobId::create([0x1e; 16]).expect("job");
        let runtime = approved_pid1_runtime();
        let worker = Principal::create(2102, 2102);
        let spec = TransientUnits::derive(
            job,
            PathBuf::from("/run/storecore_media/jobs"),
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
        let name = spec.worker().name().as_str().expect("worker unit name");
        let started_worker = systemd.start_transient(UnitKind::Worker, &spec);
        if started_worker.is_err() {
            dump_worker_unit(&spec, started_worker, &where_path);
            panic!("StartTransientUnit rejected derived ProtectKernelModules");
        }
        let protect_kernel_modules = systemctl_property(name, "ProtectKernelModules");
        assert!(
            protect_kernel_modules == "yes" || protect_kernel_modules == "true",
            "PID 1 must apply derived ProtectKernelModules, got {protect_kernel_modules}"
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
    fn pid1_worker_limit_as() {
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
        let job = JobId::create([0x1f; 16]).expect("job");
        let runtime = approved_pid1_runtime();
        let worker = Principal::create(2102, 2102);
        let spec = TransientUnits::derive(
            job,
            PathBuf::from("/run/storecore_media/jobs"),
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
        let name = spec.worker().name().as_str().expect("worker unit name");
        let started_worker = systemd.start_transient(UnitKind::Worker, &spec);
        if started_worker.is_err() {
            dump_worker_unit(&spec, started_worker, &where_path);
            panic!("StartTransientUnit rejected derived LimitAS");
        }
        let limit_as = systemctl_property(name, "LimitAS");
        let expected = WORKER_LIMIT_AS.to_string();
        assert!(
            limit_as == expected || limit_as.starts_with(&format!("{expected}:")),
            "PID 1 must apply derived LimitAS, got {limit_as}"
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
    fn pid1_worker_limit_data() {
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
        let job = JobId::create([0x20; 16]).expect("job");
        let runtime = approved_pid1_runtime();
        let worker = Principal::create(2102, 2102);
        let spec = TransientUnits::derive(
            job,
            PathBuf::from("/run/storecore_media/jobs"),
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
        let name = spec.worker().name().as_str().expect("worker unit name");
        let started_worker = systemd.start_transient(UnitKind::Worker, &spec);
        if started_worker.is_err() {
            dump_worker_unit(&spec, started_worker, &where_path);
            panic!("StartTransientUnit rejected derived LimitDATA");
        }
        let limit_data = systemctl_property(name, "LimitDATA");
        let expected = WORKER_LIMIT_DATA.to_string();
        assert!(
            limit_data == expected || limit_data.starts_with(&format!("{expected}:")),
            "PID 1 must apply derived LimitDATA, got {limit_data}"
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
    fn pid1_worker_limit_stack() {
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
        let job = JobId::create([0x21; 16]).expect("job");
        let runtime = approved_pid1_runtime();
        let worker = Principal::create(2102, 2102);
        let spec = TransientUnits::derive(
            job,
            PathBuf::from("/run/storecore_media/jobs"),
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
        let name = spec.worker().name().as_str().expect("worker unit name");
        let started_worker = systemd.start_transient(UnitKind::Worker, &spec);
        if started_worker.is_err() {
            dump_worker_unit(&spec, started_worker, &where_path);
            panic!("StartTransientUnit rejected derived LimitSTACK");
        }
        let limit_stack = systemctl_property(name, "LimitSTACK");
        let expected = WORKER_LIMIT_STACK.to_string();
        assert!(
            limit_stack == expected || limit_stack.starts_with(&format!("{expected}:")),
            "PID 1 must apply derived LimitSTACK, got {limit_stack}"
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
    fn pid1_global_job_budget_rejects_second_allocation() {
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
        let journal_root = PathBuf::from("/run/storecore_media/journal-4c-global-quota");
        let _ = fs::remove_dir_all(&journal_root);
        fs::create_dir(&journal_root).expect("journal root");
        fs::set_permissions(&journal_root, fs::Permissions::from_mode(0o700))
            .expect("journal mode");
        let owner = rustix::process::geteuid().as_raw();
        let limits =
            BudgetLimits::create(1, 1, MOUNT_BYTES, MOUNT_INODES, MOUNT_BYTES, MOUNT_INODES)
                .expect("limits");
        let mut store = BrokerStore::open(&journal_root, owner, limits).expect("store");
        assert_eq!(
            store.finish_reconciliation(false),
            Ok(AdmissionStatus::Open)
        );
        let first_id = JobId::create([0x22; 16]).expect("job a");
        let first = store
            .allocate(
                first_id.bytes(),
                Principal::create(2101, 2101),
                [0xae; 16],
                Reservation::create(MOUNT_BYTES, MOUNT_INODES, 1).expect("reservation"),
                1,
            )
            .expect("first allocate");
        assert_eq!(store.usage().jobs(), 1);
        let mut systemd = ZbusSystemd::connect_system().expect("system bus");
        let runtime = approved_pid1_runtime();
        let worker = Principal::create(2102, 2102);
        let spec_a = TransientUnits::derive(
            first.job_id(),
            PathBuf::from("/run/storecore_media/jobs"),
            worker,
            &runtime,
        )
        .expect("spec a");
        let started_mount = systemd
            .start_transient(UnitKind::Mount, &spec_a)
            .expect("start first mount");
        assert_eq!(started_mount, UnitState::Active);
        assert_eq!(
            store.allocate(
                [0x23; 16],
                Principal::create(2101, 2101),
                [0xae; 16],
                Reservation::create(MOUNT_BYTES, MOUNT_INODES, 1).expect("reservation"),
                2,
            ),
            Err(StoreError::Budget(BudgetError::JobLimit))
        );
        assert_eq!(store.record(first.job_id()), Ok(first));
        assert_eq!(store.usage().jobs(), 1);
        let spec_b = TransientUnits::derive(
            JobId::create([0x23; 16]).expect("job b"),
            PathBuf::from("/run/storecore_media/jobs"),
            worker,
            &runtime,
        )
        .expect("spec b");
        assert_eq!(
            systemd.attest(UnitKind::Mount, &spec_b),
            Err(SystemdError::NotLoaded)
        );
        let stopped_mount = systemd.stop(UnitKind::Mount, &spec_a).expect("stop mount");
        assert!(matches!(
            stopped_mount,
            UnitState::Inactive | UnitState::Failed
        ));
        drop(store);
        let _ = fs::remove_dir_all(&journal_root);
    }

    #[test]
    #[ignore = "requires root, systemd PID 1, approved Java/jar, and the system bus"]
    fn pid1_stop_kills_extra_cgroup_process() {
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
        let job = JobId::create([0xbb; 16]).expect("job");
        let runtime = approved_pid1_runtime();
        let worker = Principal::create(2102, 2102);
        let spec = TransientUnits::derive(
            job,
            PathBuf::from("/run/storecore_media/jobs"),
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
        let name = spec.worker().name().as_str().expect("worker unit name");
        let started_worker = systemd.start_transient(UnitKind::Worker, &spec);
        if started_worker.is_err() {
            dump_worker_unit(&spec, started_worker, &where_path);
            panic!("StartTransientUnit rejected derived KillMode");
        }
        freeze_worker_main_pid(name);
        assert_eq!(
            systemctl_property(name, "KillMode"),
            "control-group",
            "PID 1 must apply derived KillMode"
        );
        let kill_signal = systemctl_property(name, "KillSignal");
        assert!(
            kill_signal == "9" || kill_signal == "SIGKILL",
            "PID 1 must apply derived KillSignal, got {kill_signal}"
        );
        let mut extra = spawn_cgroup_sleeper(name);
        let extra_pid = extra.id();
        let continued = Command::new("kill")
            .args(["-CONT", &extra_pid.to_string()])
            .status()
            .unwrap_or_else(|error| panic!("kill -CONT extra {extra_pid}: {error}"));
        assert!(
            continued.success(),
            "kill -CONT extra {extra_pid} failed with {continued}"
        );
        let stopped_worker = systemd.stop(UnitKind::Worker, &spec).expect("stop worker");
        assert!(matches!(
            stopped_worker,
            UnitState::Inactive | UnitState::Failed
        ));
        wait_child_reaped(&mut extra, Duration::from_secs(8));
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

    fn copied_pid1_runtime() -> (PathBuf, ApprovedRuntime) {
        let src_java =
            PathBuf::from(std::env::var("STORECORE_MEDIA_JAVA").expect("STORECORE_MEDIA_JAVA"));
        let src_jar =
            PathBuf::from(std::env::var("STORECORE_MEDIA_JAR").expect("STORECORE_MEDIA_JAR"));
        let id = NEXT.fetch_add(1, Ordering::Relaxed);
        let root = std::env::temp_dir().join(format!(
            "storecore-media-broker-sub-{}-{id}",
            std::process::id()
        ));
        fs::create_dir(&root).expect("sub root");
        let java = root.join("java");
        let jar = root.join("worker.jar");
        fs::copy(&src_java, &java).expect("copy java");
        fs::copy(&src_jar, &jar).expect("copy jar");
        fs::set_permissions(&java, fs::Permissions::from_mode(0o555)).expect("java mode");
        fs::set_permissions(&jar, fs::Permissions::from_mode(0o444)).expect("jar mode");
        unix_fs::chown(&java, Some(0), Some(0)).expect("java owner");
        unix_fs::chown(&jar, Some(0), Some(0)).expect("jar owner");
        let java_digest = Sha256::digest(fs::read(&java).expect("java bytes")).into();
        let jar_digest = Sha256::digest(fs::read(&jar).expect("jar bytes")).into();
        (
            jar.clone(),
            ApprovedRuntime::open(&java, &jar, 0, java_digest, jar_digest).expect("runtime"),
        )
    }

    fn freeze_worker_main_pid(name: &str) {
        let pid = systemctl_property(name, "MainPID");
        assert!(
            !pid.is_empty() && pid != "0",
            "RuntimeMax attest needs a live MainPID, got {pid}"
        );
        let stopped = Command::new("kill")
            .args(["-STOP", &pid])
            .status()
            .unwrap_or_else(|error| panic!("kill -STOP {pid}: {error}"));
        assert!(stopped.success(), "kill -STOP {pid} failed with {stopped}");
    }

    fn spawn_cgroup_sleeper(name: &str) -> std::process::Child {
        let relative = wait_control_group(name);
        let child = Command::new("sleep")
            .arg("60")
            .spawn()
            .unwrap_or_else(|error| panic!("sleep: {error}"));
        let pid = child.id();
        let stopped = Command::new("kill")
            .args(["-STOP", &pid.to_string()])
            .status()
            .unwrap_or_else(|error| panic!("kill -STOP extra {pid}: {error}"));
        assert!(
            stopped.success(),
            "kill -STOP extra {pid} failed with {stopped}"
        );
        wait_proc_stopped(pid);
        attach_pid_to_unit(name, pid);
        assert_in_worker_cgroup(name, &relative, pid);
        child
    }

    fn attach_pid_to_unit(name: &str, pid: u32) {
        let attached = Command::new("busctl")
            .args([
                "call",
                "--system",
                "org.freedesktop.systemd1",
                "/org/freedesktop/systemd1",
                "org.freedesktop.systemd1.Manager",
                "AttachProcessesToUnit",
                "ssau",
                name,
                "",
                "1",
                &pid.to_string(),
            ])
            .output()
            .unwrap_or_else(|error| panic!("busctl AttachProcessesToUnit: {error}"));
        if attached.status.success() {
            return;
        }
        let relative = wait_control_group(name);
        let procs = Path::new("/sys/fs/cgroup")
            .join(relative.trim_start_matches('/'))
            .join("cgroup.procs");
        fs::write(&procs, pid.to_string()).unwrap_or_else(|error| {
            panic!(
                "AttachProcessesToUnit failed: {}; cgroup.procs {}: {error}",
                String::from_utf8_lossy(&attached.stderr),
                procs.display()
            )
        });
    }

    fn assert_in_worker_cgroup(name: &str, relative: &str, pid: u32) {
        let marker = relative.trim_start_matches('/');
        let deadline = Instant::now() + Duration::from_secs(2);
        loop {
            let cgroup = fs::read_to_string(format!("/proc/{pid}/cgroup")).unwrap_or_default();
            if !marker.is_empty() && cgroup.contains(marker) {
                return;
            }
            assert!(
                Instant::now() < deadline,
                "extra {pid} not in {name} cgroup {marker}: {cgroup}"
            );
            thread::sleep(Duration::from_millis(20));
        }
    }

    fn wait_control_group(name: &str) -> String {
        let deadline = Instant::now() + Duration::from_secs(2);
        loop {
            let relative = systemctl_property(name, "ControlGroup");
            if !relative.is_empty() {
                return relative;
            }
            assert!(
                Instant::now() < deadline,
                "KillMode attest needs ControlGroup for {name}"
            );
            thread::sleep(Duration::from_millis(50));
        }
    }

    fn wait_child_reaped(child: &mut std::process::Child, timeout: Duration) {
        let pid = child.id();
        let deadline = Instant::now() + timeout;
        loop {
            match child.try_wait() {
                Ok(Some(_)) => return,
                Ok(None) => {
                    let status =
                        fs::read_to_string(format!("/proc/{pid}/status")).unwrap_or_default();
                    if status.lines().any(|line| line.starts_with("State:\tZ")) {
                        let _ = child.wait();
                        return;
                    }
                    assert!(
                        Instant::now() < deadline,
                        "cgroup member {pid} still alive after KillMode stop; {status}"
                    );
                    thread::sleep(Duration::from_millis(50));
                }
                Err(error) => panic!("wait extra {pid}: {error}"),
            }
        }
    }

    fn oom_worker_cgroup(name: &str) {
        let relative = systemctl_property(name, "ControlGroup");
        assert!(
            !relative.is_empty(),
            "OOM attest needs ControlGroup for {name}"
        );
        let dir = Path::new("/sys/fs/cgroup").join(relative.trim_start_matches('/'));
        let oom_group = dir.join("memory.oom.group");
        fs::write(&oom_group, "1")
            .unwrap_or_else(|error| panic!("write {}: {error}", oom_group.display()));
        let enabled = fs::read_to_string(&oom_group).unwrap_or_default();
        assert_eq!(
            enabled.trim(),
            "1",
            "memory.oom.group must be 1 at {}",
            oom_group.display()
        );
        let procs = dir.join("cgroup.procs");
        let script = format!(
            "import os, signal, time\nos.kill(os.getpid(), signal.SIGSTOP)\nb=bytearray({WORKER_OOM_PROBE_BYTES})\nfor i in range(0, len(b), 4096):\n    b[i]=1\ntime.sleep(30)"
        );
        let hog = Command::new("python3")
            .args(["-c", &script])
            .spawn()
            .unwrap_or_else(|error| panic!("python3 hog: {error}"));
        let pid = hog.id();
        wait_proc_stopped(pid);
        fs::write(&procs, pid.to_string())
            .unwrap_or_else(|error| panic!("move hog {pid} into {}: {error}", procs.display()));
        let continued = Command::new("kill")
            .args(["-CONT", &pid.to_string()])
            .status()
            .unwrap_or_else(|error| panic!("kill -CONT {pid}: {error}"));
        assert!(
            continued.success(),
            "kill -CONT {pid} failed with {continued}"
        );
        std::mem::forget(hog);
    }

    fn wait_proc_stopped(pid: u32) {
        let deadline = Instant::now() + Duration::from_secs(2);
        let path = format!("/proc/{pid}/status");
        loop {
            let status = fs::read_to_string(&path).unwrap_or_default();
            if status.lines().any(|line| line.starts_with("State:\tT")) {
                return;
            }
            assert!(
                Instant::now() < deadline,
                "hog {pid} did not SIGSTOP, status={status}"
            );
            thread::sleep(Duration::from_millis(10));
        }
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

    fn assert_uid_a_process(where_path: &Path) {
        let identity = Command::new("setpriv")
            .args([
                "--reuid=2101",
                "--regid=2101",
                "--clear-groups",
                "--",
                "id",
                "-u",
            ])
            .output()
            .expect("setpriv id");
        assert!(
            identity.status.success(),
            "setpriv id failed: {}",
            String::from_utf8_lossy(&identity.stderr)
        );
        assert_eq!(
            String::from_utf8_lossy(&identity.stdout).trim(),
            "2101",
            "UID A process must run as 2101"
        );
        let request = where_path.join("request.bin");
        let read = Command::new("setpriv")
            .args([
                "--reuid=2101",
                "--regid=2101",
                "--clear-groups",
                "--",
                "head",
                "-c",
                "1",
            ])
            .arg(&request)
            .output()
            .expect("setpriv read");
        assert!(
            !read.status.success(),
            "UID A process must not search the 03770 job tmpfs"
        );
        let read_err = String::from_utf8_lossy(&read.stderr);
        assert!(
            read_err.contains("Permission denied"),
            "UID A read must fail closed on the job tmpfs, got {read_err}"
        );
        let probe = where_path.join("uid-a-write.bin");
        let write = Command::new("setpriv")
            .args([
                "--reuid=2101",
                "--regid=2101",
                "--clear-groups",
                "--",
                "dd",
                "if=/dev/zero",
                &format!("of={}", probe.display()),
                "bs=1",
                "count=1",
            ])
            .output()
            .expect("setpriv write");
        assert!(
            !write.status.success(),
            "UID A process must not write the 03770 job tmpfs"
        );
        assert!(
            !probe.exists(),
            "UID A process must not leave a file in the job tmpfs"
        );
    }

    fn start_pid1_self_test_worker(
        systemd: &mut ZbusSystemd,
        job: JobId,
        runtime: &ApprovedRuntime,
        worker: Principal,
    ) -> TransientUnits {
        let spec = TransientUnits::derive(
            job,
            PathBuf::from("/run/storecore_media/jobs"),
            worker,
            runtime,
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
        assert_eq!(
            started_worker.expect("start worker"),
            UnitState::Active,
            "RemainAfterExit keeps the worker Active after SELF_TEST exits"
        );
        spec
    }

    fn stop_pid1_worker(systemd: &mut ZbusSystemd, spec: &TransientUnits) {
        let stopped_worker = systemd.stop(UnitKind::Worker, spec).expect("stop worker");
        assert!(matches!(
            stopped_worker,
            UnitState::Inactive | UnitState::Failed
        ));
        let stopped_mount = systemd.stop(UnitKind::Mount, spec).expect("stop mount");
        assert!(matches!(
            stopped_mount,
            UnitState::Inactive | UnitState::Failed
        ));
    }

    fn assert_worker_job_isolation(spec: &TransientUnits, peer_where: &Path) {
        let name = spec.worker().name().as_str().expect("worker unit name");
        let own = spec.mount().where_path().to_str().expect("own where");
        let peer = peer_where.to_str().expect("peer where");
        assert_ne!(own, peer, "jobs must not share Where");
        let writable = systemctl_property(name, "ReadWritePaths");
        let writable_paths: Vec<&str> = writable.split_whitespace().collect();
        assert!(
            writable_paths.contains(&own),
            "ReadWritePaths of {name} must include own Where {own}: {writable}"
        );
        assert!(
            !writable_paths.contains(&peer),
            "ReadWritePaths of {name} must not include peer Where {peer}: {writable}"
        );
        assert!(
            !writable_paths
                .iter()
                .any(|path| path.starts_with("/run/storecore_media/jobs/") && *path != own),
            "ReadWritePaths of {name} must not include another job Where: {writable}"
        );
    }

    fn systemctl_property(name: &str, property: &str) -> String {
        let shown = Command::new("systemctl")
            .args(["show", name, "-p", property, "--value"])
            .output()
            .unwrap_or_else(|error| panic!("systemctl {property}: {error}"));
        assert!(
            shown.status.success(),
            "systemctl {property} failed for {name}: {}",
            String::from_utf8_lossy(&shown.stderr)
        );
        String::from_utf8_lossy(&shown.stdout).trim().to_owned()
    }

    fn worker_journal(name: &str) -> String {
        let journal = Command::new("journalctl")
            .args(["-b", "-u", name, "--no-pager", "-n", "80"])
            .output()
            .unwrap_or_else(|error| panic!("journalctl {name}: {error}"));
        String::from_utf8_lossy(&journal.stdout).into_owned()
    }

    fn wait_runtime_timeout_journal(
        name: &str,
        timeout: Duration,
        spec: &TransientUnits,
        started: Result<UnitState, SystemdError>,
        where_path: &Path,
    ) {
        let deadline = Instant::now() + timeout;
        loop {
            let result = systemctl_property(name, "Result");
            let journal = worker_journal(name);
            if journal.contains("Reached runtime time limit")
                || journal.contains("result 'timeout'")
                || journal.contains("Failed with result 'timeout'")
            {
                return;
            }
            if Instant::now() >= deadline {
                dump_worker_unit(spec, started, where_path);
            }
            assert!(
                Instant::now() < deadline,
                "RuntimeMax timeout for {name} want Result=timeout, got Result={result}"
            );
            thread::sleep(Duration::from_millis(50));
        }
    }

    fn wait_oom_kill_journal(
        name: &str,
        timeout: Duration,
        spec: &TransientUnits,
        started: Result<UnitState, SystemdError>,
        where_path: &Path,
    ) {
        let deadline = Instant::now() + timeout;
        loop {
            let result = systemctl_property(name, "Result");
            let journal = worker_journal(name);
            if journal.contains("oom-kill")
                || journal.contains("result 'oom-kill'")
                || journal.contains("Failed with result 'oom-kill'")
                || journal.contains("Memory cgroup out of memory")
                || result == "oom-kill"
            {
                return;
            }
            if Instant::now() >= deadline {
                dump_worker_unit(spec, started, where_path);
            }
            assert!(
                Instant::now() < deadline,
                "OOM kill for {name} want Result=oom-kill, got Result={result}"
            );
            thread::sleep(Duration::from_millis(50));
        }
    }

    fn wait_unknown_exit_journal(
        name: &str,
        timeout: Duration,
        spec: &TransientUnits,
        started: Result<UnitState, SystemdError>,
        where_path: &Path,
    ) {
        let deadline = Instant::now() + timeout;
        loop {
            let status = systemctl_property(name, "ExecMainStatus");
            let result = systemctl_property(name, "Result");
            let journal = worker_journal(name);
            if status == "2" || result == "exit-code" || journal.contains("status=2") {
                assert!(
                    journal.contains("status=2"),
                    "journal must record UNKNOWN_EXIT 2 for {name}: {journal}"
                );
                return;
            }
            if Instant::now() >= deadline {
                dump_worker_unit(spec, started, where_path);
            }
            assert!(
                Instant::now() < deadline,
                "UNKNOWN_EXIT for {name} want status=2, ExecMainStatus={status} Result={result}"
            );
            thread::sleep(Duration::from_millis(50));
        }
    }

    fn wait_exec_main_status(
        name: &str,
        expected: &str,
        timeout: Duration,
        spec: &TransientUnits,
        started: Result<UnitState, SystemdError>,
        where_path: &Path,
    ) {
        let deadline = Instant::now() + timeout;
        loop {
            let status = systemctl_property(name, "ExecMainStatus");
            let main_pid = systemctl_property(name, "MainPID");
            let exited = main_pid.is_empty() || main_pid == "0";
            if exited && status == expected {
                return;
            }
            if Instant::now() >= deadline {
                dump_worker_unit(spec, started, where_path);
            }
            assert!(
                Instant::now() < deadline,
                "ExecMainStatus for {name} want {expected}, got {status}, MainPID={main_pid}"
            );
            thread::sleep(Duration::from_millis(50));
        }
    }

    fn reset_failed_unit(name: &str) {
        let reset = Command::new("systemctl")
            .args(["reset-failed", name])
            .output()
            .unwrap_or_else(|error| panic!("systemctl reset-failed: {error}"));
        if reset.status.success() {
            return;
        }
        let stderr = String::from_utf8_lossy(&reset.stderr);
        assert!(
            stderr.contains("not loaded") || stderr.contains("not found"),
            "systemctl reset-failed {name}: {stderr}"
        );
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
