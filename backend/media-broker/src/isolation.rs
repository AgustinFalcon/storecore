use std::path::{Path, PathBuf};

use crate::state::JobId;

const JOB_ROOT: &str = "/run/storecore_media/jobs";
const RUNTIME_ROOT: &str = "/usr/lib/storecore/media-runtime/image-io-v1";
const JAVA_PATH: &str = "/usr/lib/storecore/media-runtime/image-io-v1/bin/java";
const WORKER_JAR_PATH: &str =
    "/usr/lib/storecore/media-runtime/image-io-v1/storecore-media-worker.jar";
const WORKSPACE_BYTES: u64 = 48 * 1024 * 1024;
const WORKSPACE_INODES: u64 = 4_096;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum MediaIsolationProfileId {
    ImageIoV1,
    Unknown,
}

impl MediaIsolationProfileId {
    #[must_use]
    pub const fn from_wire(raw: u8) -> Self {
        match raw {
            1 => Self::ImageIoV1,
            _ => Self::Unknown,
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct WorkerPrincipal {
    uid: u32,
    gid: u32,
}

impl WorkerPrincipal {
    #[must_use]
    pub const fn create(uid: u32, gid: u32) -> Option<Self> {
        if uid == 0 || gid == 0 {
            None
        } else {
            Some(Self { uid, gid })
        }
    }

    #[must_use]
    pub const fn uid(self) -> u32 {
        self.uid
    }

    #[must_use]
    pub const fn gid(self) -> u32 {
        self.gid
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct ApprovedRuntime {
    java_sha256: [u8; 32],
    worker_jar_sha256: [u8; 32],
}

impl ApprovedRuntime {
    #[must_use]
    pub fn create(java_sha256: [u8; 32], worker_jar_sha256: [u8; 32]) -> Option<Self> {
        if java_sha256 == [0; 32] || worker_jar_sha256 == [0; 32] {
            None
        } else {
            Some(Self {
                java_sha256,
                worker_jar_sha256,
            })
        }
    }

    #[must_use]
    pub fn root(self) -> &'static Path {
        Path::new(RUNTIME_ROOT)
    }

    #[must_use]
    pub fn java(self) -> &'static Path {
        Path::new(JAVA_PATH)
    }

    #[must_use]
    pub fn worker_jar(self) -> &'static Path {
        Path::new(WORKER_JAR_PATH)
    }

    #[must_use]
    pub const fn java_sha256(self) -> [u8; 32] {
        self.java_sha256
    }

    #[must_use]
    pub const fn worker_jar_sha256(self) -> [u8; 32] {
        self.worker_jar_sha256
    }

    /// Verifies the fixed runtime chain against evidence collected without
    /// following symlinks.
    ///
    /// # Errors
    ///
    /// Returns a closed [`RuntimeAttestationError`] for missing, unknown,
    /// writable, non-root-owned, symlinked or digest-mismatched evidence.
    pub fn attest(
        self,
        source: &mut impl RuntimeEvidenceSource,
    ) -> Result<RuntimeAttestation, RuntimeAttestationError> {
        verify_node(
            source,
            self.root(),
            RuntimeObjectKind::Directory,
            0o555,
            None,
        )?;
        verify_node(
            source,
            Path::new(RUNTIME_ROOT).join("bin").as_path(),
            RuntimeObjectKind::Directory,
            0o555,
            None,
        )?;
        verify_node(
            source,
            self.java(),
            RuntimeObjectKind::RegularFile,
            0o555,
            Some(self.java_sha256),
        )?;
        verify_node(
            source,
            self.worker_jar(),
            RuntimeObjectKind::RegularFile,
            0o444,
            Some(self.worker_jar_sha256),
        )?;
        Ok(RuntimeAttestation::Matched)
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum RuntimeObjectKind {
    Directory,
    RegularFile,
    Unknown,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct RuntimeNodeEvidence {
    kind: RuntimeObjectKind,
    owner_uid: u32,
    permissions: u32,
    symbolic_link: bool,
    sha256: Option<[u8; 32]>,
}

impl RuntimeNodeEvidence {
    #[must_use]
    pub const fn create(
        kind: RuntimeObjectKind,
        owner_uid: u32,
        permissions: u32,
        symbolic_link: bool,
        sha256: Option<[u8; 32]>,
    ) -> Option<Self> {
        if permissions > 0o7777 {
            None
        } else {
            Some(Self {
                kind,
                owner_uid,
                permissions,
                symbolic_link,
                sha256,
            })
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum RuntimeEvidenceError {
    Unavailable,
}

pub trait RuntimeEvidenceSource {
    /// Reads one broker-selected path without following a symlink.
    ///
    /// # Errors
    ///
    /// Returns [`RuntimeEvidenceError::Unavailable`] when complete evidence
    /// cannot be obtained.
    fn inspect(&mut self, path: &Path) -> Result<RuntimeNodeEvidence, RuntimeEvidenceError>;
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum RuntimeAttestation {
    Matched,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum RuntimeAttestationError {
    EvidenceUnavailable,
    UnknownObject,
    SymbolicLink,
    WrongObjectKind,
    WrongOwner,
    WrongPermissions,
    MissingDigest,
    DigestMismatch,
}

fn verify_node(
    source: &mut impl RuntimeEvidenceSource,
    path: &Path,
    expected_kind: RuntimeObjectKind,
    expected_permissions: u32,
    expected_digest: Option<[u8; 32]>,
) -> Result<(), RuntimeAttestationError> {
    let evidence = source
        .inspect(path)
        .map_err(|_| RuntimeAttestationError::EvidenceUnavailable)?;
    if evidence.kind == RuntimeObjectKind::Unknown {
        return Err(RuntimeAttestationError::UnknownObject);
    }
    if evidence.symbolic_link {
        return Err(RuntimeAttestationError::SymbolicLink);
    }
    if evidence.kind != expected_kind {
        return Err(RuntimeAttestationError::WrongObjectKind);
    }
    if evidence.owner_uid != 0 {
        return Err(RuntimeAttestationError::WrongOwner);
    }
    if evidence.permissions != expected_permissions {
        return Err(RuntimeAttestationError::WrongPermissions);
    }
    match (expected_digest, evidence.sha256) {
        (None, None) => Ok(()),
        (Some(expected), Some(observed)) if expected == observed => Ok(()),
        (Some(_), None) => Err(RuntimeAttestationError::MissingDigest),
        (Some(_), Some(_)) => Err(RuntimeAttestationError::DigestMismatch),
        (None, Some(_)) => Err(RuntimeAttestationError::DigestMismatch),
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum IsolationPolicyError {
    UnknownProfile,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct IsolationPolicy {
    worker: WorkerPrincipal,
    runtime: ApprovedRuntime,
}

impl IsolationPolicy {
    #[must_use]
    pub const fn create(worker: WorkerPrincipal, runtime: ApprovedRuntime) -> Self {
        Self { worker, runtime }
    }

    /// Derives every privileged identifier from broker-owned policy.
    ///
    /// # Errors
    ///
    /// Returns [`IsolationPolicyError::UnknownProfile`] for every profile not
    /// explicitly compiled into this broker.
    pub fn derive(
        self,
        job_id: JobId,
        profile: MediaIsolationProfileId,
    ) -> Result<IsolatedJobSpec, IsolationPolicyError> {
        if profile != MediaIsolationProfileId::ImageIoV1 {
            return Err(IsolationPolicyError::UnknownProfile);
        }
        let identity = RuntimeIdentity::derive(job_id, self.worker);
        Ok(IsolatedJobSpec {
            paths: identity.paths.clone(),
            mount: MountUnitSpec::derive(&identity, self.worker),
            worker: WorkerUnitSpec::derive(&identity, self.worker, self.runtime),
            runtime: self.runtime,
        })
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
struct RuntimeIdentity {
    job_hex: String,
    paths: JobPaths,
    mount_unit: String,
    worker_unit: String,
}

impl RuntimeIdentity {
    fn derive(job_id: JobId, worker: WorkerPrincipal) -> Self {
        let job_hex = encode_hex(job_id.bytes());
        Self {
            paths: JobPaths::derive(Path::new(JOB_ROOT).join(&job_hex), worker),
            mount_unit: format!("run-storecore_media-jobs-{job_hex}.mount"),
            worker_unit: format!("storecore-media-worker-{job_hex}.service"),
            job_hex,
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct JobPaths {
    root: PathBuf,
    input: PathBuf,
    request: PathBuf,
    output: PathBuf,
    result: PathBuf,
    diagnostic: PathBuf,
    worker_gid: u32,
}

impl JobPaths {
    fn derive(root: PathBuf, worker: WorkerPrincipal) -> Self {
        Self {
            input: root.join("input.bin"),
            request: root.join("request.bin"),
            output: root.join("output.bin"),
            result: root.join("result.bin"),
            diagnostic: root.join("diagnostic.bin"),
            worker_gid: worker.gid(),
            root,
        }
    }

    #[must_use]
    pub fn root(&self) -> &Path {
        &self.root
    }

    #[must_use]
    pub fn input(&self) -> &Path {
        &self.input
    }

    #[must_use]
    pub fn request(&self) -> &Path {
        &self.request
    }

    #[must_use]
    pub fn output(&self) -> &Path {
        &self.output
    }

    #[must_use]
    pub fn result(&self) -> &Path {
        &self.result
    }

    #[must_use]
    pub fn diagnostic(&self) -> &Path {
        &self.diagnostic
    }

    #[must_use]
    pub const fn snapshot_owner_uid(&self) -> u32 {
        0
    }

    #[must_use]
    pub const fn snapshot_permissions(&self) -> u32 {
        0o440
    }

    #[must_use]
    pub const fn snapshot_group_gid(&self) -> u32 {
        self.worker_gid
    }

    #[must_use]
    pub const fn workspace_permissions(&self) -> u32 {
        0o700
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct IsolatedJobSpec {
    paths: JobPaths,
    mount: MountUnitSpec,
    worker: WorkerUnitSpec,
    runtime: ApprovedRuntime,
}

impl IsolatedJobSpec {
    #[must_use]
    pub const fn paths(&self) -> &JobPaths {
        &self.paths
    }

    #[must_use]
    pub const fn mount(&self) -> &MountUnitSpec {
        &self.mount
    }

    #[must_use]
    pub const fn worker(&self) -> &WorkerUnitSpec {
        &self.worker
    }

    #[must_use]
    pub const fn runtime(&self) -> ApprovedRuntime {
        self.runtime
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct MountUnitSpec {
    unit_name: String,
    where_path: PathBuf,
    options: String,
}

impl MountUnitSpec {
    fn derive(identity: &RuntimeIdentity, worker: WorkerPrincipal) -> Self {
        Self {
            unit_name: identity.mount_unit.clone(),
            where_path: identity.paths.root.clone(),
            options: format!(
                "mode=0700,uid={},gid={},size={WORKSPACE_BYTES},nr_inodes={WORKSPACE_INODES},nosuid,nodev,noexec",
                worker.uid(),
                worker.gid()
            ),
        }
    }

    #[must_use]
    pub fn unit_name(&self) -> &str {
        &self.unit_name
    }

    #[must_use]
    pub const fn what(&self) -> &'static str {
        "tmpfs"
    }

    #[must_use]
    pub const fn file_system_type(&self) -> &'static str {
        "tmpfs"
    }

    #[must_use]
    pub fn where_path(&self) -> &Path {
        &self.where_path
    }

    #[must_use]
    pub fn options(&self) -> &str {
        &self.options
    }

    #[must_use]
    pub const fn directory_mode(&self) -> u32 {
        0o700
    }

    #[must_use]
    pub const fn collect_inactive_or_failed(&self) -> bool {
        true
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum AddressFamilyPolicy {
    UnixOnly,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum KillModePolicy {
    ControlGroup,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum DevicePolicy {
    Closed,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ProtectProcPolicy {
    Invisible,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum SystemCallArchitecturePolicy {
    Native,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct WorkerUnitSpec {
    unit_name: String,
    mount_unit: String,
    workspace: PathBuf,
    read_only_paths: [PathBuf; 2],
    worker: WorkerPrincipal,
    runtime: ApprovedRuntime,
}

impl WorkerUnitSpec {
    fn derive(
        identity: &RuntimeIdentity,
        worker: WorkerPrincipal,
        runtime: ApprovedRuntime,
    ) -> Self {
        Self {
            unit_name: identity.worker_unit.clone(),
            mount_unit: identity.mount_unit.clone(),
            workspace: identity.paths.root.clone(),
            read_only_paths: [identity.paths.input.clone(), identity.paths.request.clone()],
            worker,
            runtime,
        }
    }

    #[must_use]
    pub fn unit_name(&self) -> &str {
        &self.unit_name
    }

    #[must_use]
    pub fn workspace(&self) -> &Path {
        &self.workspace
    }

    #[must_use]
    pub fn required_mount_unit(&self) -> &str {
        &self.mount_unit
    }

    #[must_use]
    pub fn read_only_paths(&self) -> [&Path; 2] {
        [
            self.read_only_paths[0].as_path(),
            self.read_only_paths[1].as_path(),
        ]
    }

    #[must_use]
    pub const fn worker(&self) -> WorkerPrincipal {
        self.worker
    }

    #[must_use]
    pub fn java(&self) -> &'static Path {
        self.runtime.java()
    }

    #[must_use]
    pub fn worker_jar(&self) -> &'static Path {
        self.runtime.worker_jar()
    }

    #[must_use]
    pub fn command_arguments(&self) -> Vec<String> {
        vec![
            self.java().to_string_lossy().into_owned(),
            format!("-Xmx{}", self.heap_bytes()),
            format!("-XX:MaxDirectMemorySize={}", self.direct_memory_bytes()),
            "-Djava.io.tmpdir=/tmp".to_owned(),
            "-jar".to_owned(),
            self.worker_jar().to_string_lossy().into_owned(),
        ]
    }

    #[must_use]
    pub fn environment(&self) -> Vec<String> {
        vec![
            format!("HOME={}", self.workspace.display()),
            "TMPDIR=/tmp".to_owned(),
        ]
    }

    #[must_use]
    pub const fn heap_bytes(&self) -> u64 {
        192 * 1024 * 1024
    }

    #[must_use]
    pub const fn direct_memory_bytes(&self) -> u64 {
        20 * 1024 * 1024
    }

    #[must_use]
    pub const fn memory_max_bytes(&self) -> u64 {
        256 * 1024 * 1024
    }

    #[must_use]
    pub const fn memory_swap_max_bytes(&self) -> u64 {
        0
    }

    #[must_use]
    pub const fn tasks_max(&self) -> u64 {
        32
    }

    #[must_use]
    pub const fn runtime_max_micros(&self) -> u64 {
        12_000_000
    }

    #[must_use]
    pub const fn stop_timeout_micros(&self) -> u64 {
        2_000_000
    }

    #[must_use]
    pub const fn file_size_limit_bytes(&self) -> u64 {
        WORKSPACE_BYTES
    }

    #[must_use]
    pub const fn address_families(&self) -> AddressFamilyPolicy {
        AddressFamilyPolicy::UnixOnly
    }

    #[must_use]
    pub const fn kill_mode(&self) -> KillModePolicy {
        KillModePolicy::ControlGroup
    }

    #[must_use]
    pub const fn device_policy(&self) -> DevicePolicy {
        DevicePolicy::Closed
    }

    #[must_use]
    pub const fn protect_proc(&self) -> ProtectProcPolicy {
        ProtectProcPolicy::Invisible
    }

    #[must_use]
    pub const fn system_call_architectures(&self) -> SystemCallArchitecturePolicy {
        SystemCallArchitecturePolicy::Native
    }

    #[must_use]
    pub const fn cpu_quota_per_sec_micros(&self) -> u64 {
        1_000_000
    }

    #[must_use]
    pub const fn limit_core_bytes(&self) -> u64 {
        0
    }

    #[must_use]
    pub const fn limit_open_files(&self) -> u64 {
        64
    }

    #[must_use]
    pub const fn limit_processes(&self) -> u64 {
        32
    }

    #[must_use]
    pub const fn send_sigkill(&self) -> bool {
        true
    }

    #[must_use]
    pub const fn private_tmp(&self) -> bool {
        true
    }

    #[must_use]
    pub const fn ip_address_deny_any(&self) -> bool {
        true
    }

    #[must_use]
    pub const fn no_new_privileges(&self) -> bool {
        true
    }

    #[must_use]
    pub const fn private_devices(&self) -> bool {
        true
    }

    #[must_use]
    pub const fn protect_system_strict(&self) -> bool {
        true
    }

    #[must_use]
    pub const fn protect_home(&self) -> bool {
        true
    }

    #[must_use]
    pub const fn restrict_namespaces(&self) -> bool {
        true
    }

    #[must_use]
    pub const fn restrict_suid_sgid(&self) -> bool {
        true
    }

    #[must_use]
    pub const fn lock_personality(&self) -> bool {
        true
    }

    #[must_use]
    pub const fn memory_oom_group(&self) -> bool {
        true
    }

    #[must_use]
    pub const fn capability_bounding_set_is_empty(&self) -> bool {
        true
    }
}

fn encode_hex(bytes: [u8; 16]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut encoded = String::with_capacity(32);
    for byte in bytes {
        encoded.push(char::from(HEX[usize::from(byte >> 4)]));
        encoded.push(char::from(HEX[usize::from(byte & 0x0f)]));
    }
    encoded
}

#[cfg(test)]
mod tests {
    use std::collections::BTreeMap;

    use super::*;

    #[test]
    fn unknown_profile_fails_before_any_unit_spec_exists() {
        let policy = policy();
        assert_eq!(
            policy.derive(job(), MediaIsolationProfileId::from_wire(99)),
            Err(IsolationPolicyError::UnknownProfile)
        );
    }

    #[test]
    fn client_job_identity_derives_exact_non_reusable_units_and_paths() {
        let spec = policy()
            .derive(job(), MediaIsolationProfileId::ImageIoV1)
            .expect("known profile");
        let suffix = "01010101010101010101010101010101";
        assert_eq!(
            spec.mount().unit_name(),
            format!("run-storecore_media-jobs-{suffix}.mount")
        );
        assert_eq!(
            spec.worker().unit_name(),
            format!("storecore-media-worker-{suffix}.service")
        );
        assert_eq!(spec.mount().where_path(), Path::new(JOB_ROOT).join(suffix));
        assert_eq!(spec.mount().where_path(), spec.worker().workspace());
        assert_eq!(
            spec.worker().required_mount_unit(),
            spec.mount().unit_name()
        );
        assert_eq!(spec.paths().root(), spec.mount().where_path());
        assert_eq!(spec.paths().input(), spec.paths().root().join("input.bin"));
        assert_eq!(
            spec.paths().request(),
            spec.paths().root().join("request.bin")
        );
        assert_eq!(
            spec.paths().output(),
            spec.paths().root().join("output.bin")
        );
        assert_eq!(
            spec.paths().result(),
            spec.paths().root().join("result.bin")
        );
        assert_eq!(
            spec.paths().diagnostic(),
            spec.paths().root().join("diagnostic.bin")
        );
        assert_eq!(spec.paths().snapshot_owner_uid(), 0);
        assert_eq!(spec.paths().snapshot_permissions(), 0o440);
        assert_eq!(spec.paths().snapshot_group_gid(), 2002);
        assert_eq!(spec.paths().workspace_permissions(), 0o700);
    }

    #[test]
    fn tmpfs_policy_is_bounded_and_never_executable() {
        let spec = policy()
            .derive(job(), MediaIsolationProfileId::ImageIoV1)
            .expect("known profile");
        assert_eq!(spec.mount().what(), "tmpfs");
        assert_eq!(spec.mount().file_system_type(), "tmpfs");
        assert_eq!(spec.mount().directory_mode(), 0o700);
        assert!(spec.mount().collect_inactive_or_failed());
        assert_eq!(
            spec.mount().options(),
            "mode=0700,uid=2001,gid=2002,size=50331648,nr_inodes=4096,nosuid,nodev,noexec"
        );
    }

    #[test]
    fn worker_policy_has_no_network_capability_or_unbounded_resource() {
        let spec = policy()
            .derive(job(), MediaIsolationProfileId::ImageIoV1)
            .expect("known profile");
        let worker = spec.worker();
        assert_eq!(
            worker.read_only_paths(),
            [spec.paths().input(), spec.paths().request()]
        );
        assert_eq!(worker.address_families(), AddressFamilyPolicy::UnixOnly);
        assert_eq!(worker.kill_mode(), KillModePolicy::ControlGroup);
        assert_eq!(worker.device_policy(), DevicePolicy::Closed);
        assert_eq!(worker.protect_proc(), ProtectProcPolicy::Invisible);
        assert_eq!(
            worker.system_call_architectures(),
            SystemCallArchitecturePolicy::Native
        );
        assert_eq!(worker.cpu_quota_per_sec_micros(), 1_000_000);
        assert_eq!(worker.limit_core_bytes(), 0);
        assert_eq!(worker.limit_open_files(), 64);
        assert_eq!(worker.limit_processes(), 32);
        assert!(worker.send_sigkill());
        assert!(worker.private_tmp());
        assert!(worker.ip_address_deny_any());
        assert!(worker.no_new_privileges());
        assert!(worker.private_devices());
        assert!(worker.protect_system_strict());
        assert!(worker.protect_home());
        assert!(worker.restrict_namespaces());
        assert!(worker.restrict_suid_sgid());
        assert!(worker.lock_personality());
        assert!(worker.memory_oom_group());
        assert!(worker.capability_bounding_set_is_empty());
        assert_eq!(worker.memory_max_bytes(), 256 * 1024 * 1024);
        assert!(
            worker.memory_max_bytes() > worker.heap_bytes() + worker.direct_memory_bytes(),
            "cgroup memory must leave bounded JVM native overhead above heap and direct memory"
        );
        assert_eq!(worker.memory_swap_max_bytes(), 0);
        assert_eq!(worker.tasks_max(), 32);
        assert_eq!(worker.runtime_max_micros(), 12_000_000);
        assert_eq!(worker.stop_timeout_micros(), 2_000_000);
        assert_eq!(worker.file_size_limit_bytes(), WORKSPACE_BYTES);
        assert_eq!(
            worker.command_arguments(),
            vec![
                JAVA_PATH.to_owned(),
                "-Xmx201326592".to_owned(),
                "-XX:MaxDirectMemorySize=20971520".to_owned(),
                "-Djava.io.tmpdir=/tmp".to_owned(),
                "-jar".to_owned(),
                WORKER_JAR_PATH.to_owned(),
            ]
        );
        assert_eq!(
            worker.environment(),
            vec![
                format!("HOME={}", worker.workspace().display()),
                "TMPDIR=/tmp".to_owned(),
            ]
        );
    }

    #[test]
    fn runtime_paths_are_compiled_and_digests_cannot_be_empty() {
        assert!(ApprovedRuntime::create([0; 32], [2; 32]).is_none());
        assert!(ApprovedRuntime::create([1; 32], [0; 32]).is_none());
        let runtime = runtime();
        assert_eq!(runtime.root(), Path::new(RUNTIME_ROOT));
        assert_eq!(runtime.java(), Path::new(JAVA_PATH));
        assert_eq!(runtime.worker_jar(), Path::new(WORKER_JAR_PATH));
        assert_eq!(runtime.java_sha256(), [1; 32]);
        assert_eq!(runtime.worker_jar_sha256(), [2; 32]);
    }

    #[test]
    fn exact_root_owned_runtime_chain_is_accepted() {
        let mut evidence = RuntimeFixture::matched();
        assert_eq!(
            runtime().attest(&mut evidence),
            Ok(RuntimeAttestation::Matched)
        );
        assert_eq!(
            evidence.inspected,
            vec![
                PathBuf::from(RUNTIME_ROOT),
                Path::new(RUNTIME_ROOT).join("bin"),
                PathBuf::from(JAVA_PATH),
                PathBuf::from(WORKER_JAR_PATH),
            ]
        );
    }

    #[test]
    fn runtime_attestation_rejects_symlink_owner_mode_and_digest_mismatch() {
        let cases = [
            (
                PathBuf::from(JAVA_PATH),
                node(
                    RuntimeObjectKind::RegularFile,
                    0,
                    0o555,
                    true,
                    Some([1; 32]),
                ),
                RuntimeAttestationError::SymbolicLink,
            ),
            (
                PathBuf::from(RUNTIME_ROOT),
                node(RuntimeObjectKind::Directory, 2001, 0o555, false, None),
                RuntimeAttestationError::WrongOwner,
            ),
            (
                PathBuf::from(WORKER_JAR_PATH),
                node(
                    RuntimeObjectKind::RegularFile,
                    0,
                    0o664,
                    false,
                    Some([2; 32]),
                ),
                RuntimeAttestationError::WrongPermissions,
            ),
            (
                PathBuf::from(WORKER_JAR_PATH),
                node(
                    RuntimeObjectKind::RegularFile,
                    0,
                    0o444,
                    false,
                    Some([9; 32]),
                ),
                RuntimeAttestationError::DigestMismatch,
            ),
        ];
        for (path, replacement, expected) in cases {
            let mut evidence = RuntimeFixture::matched();
            evidence.nodes.insert(path, replacement);
            assert_eq!(runtime().attest(&mut evidence), Err(expected));
        }
    }

    #[test]
    fn unknown_or_unavailable_runtime_evidence_fails_closed() {
        let mut unknown = RuntimeFixture::matched();
        unknown.nodes.insert(
            PathBuf::from(RUNTIME_ROOT),
            node(RuntimeObjectKind::Unknown, 0, 0o555, false, None),
        );
        assert_eq!(
            runtime().attest(&mut unknown),
            Err(RuntimeAttestationError::UnknownObject)
        );

        let mut unavailable = RuntimeFixture::matched();
        unavailable.nodes.remove(Path::new(JAVA_PATH));
        assert_eq!(
            runtime().attest(&mut unavailable),
            Err(RuntimeAttestationError::EvidenceUnavailable)
        );
    }

    #[test]
    fn root_is_never_a_worker_principal() {
        assert!(WorkerPrincipal::create(0, 2002).is_none());
        assert!(WorkerPrincipal::create(2001, 0).is_none());
        assert!(WorkerPrincipal::create(2001, 2002).is_some());
    }

    fn job() -> JobId {
        JobId::create([1; 16]).expect("job")
    }

    fn runtime() -> ApprovedRuntime {
        ApprovedRuntime::create([1; 32], [2; 32]).expect("runtime")
    }

    fn policy() -> IsolationPolicy {
        IsolationPolicy::create(
            WorkerPrincipal::create(2001, 2002).expect("worker"),
            runtime(),
        )
    }

    struct RuntimeFixture {
        nodes: BTreeMap<PathBuf, RuntimeNodeEvidence>,
        inspected: Vec<PathBuf>,
    }

    impl RuntimeFixture {
        fn matched() -> Self {
            Self {
                nodes: BTreeMap::from([
                    (
                        PathBuf::from(RUNTIME_ROOT),
                        node(RuntimeObjectKind::Directory, 0, 0o555, false, None),
                    ),
                    (
                        Path::new(RUNTIME_ROOT).join("bin"),
                        node(RuntimeObjectKind::Directory, 0, 0o555, false, None),
                    ),
                    (
                        PathBuf::from(JAVA_PATH),
                        node(
                            RuntimeObjectKind::RegularFile,
                            0,
                            0o555,
                            false,
                            Some([1; 32]),
                        ),
                    ),
                    (
                        PathBuf::from(WORKER_JAR_PATH),
                        node(
                            RuntimeObjectKind::RegularFile,
                            0,
                            0o444,
                            false,
                            Some([2; 32]),
                        ),
                    ),
                ]),
                inspected: Vec::new(),
            }
        }
    }

    impl RuntimeEvidenceSource for RuntimeFixture {
        fn inspect(&mut self, path: &Path) -> Result<RuntimeNodeEvidence, RuntimeEvidenceError> {
            self.inspected.push(path.to_path_buf());
            self.nodes
                .get(path)
                .copied()
                .ok_or(RuntimeEvidenceError::Unavailable)
        }
    }

    fn node(
        kind: RuntimeObjectKind,
        owner_uid: u32,
        permissions: u32,
        symbolic_link: bool,
        sha256: Option<[u8; 32]>,
    ) -> RuntimeNodeEvidence {
        RuntimeNodeEvidence::create(kind, owner_uid, permissions, symbolic_link, sha256)
            .expect("node")
    }
}
