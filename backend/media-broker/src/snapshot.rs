use crate::protocol::MAX_INPUT_BYTES;
use sha2::{Digest, Sha256};
use std::fs::{File, OpenOptions};
use std::io::{Read, Seek, SeekFrom, Write};
use std::os::fd::BorrowedFd;
use std::os::unix::fs::OpenOptionsExt;
use std::path::Path;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum SnapshotError {
    InvalidSize,
    SourceUnavailable,
    SourceNotRegular,
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
    if expected_size == 0 || expected_size > MAX_INPUT_BYTES {
        return Err(SnapshotError::InvalidSize);
    }
    let duplicated = rustix::io::dup(source).map_err(|_| SnapshotError::SourceUnavailable)?;
    let mut source_file = File::from(duplicated);
    let metadata = source_file
        .metadata()
        .map_err(|_| SnapshotError::SourceUnavailable)?;
    if !metadata.is_file() {
        return Err(SnapshotError::SourceNotRegular);
    }
    source_file
        .seek(SeekFrom::Start(0))
        .map_err(|_| SnapshotError::SourceUnavailable)?;

    let mut destination_file = OpenOptions::new()
        .write(true)
        .create_new(true)
        .mode(0o400)
        .open(destination)
        .map_err(|_| SnapshotError::DestinationUnavailable)?;

    let result = copy_bounded(
        &mut source_file,
        &mut destination_file,
        expected_size,
        expected_digest,
    );
    if result.is_err() {
        let _ = std::fs::remove_file(destination);
    }
    result
}

fn copy_bounded(
    source: &mut File,
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
        let read = source
            .read(&mut buffer[..remaining])
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
    if source
        .read(&mut growth_probe)
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
