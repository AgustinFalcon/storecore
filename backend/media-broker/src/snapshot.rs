use crate::protocol::MAX_INPUT_BYTES;
use sha2::{Digest, Sha256};
use std::fs::{File, OpenOptions};
use std::io::Write;
use std::os::fd::BorrowedFd;
use std::os::unix::fs::{MetadataExt, OpenOptionsExt};
use std::path::Path;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum SnapshotError {
    InvalidSize,
    SourceUnavailable,
    SourceNotRegular,
    SourceChanged,
    DestinationUnavailable,
    SizeMismatch,
    DigestMismatch,
    SyncFailed,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub struct SnapshotEvidence {
    size: u64,
    digest: [u8; 32],
}

impl SnapshotEvidence {
    #[must_use]
    pub const fn size(self) -> u64 {
        self.size
    }
    #[must_use]
    pub const fn digest(self) -> [u8; 32] {
        self.digest
    }
}

/// Copies one received descriptor into a private, create-only broker snapshot.
///
/// # Errors
///
/// Returns a closed [`SnapshotError`] if the source is not a regular file, the
/// destination cannot be created privately, or size, digest, write or sync
/// validation fails. A partial destination is removed before returning.
pub fn copy_snapshot(
    source: BorrowedFd<'_>,
    destination: &Path,
    expected_size: u64,
    expected_digest: [u8; 32],
) -> Result<SnapshotEvidence, SnapshotError> {
    copy_snapshot_inner(source, destination, expected_size, expected_digest, || {})
}

fn copy_snapshot_inner<AfterCopy: FnOnce()>(
    source: BorrowedFd<'_>,
    destination: &Path,
    expected_size: u64,
    expected_digest: [u8; 32],
    after_copy: AfterCopy,
) -> Result<SnapshotEvidence, SnapshotError> {
    if expected_size == 0 || expected_size > MAX_INPUT_BYTES {
        return Err(SnapshotError::InvalidSize);
    }
    let duplicated = duplicate_source(source)?;
    let source_file = File::from(duplicated);
    let metadata = source_file
        .metadata()
        .map_err(|_| SnapshotError::SourceUnavailable)?;
    if !metadata.is_file() {
        return Err(SnapshotError::SourceNotRegular);
    }
    let source_before = SourceFingerprint::from(&metadata);
    if source_before.size != expected_size {
        return Err(SnapshotError::SizeMismatch);
    }

    let mut destination_file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .mode(0o400)
        .open(destination)
        .map_err(|_| SnapshotError::DestinationUnavailable)?;

    let result = copy_bounded(
        &source_file,
        &mut destination_file,
        expected_size,
        expected_digest,
    );
    let result = result.and_then(|evidence| {
        after_copy();
        let source_after = source_file
            .metadata()
            .map_err(|_| SnapshotError::SourceUnavailable)?;
        if SourceFingerprint::from(&source_after) != source_before {
            return Err(SnapshotError::SourceChanged);
        }
        Ok(evidence)
    });
    if result.is_err() {
        let _ = std::fs::remove_file(destination);
    }
    result
}

fn duplicate_source(source: BorrowedFd<'_>) -> Result<rustix::fd::OwnedFd, SnapshotError> {
    rustix::io::fcntl_dupfd_cloexec(source, 0).map_err(|_| SnapshotError::SourceUnavailable)
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
struct SourceFingerprint {
    device: u64,
    inode: u64,
    mode: u32,
    links: u64,
    uid: u32,
    gid: u32,
    size: u64,
    modified_seconds: i64,
    modified_nanoseconds: i64,
    changed_seconds: i64,
    changed_nanoseconds: i64,
}

impl From<&std::fs::Metadata> for SourceFingerprint {
    fn from(metadata: &std::fs::Metadata) -> Self {
        Self {
            device: metadata.dev(),
            inode: metadata.ino(),
            mode: metadata.mode(),
            links: metadata.nlink(),
            uid: metadata.uid(),
            gid: metadata.gid(),
            size: metadata.size(),
            modified_seconds: metadata.mtime(),
            modified_nanoseconds: metadata.mtime_nsec(),
            changed_seconds: metadata.ctime(),
            changed_nanoseconds: metadata.ctime_nsec(),
        }
    }
}

fn copy_bounded(
    source: &File,
    destination: &mut File,
    expected_size: u64,
    expected_digest: [u8; 32],
) -> Result<SnapshotEvidence, SnapshotError> {
    let mut digest = Sha256::new();
    let mut copied = 0_u64;
    let mut buffer = [0_u8; 8192];
    while copied < expected_size {
        let remaining = usize::try_from((expected_size - copied).min(buffer.len() as u64))
            .map_err(|_| SnapshotError::InvalidSize)?;
        let read = rustix::io::pread(source, &mut buffer[..remaining], copied)
            .map_err(|_| SnapshotError::SourceUnavailable)?;
        if read == 0 {
            return Err(SnapshotError::SizeMismatch);
        }
        destination
            .write_all(&buffer[..read])
            .map_err(|_| SnapshotError::DestinationUnavailable)?;
        digest.update(&buffer[..read]);
        copied = copied
            .checked_add(read as u64)
            .ok_or(SnapshotError::InvalidSize)?;
    }
    let mut growth_probe = [0_u8; 1];
    if rustix::io::pread(source, &mut growth_probe, copied)
        .map_err(|_| SnapshotError::SourceUnavailable)?
        != 0
    {
        return Err(SnapshotError::SizeMismatch);
    }
    let actual_digest: [u8; 32] = digest.finalize().into();
    if actual_digest != expected_digest {
        return Err(SnapshotError::DigestMismatch);
    }
    destination
        .sync_all()
        .map_err(|_| SnapshotError::SyncFailed)?;
    if destination
        .metadata()
        .map_err(|_| SnapshotError::DestinationUnavailable)?
        .len()
        != expected_size
    {
        return Err(SnapshotError::SizeMismatch);
    }
    Ok(SnapshotEvidence {
        size: copied,
        digest: actual_digest,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use rustix::io::{FdFlags, fcntl_getfd};
    use std::os::fd::AsFd;
    use std::os::unix::fs::PermissionsExt;
    use std::time::{SystemTime, UNIX_EPOCH};

    #[test]
    fn source_duplicate_is_close_on_exec() {
        let fixture = Fixture::new();
        let source = fixture.source(b"sealed");

        let duplicate = duplicate_source(source.as_fd()).expect("duplicate source");

        assert!(
            fcntl_getfd(&duplicate)
                .expect("read descriptor flags")
                .contains(FdFlags::CLOEXEC)
        );
    }

    #[test]
    fn metadata_mutation_during_copy_is_rejected_and_partial_is_removed() {
        let fixture = Fixture::new();
        let bytes = b"sealed";
        let source = fixture.source(bytes);
        let source_path = fixture.root.join("source.bin");
        let destination = fixture.root.join("snapshot.bin");

        let result = copy_snapshot_inner(
            source.as_fd(),
            &destination,
            bytes.len() as u64,
            Sha256::digest(bytes).into(),
            || {
                std::fs::set_permissions(&source_path, std::fs::Permissions::from_mode(0o400))
                    .expect("mutate source metadata");
            },
        );

        assert_eq!(result, Err(SnapshotError::SourceChanged));
        assert!(!destination.exists());
    }

    struct Fixture {
        root: std::path::PathBuf,
    }

    impl Fixture {
        fn new() -> Self {
            let nonce = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .expect("clock after epoch")
                .as_nanos();
            let root = std::env::temp_dir().join(format!(
                "storecore-media-broker-unit-{}-{nonce}",
                std::process::id()
            ));
            std::fs::create_dir(&root).expect("create fixture");
            Self { root }
        }

        fn source(&self, bytes: &[u8]) -> File {
            let mut file = OpenOptions::new()
                .read(true)
                .write(true)
                .create_new(true)
                .mode(0o600)
                .open(self.root.join("source.bin"))
                .expect("create source");
            file.write_all(bytes).expect("write source");
            file.sync_all().expect("sync source");
            file
        }
    }

    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.root);
        }
    }
}
