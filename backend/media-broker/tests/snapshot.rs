use sha2::{Digest, Sha256};
use std::fs::{File, OpenOptions};
use std::io::{Seek, SeekFrom, Write};
use std::os::unix::fs::{MetadataExt, OpenOptionsExt};
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};
use storecore_media_broker::protocol::MAX_INPUT_BYTES;
use storecore_media_broker::snapshot::{SnapshotError, copy_snapshot};

#[test]
fn snapshot_is_private_exact_and_independent_from_later_source_mutation() {
    let fixture = Fixture::new();
    let original = b"sealed-media";
    let mut source = fixture.source(original);
    let destination = fixture.root.join("snapshot.bin");

    let evidence = copy_snapshot(
        source.as_fd(),
        &destination,
        original.len() as u64,
        sha256(original),
    )
    .expect("snapshot succeeds");
    source.seek(SeekFrom::Start(0)).expect("rewind source");
    source.write_all(b"changed-media").expect("mutate source");
    source.sync_all().expect("sync mutation");

    assert_eq!(
        std::fs::read(&destination).expect("read snapshot"),
        original
    );
    assert_eq!(evidence.size(), original.len() as u64);
    assert_eq!(evidence.digest(), sha256(original));
    assert_eq!(
        destination.metadata().expect("metadata").mode() & 0o777,
        0o400
    );
}

#[test]
fn snapshot_survives_source_growth_and_truncation_on_the_held_fd() {
    let fixture = Fixture::new();
    let original = b"sealed-media";
    let mut source = fixture.source(original);
    let destination = fixture.root.join("snapshot.bin");

    copy_snapshot(
        source.as_fd(),
        &destination,
        original.len() as u64,
        sha256(original),
    )
    .expect("snapshot succeeds");
    source.seek(SeekFrom::Start(0)).expect("rewind source");
    source.write_all(b"changed-media").expect("overwrite source");
    source
        .set_len((original.len() * 2) as u64)
        .expect("grow source");
    source.set_len(4).expect("truncate source");
    source.sync_all().expect("sync mutation");

    assert_eq!(
        std::fs::read(&destination).expect("read snapshot"),
        original
    );
}

#[test]
fn mismatch_fails_closed_and_removes_the_partial_destination() {
    let fixture = Fixture::new();
    let source = fixture.source(b"actual");
    let destination = fixture.root.join("snapshot.bin");

    let result = copy_snapshot(source.as_fd(), &destination, 6, sha256(b"wanted"));

    assert_eq!(result, Err(SnapshotError::DigestMismatch));
    assert!(!destination.exists());
}

#[test]
fn oversized_claim_is_rejected_before_creating_a_destination() {
    let fixture = Fixture::new();
    let source = fixture.source(b"small");
    let destination = fixture.root.join("snapshot.bin");

    let result = copy_snapshot(
        source.as_fd(),
        &destination,
        MAX_INPUT_BYTES + 1,
        sha256(b"small"),
    );

    assert_eq!(result, Err(SnapshotError::InvalidSize));
    assert!(!destination.exists());
}

#[test]
fn source_size_must_match_before_the_snapshot_is_created() {
    let fixture = Fixture::new();
    let source = fixture.source(b"actual");
    let destination = fixture.root.join("snapshot.bin");

    let result = copy_snapshot(source.as_fd(), &destination, 5, sha256(b"actua"));

    assert_eq!(result, Err(SnapshotError::SizeMismatch));
    assert!(!destination.exists());
}

use std::os::fd::AsFd;

struct Fixture {
    root: PathBuf,
}

impl Fixture {
    fn new() -> Self {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock after epoch")
            .as_nanos();
        let root = std::env::temp_dir().join(format!(
            "storecore-media-broker-{}-{nonce}",
            std::process::id()
        ));
        std::fs::create_dir(&root).expect("create fixture");
        Self { root }
    }

    fn source(&self, bytes: &[u8]) -> File {
        let path = self.root.join("source.bin");
        let mut file = OpenOptions::new()
            .read(true)
            .write(true)
            .create_new(true)
            .mode(0o600)
            .open(path)
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

fn sha256(bytes: &[u8]) -> [u8; 32] {
    Sha256::digest(bytes).into()
}
