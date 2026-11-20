use std::collections::BTreeSet;

pub trait RuntimeInventory {
    fn has_pid(&self, job_id: [u8; 16]) -> bool;
    fn has_cgroup(&self, job_id: [u8; 16]) -> bool;
    fn has_mount(&self, job_id: [u8; 16]) -> bool;
    fn has_unit(&self, job_id: [u8; 16]) -> bool;
}

#[derive(Clone, Debug, Default, Eq, PartialEq)]
pub struct FakeRuntime {
    pids: BTreeSet<[u8; 16]>,
    cgroups: BTreeSet<[u8; 16]>,
    mounts: BTreeSet<[u8; 16]>,
    units: BTreeSet<[u8; 16]>,
}

impl FakeRuntime {
    #[must_use]
    pub fn empty() -> Self {
        Self::default()
    }

    pub fn insert_unit(&mut self, job_id: [u8; 16]) {
        self.units.insert(job_id);
        self.cgroups.insert(job_id);
        self.pids.insert(job_id);
        self.mounts.insert(job_id);
    }

    pub fn clear(&mut self, job_id: [u8; 16]) {
        self.units.remove(&job_id);
        self.cgroups.remove(&job_id);
        self.pids.remove(&job_id);
        self.mounts.remove(&job_id);
    }

    pub fn insert_pid_only(&mut self, job_id: [u8; 16]) {
        self.pids.insert(job_id);
    }
}

impl RuntimeInventory for FakeRuntime {
    fn has_pid(&self, job_id: [u8; 16]) -> bool {
        self.pids.contains(&job_id)
    }
    fn has_cgroup(&self, job_id: [u8; 16]) -> bool {
        self.cgroups.contains(&job_id)
    }
    fn has_mount(&self, job_id: [u8; 16]) -> bool {
        self.mounts.contains(&job_id)
    }
    fn has_unit(&self, job_id: [u8; 16]) -> bool {
        self.units.contains(&job_id)
    }
}

#[must_use]
pub fn leftover<I: RuntimeInventory>(inventory: &I, job_id: [u8; 16]) -> bool {
    inventory.has_pid(job_id)
        || inventory.has_cgroup(job_id)
        || inventory.has_mount(job_id)
        || inventory.has_unit(job_id)
}

#[must_use]
pub fn complete_unit<I: RuntimeInventory>(inventory: &I, job_id: [u8; 16]) -> bool {
    inventory.has_unit(job_id) && inventory.has_cgroup(job_id)
}
