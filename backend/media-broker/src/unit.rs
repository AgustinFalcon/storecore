use std::path::{Component, Path, PathBuf};

use crate::state::JobId;

const NAME_PREFIX: &[u8] = b"storecore-media-";
const MOUNT_SUFFIX: &[u8] = b".mount";
const WORKER_SUFFIX: &[u8] = b".service";
const UNIT_NAME_MAX: usize = 255;
const HEX: &[u8; 16] = b"0123456789abcdef";

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum UnitKind {
    Mount,
    Worker,
    Unknown,
}

impl UnitKind {
    #[must_use]
    pub const fn from_wire(value: u8) -> Self {
        match value {
            1 => Self::Mount,
            2 => Self::Worker,
            _ => Self::Unknown,
        }
    }

    #[must_use]
    pub const fn to_wire(self) -> u8 {
        match self {
            Self::Mount => 1,
            Self::Worker => 2,
            Self::Unknown => 0,
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum UnitState {
    Inactive,
    Activating,
    Active,
    Deactivating,
    Failed,
    Unknown,
}

impl UnitState {
    #[must_use]
    pub const fn from_wire(value: u8) -> Self {
        match value {
            1 => Self::Inactive,
            2 => Self::Activating,
            3 => Self::Active,
            4 => Self::Deactivating,
            5 => Self::Failed,
            _ => Self::Unknown,
        }
    }

    #[must_use]
    pub fn from_active_state(raw: &str) -> Self {
        match raw {
            "inactive" => Self::Inactive,
            "activating" => Self::Activating,
            "active" => Self::Active,
            "deactivating" => Self::Deactivating,
            "failed" => Self::Failed,
            _ => Self::Unknown,
        }
    }

    #[must_use]
    pub const fn to_wire(self) -> u8 {
        match self {
            Self::Inactive => 1,
            Self::Activating => 2,
            Self::Active => 3,
            Self::Deactivating => 4,
            Self::Failed => 5,
            Self::Unknown => 0,
        }
    }

    #[must_use]
    pub const fn is_active(self) -> bool {
        matches!(self, Self::Active)
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct UnitName {
    bytes: [u8; UNIT_NAME_MAX],
    length: usize,
}

impl UnitName {
    #[must_use]
    pub fn as_bytes(&self) -> &[u8] {
        &self.bytes[..self.length]
    }

    #[must_use]
    pub fn as_str(&self) -> Option<&str> {
        core::str::from_utf8(self.as_bytes()).ok()
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct DerivedUnits {
    mount: UnitName,
    worker: UnitName,
}

impl DerivedUnits {
    /// Derives the `.mount` name from the escaped `Where` path and the worker
    /// `.service` name from the job identity. Callers cannot supply either name.
    #[must_use]
    pub fn derive(job_id: JobId, where_path: &Path) -> Option<Self> {
        Some(Self {
            mount: mount_unit_name(where_path)?,
            worker: name_with_suffix(job_id, WORKER_SUFFIX),
        })
    }

    #[must_use]
    pub const fn mount(self) -> UnitName {
        self.mount
    }

    #[must_use]
    pub const fn worker(self) -> UnitName {
        self.worker
    }
}

#[must_use]
pub(crate) fn encode_job_hex(job_id: JobId) -> [u8; 32] {
    let mut out = [0_u8; 32];
    let mut length = 0_usize;
    for byte in job_id.bytes() {
        out[length] = HEX[usize::from(byte >> 4)];
        length += 1;
        out[length] = HEX[usize::from(byte & 0x0f)];
        length += 1;
    }
    out
}

#[must_use]
pub fn mount_unit_name(where_path: &Path) -> Option<UnitName> {
    let normalized = normalize_absolute(where_path)?;
    let raw = normalized.to_str()?;
    let escaped = if raw == "/" {
        vec![b'-']
    } else {
        escape_unit_bytes(raw.trim_start_matches('/').as_bytes())?
    };
    with_suffix(&escaped, MOUNT_SUFFIX)
}

fn normalize_absolute(path: &Path) -> Option<PathBuf> {
    if !path.is_absolute() {
        return None;
    }
    let mut out = PathBuf::new();
    for component in path.components() {
        match component {
            Component::RootDir => out.push(Component::RootDir),
            Component::Normal(part) => out.push(part),
            Component::CurDir => {}
            Component::ParentDir | Component::Prefix(_) => return None,
        }
    }
    Some(out)
}

fn escape_unit_bytes(input: &[u8]) -> Option<Vec<u8>> {
    let mut escaped = Vec::new();
    for byte in input {
        match *byte {
            b'/' => escaped.push(b'-'),
            byte if is_unescaped_unit_byte(byte) => escaped.push(byte),
            byte => {
                escaped.push(b'\\');
                escaped.push(b'x');
                escaped.push(HEX[usize::from(byte >> 4)]);
                escaped.push(HEX[usize::from(byte & 0x0f)]);
            }
        }
        if escaped.len() + MOUNT_SUFFIX.len() > UNIT_NAME_MAX {
            return None;
        }
    }
    Some(escaped)
}

const fn is_unescaped_unit_byte(byte: u8) -> bool {
    byte.is_ascii_alphanumeric() || matches!(byte, b':' | b'_' | b'.')
}

fn name_with_suffix(job_id: JobId, suffix: &[u8]) -> UnitName {
    let mut bytes = Vec::from(NAME_PREFIX);
    bytes.extend_from_slice(&encode_job_hex(job_id));
    with_suffix(&bytes, suffix).expect("job worker name fits")
}

fn with_suffix(stem: &[u8], suffix: &[u8]) -> Option<UnitName> {
    let length = stem.len().checked_add(suffix.len())?;
    if length == 0 || length > UNIT_NAME_MAX {
        return None;
    }
    let mut bytes = [0_u8; UNIT_NAME_MAX];
    bytes[..stem.len()].copy_from_slice(stem);
    bytes[stem.len()..length].copy_from_slice(suffix);
    Some(UnitName { bytes, length })
}

#[cfg(test)]
mod tests {
    use super::{DerivedUnits, UnitKind, UnitState, mount_unit_name};
    use crate::state::JobId;
    use std::path::Path;

    #[test]
    fn unknown_wire_values_stay_at_the_translator() {
        assert_eq!(UnitKind::from_wire(0), UnitKind::Unknown);
        assert_eq!(UnitKind::from_wire(99), UnitKind::Unknown);
        assert_eq!(UnitState::from_wire(0), UnitState::Unknown);
        assert_eq!(UnitKind::Unknown.to_wire(), 0);
        assert_eq!(UnitState::Unknown.to_wire(), 0);
        assert_eq!(
            UnitState::from_active_state("reloading"),
            UnitState::Unknown
        );
        assert_eq!(
            UnitState::from_active_state("maintenance"),
            UnitState::Unknown
        );
    }

    #[test]
    fn mount_unit_name_is_the_escaped_where_path() {
        assert_eq!(
            utf8(mount_unit_name(Path::new("/home/lennart"))),
            "home-lennart.mount"
        );
        assert_eq!(
            utf8(mount_unit_name(Path::new("/tmp/foo-bar"))),
            r"tmp-foo\x2dbar.mount"
        );
        assert_eq!(utf8(mount_unit_name(Path::new("/"))), "-.mount");
        assert_eq!(
            utf8(mount_unit_name(Path::new(
                "/run/storecore_media/jobs/abababababababababababababababab"
            ))),
            "run-storecore_media-jobs-abababababababababababababababab.mount"
        );
        assert!(mount_unit_name(Path::new("relative/mnt")).is_none());
        assert!(mount_unit_name(Path::new("/tmp/../etc")).is_none());
    }

    #[test]
    fn worker_service_is_derived_only_from_the_job_identity() {
        let job = JobId::create([0xab; 16]).expect("job");
        let where_path = Path::new("/run/storecore_media/jobs/abababababababababababababababab");
        let units = DerivedUnits::derive(job, where_path).expect("units");
        assert_eq!(
            units.mount().as_str().expect("utf8"),
            "run-storecore_media-jobs-abababababababababababababababab.mount"
        );
        assert_eq!(
            units.worker().as_str().expect("utf8"),
            "storecore-media-abababababababababababababababab.service"
        );
    }

    fn utf8(name: Option<super::UnitName>) -> String {
        name.expect("name").as_str().expect("utf8").to_owned()
    }
}
