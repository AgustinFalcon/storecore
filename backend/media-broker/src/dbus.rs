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
const METHOD_TIMEOUT: Duration = Duration::from_secs(5);
const POLL_INTERVAL: Duration = Duration::from_millis(50);

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
            .map_err(|_| SystemdError::Unavailable)?;
        validate_job_path(&job)
    }

    fn active_state(&self, name: &str) -> Result<UnitState, SystemdError> {
        let unit_path: OwnedObjectPath = self
            .manager()?
            .call("GetUnit", &(name,))
            .map_err(|_| SystemdError::Unavailable)?;
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
                _ => Err(error),
            };
        }
        self.wait_state(&name, |state| {
            matches!(state, UnitState::Inactive | UnitState::Failed)
        })
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
    let options = utf8(spec.mount().options())?.to_owned();
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
        ("WorkingDirectory", Value::from(workspace)),
    ])
}

fn required_name(name: UnitName) -> Result<String, SystemdError> {
    name.as_str()
        .map(str::to_owned)
        .ok_or(SystemdError::Unavailable)
}

fn utf8(bytes: &[u8]) -> Result<&str, SystemdError> {
    core::str::from_utf8(bytes).map_err(|_| SystemdError::Unavailable)
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
    use super::{mount_properties, worker_properties};
    use crate::runtime::ApprovedRuntime;
    use crate::state::{JobId, Principal};
    use crate::systemd::TransientUnits;
    use sha2::{Digest, Sha256};
    use std::fs::{self, OpenOptions};
    use std::io::Write;
    use std::os::unix::fs::OpenOptionsExt;
    use std::sync::atomic::{AtomicU64, Ordering};

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
        assert_eq!(
            spec.mount().name().as_str().expect("utf8"),
            "run-storecore_media-jobs-abababababababababababababababab.mount"
        );
        assert_eq!(spec.worker().argv()[1], "-jar");
        assert_eq!(spec.worker().argv()[0], spec.worker().java());
        assert_eq!(spec.worker().argv()[2], spec.worker().jar());
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
