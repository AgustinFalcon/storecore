use crate::state::JobId;

const NAME_PREFIX: &[u8] = b"storecore-media-";
const MOUNT_SUFFIX: &[u8] = b".mount";
const WORKER_SUFFIX: &[u8] = b".scope";

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
    bytes: [u8; 64],
    length: usize,
}

impl UnitName {
    #[must_use]
    pub fn as_bytes(&self) -> &[u8] {
        &self.bytes[..self.length]
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct DerivedUnits {
    mount: UnitName,
    worker: UnitName,
}

impl DerivedUnits {
    #[must_use]
    pub fn from_job(job_id: JobId) -> Self {
        Self {
            mount: name_with_suffix(job_id, MOUNT_SUFFIX),
            worker: name_with_suffix(job_id, WORKER_SUFFIX),
        }
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

fn name_with_suffix(job_id: JobId, suffix: &[u8]) -> UnitName {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut bytes = [0_u8; 64];
    let mut length = 0_usize;
    for byte in NAME_PREFIX {
        bytes[length] = *byte;
        length += 1;
    }
    for byte in job_id.bytes() {
        bytes[length] = HEX[usize::from(byte >> 4)];
        length += 1;
        bytes[length] = HEX[usize::from(byte & 0x0f)];
        length += 1;
    }
    for byte in suffix {
        bytes[length] = *byte;
        length += 1;
    }
    debug_assert!(length <= 64);
    UnitName { bytes, length }
}

#[cfg(test)]
mod tests {
    use super::{DerivedUnits, UnitKind, UnitState};
    use crate::state::JobId;

    #[test]
    fn unknown_wire_values_stay_at_the_translator() {
        assert_eq!(UnitKind::from_wire(0), UnitKind::Unknown);
        assert_eq!(UnitKind::from_wire(99), UnitKind::Unknown);
        assert_eq!(UnitState::from_wire(0), UnitState::Unknown);
        assert_eq!(UnitKind::Unknown.to_wire(), 0);
        assert_eq!(UnitState::Unknown.to_wire(), 0);
    }

    #[test]
    fn unit_names_are_derived_only_from_the_job_identity() {
        let job = JobId::create([0xab; 16]).expect("job");
        let units = DerivedUnits::from_job(job);
        let mount_name = units.mount();
        let worker_name = units.worker();
        let mount = core::str::from_utf8(mount_name.as_bytes()).expect("utf8");
        let worker = core::str::from_utf8(worker_name.as_bytes()).expect("utf8");
        assert_eq!(
            mount,
            "storecore-media-abababababababababababababababab.mount"
        );
        assert_eq!(
            worker,
            "storecore-media-abababababababababababababababab.scope"
        );
    }
}
