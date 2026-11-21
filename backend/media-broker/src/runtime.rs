use sha2::{Digest, Sha256};
use std::io::Read;
use std::os::fd::OwnedFd;
use std::path::{Component, Path, PathBuf};

use rustix::fs::{CWD, FileType, Mode, OFlags, fstat, open, openat};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum RuntimeKind {
    Java,
    Jar,
    Unknown,
}

impl RuntimeKind {
    #[must_use]
    pub const fn from_wire(value: u8) -> Self {
        match value {
            1 => Self::Java,
            2 => Self::Jar,
            _ => Self::Unknown,
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum RuntimeError {
    UnknownKind,
    Unavailable,
    NotRegular,
    Ownership,
    Permissions,
    LinkCount,
    DigestMismatch,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct ApprovedFile {
    digest: [u8; 32],
    kind: RuntimeKind,
}

impl ApprovedFile {
    #[must_use]
    pub const fn digest(self) -> [u8; 32] {
        self.digest
    }

    #[must_use]
    pub const fn kind(self) -> RuntimeKind {
        self.kind
    }
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ApprovedRuntime {
    java: ApprovedFile,
    jar: ApprovedFile,
    java_path: PathBuf,
    jar_path: PathBuf,
}

impl ApprovedRuntime {
    /// Opens a root-owned Java binary and fat jar. Every path component is
    /// opened with `NOFOLLOW`; parent symlinks cannot redirect the leaf.
    ///
    /// # Errors
    ///
    /// Returns a closed [`RuntimeError`] for unknown kinds, ownership/mode
    /// drift, extra links or digest mismatch.
    pub fn open(
        java: &Path,
        jar: &Path,
        expected_owner: u32,
        expected_java_digest: [u8; 32],
        expected_jar_digest: [u8; 32],
    ) -> Result<Self, RuntimeError> {
        Ok(Self {
            java: approve(
                java,
                RuntimeKind::Java,
                expected_owner,
                expected_java_digest,
            )?,
            jar: approve(jar, RuntimeKind::Jar, expected_owner, expected_jar_digest)?,
            java_path: java.to_path_buf(),
            jar_path: jar.to_path_buf(),
        })
    }

    #[must_use]
    pub const fn java(&self) -> ApprovedFile {
        self.java
    }

    #[must_use]
    pub const fn jar(&self) -> ApprovedFile {
        self.jar
    }

    #[must_use]
    pub fn java_path(&self) -> &Path {
        &self.java_path
    }

    #[must_use]
    pub fn jar_path(&self) -> &Path {
        &self.jar_path
    }
}

fn approve(
    path: &Path,
    kind: RuntimeKind,
    expected_owner: u32,
    expected_digest: [u8; 32],
) -> Result<ApprovedFile, RuntimeError> {
    if matches!(kind, RuntimeKind::Unknown) {
        return Err(RuntimeError::UnknownKind);
    }
    let descriptor = open_nofollow(path)?;
    let metadata = fstat(&descriptor).map_err(|_| RuntimeError::Unavailable)?;
    if FileType::from_raw_mode(metadata.st_mode) != FileType::RegularFile {
        return Err(RuntimeError::NotRegular);
    }
    if metadata.st_uid != expected_owner {
        return Err(RuntimeError::Ownership);
    }
    if metadata.st_nlink != 1 {
        return Err(RuntimeError::LinkCount);
    }
    let allowed = match kind {
        RuntimeKind::Java => 0o555,
        RuntimeKind::Jar => 0o444,
        RuntimeKind::Unknown => return Err(RuntimeError::UnknownKind),
    };
    if metadata.st_mode & 0o7777 != allowed {
        return Err(RuntimeError::Permissions);
    }
    let digest = hash(descriptor)?;
    if digest != expected_digest {
        return Err(RuntimeError::DigestMismatch);
    }
    Ok(ApprovedFile { digest, kind })
}

fn open_nofollow(path: &Path) -> Result<OwnedFd, RuntimeError> {
    let parts: Vec<Component<'_>> = path.components().collect();
    if parts.is_empty() {
        return Err(RuntimeError::Unavailable);
    }
    let last = parts.len() - 1;
    let mut current: Option<OwnedFd> = None;
    for (index, component) in parts.into_iter().enumerate() {
        match component {
            Component::RootDir => {
                if index != 0 {
                    return Err(RuntimeError::Unavailable);
                }
                current = Some(
                    open(
                        "/",
                        OFlags::RDONLY | OFlags::DIRECTORY | OFlags::CLOEXEC,
                        Mode::empty(),
                    )
                    .map_err(|_| RuntimeError::Unavailable)?,
                );
            }
            Component::Normal(name) => {
                let flags = if index == last {
                    OFlags::RDONLY | OFlags::NOFOLLOW | OFlags::CLOEXEC
                } else {
                    OFlags::RDONLY | OFlags::NOFOLLOW | OFlags::DIRECTORY | OFlags::CLOEXEC
                };
                let next = match current.as_ref() {
                    Some(dir) => openat(dir, name, flags, Mode::empty()),
                    None => openat(CWD, name, flags, Mode::empty()),
                }
                .map_err(|_| RuntimeError::Unavailable)?;
                current = Some(next);
            }
            Component::Prefix(_) | Component::CurDir | Component::ParentDir => {
                return Err(RuntimeError::Unavailable);
            }
        }
    }
    current.ok_or(RuntimeError::Unavailable)
}

fn hash(descriptor: OwnedFd) -> Result<[u8; 32], RuntimeError> {
    let mut file = std::fs::File::from(descriptor);
    let mut hasher = Sha256::new();
    let mut buffer = [0_u8; 8192];
    loop {
        let read = file
            .read(&mut buffer)
            .map_err(|_| RuntimeError::Unavailable)?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(hasher.finalize().into())
}

#[cfg(test)]
mod tests {
    use super::{ApprovedRuntime, RuntimeError, RuntimeKind};
    use sha2::{Digest, Sha256};
    use std::fs::{self, OpenOptions};
    use std::io::Write;
    use std::os::unix::fs::{OpenOptionsExt, PermissionsExt};
    use std::sync::atomic::{AtomicU64, Ordering};

    static NEXT: AtomicU64 = AtomicU64::new(1);

    #[test]
    fn unknown_kind_is_rejected_at_the_translator() {
        assert_eq!(RuntimeKind::from_wire(0), RuntimeKind::Unknown);
        assert_eq!(RuntimeKind::from_wire(9), RuntimeKind::Unknown);
    }

    #[test]
    fn approved_runtime_requires_exact_owner_mode_and_digest() {
        let fixture = Fixture::new();
        let java_digest = write_private(&fixture.java, 0o555, b"java-bin");
        let jar_digest = write_private(&fixture.jar, 0o444, b"fat-jar");
        let approved = ApprovedRuntime::open(
            &fixture.java,
            &fixture.jar,
            fixture.owner,
            java_digest,
            jar_digest,
        )
        .expect("approved");
        assert_eq!(approved.java().digest(), java_digest);
        assert_eq!(approved.jar().digest(), jar_digest);

        fs::set_permissions(&fixture.jar, fs::Permissions::from_mode(0o644)).expect("mode");
        assert_eq!(
            ApprovedRuntime::open(
                &fixture.java,
                &fixture.jar,
                fixture.owner,
                java_digest,
                jar_digest,
            ),
            Err(RuntimeError::Permissions)
        );

        fs::set_permissions(&fixture.jar, fs::Permissions::from_mode(0o444)).expect("restore");
        fs::set_permissions(&fixture.java, fs::Permissions::from_mode(0o4555)).expect("suid");
        assert_eq!(
            ApprovedRuntime::open(
                &fixture.java,
                &fixture.jar,
                fixture.owner,
                java_digest,
                jar_digest,
            ),
            Err(RuntimeError::Permissions)
        );
    }

    #[test]
    fn parent_symlink_cannot_redirect_the_leaf() {
        let fixture = Fixture::new();
        let real = fixture.root.join("real");
        fs::create_dir(&real).expect("real");
        let java = real.join("java");
        let jar = real.join("worker.jar");
        let java_digest = write_private(&java, 0o555, b"java-bin");
        let jar_digest = write_private(&jar, 0o444, b"fat-jar");
        let link = fixture.root.join("link");
        std::os::unix::fs::symlink(&real, &link).expect("symlink");
        assert_eq!(
            ApprovedRuntime::open(
                &link.join("java"),
                &jar,
                fixture.owner,
                java_digest,
                jar_digest,
            ),
            Err(RuntimeError::Unavailable)
        );
    }

    fn write_private(path: &std::path::Path, mode: u32, bytes: &[u8]) -> [u8; 32] {
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

    struct Fixture {
        root: std::path::PathBuf,
        java: std::path::PathBuf,
        jar: std::path::PathBuf,
        owner: u32,
    }

    impl Fixture {
        fn new() -> Self {
            let id = NEXT.fetch_add(1, Ordering::Relaxed);
            let root = std::env::temp_dir().join(format!(
                "storecore-media-broker-runtime-{}-{id}",
                std::process::id()
            ));
            fs::create_dir(&root).expect("root");
            fs::set_permissions(&root, fs::Permissions::from_mode(0o700)).expect("perm");
            Self {
                java: root.join("java"),
                jar: root.join("worker.jar"),
                owner: rustix::process::geteuid().as_raw(),
                root,
            }
        }
    }

    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.root);
        }
    }
}
