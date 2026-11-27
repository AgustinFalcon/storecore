#![cfg(target_os = "linux")]
#![allow(
    unsafe_code,
    reason = "MAP_SHARED of the origin is attested only in tests"
)]

use rustix::mm::{mmap, msync, munmap, MapFlags, MsyncFlags, ProtFlags};
use sha2::{Digest, Sha256};
use std::fs::{self, File, OpenOptions, Permissions};
use std::io::Write;
use std::os::fd::AsFd;
use std::os::unix::fs::{OpenOptionsExt, PermissionsExt};
use std::path::{Path, PathBuf};
use std::ptr;
use storecore_media_broker::budget::BudgetLimits;
use storecore_media_broker::dbus::ZbusSystemd;
use storecore_media_broker::runtime::ApprovedRuntime;
use storecore_media_broker::snapshot::copy_snapshot;
use storecore_media_broker::state::{Principal, Reservation};
use storecore_media_broker::store::{AdmissionStatus, BrokerStore};
use storecore_media_broker::systemd::{MOUNT_BYTES, MOUNT_INODES, SystemdControl, TransientUnits};
use storecore_media_broker::unit::{UnitKind, UnitState};

#[test]
#[ignore = "requires root, systemd PID 1, approved Java/jar, and the system bus"]
fn pid1_snapshot_survives_held_source_mmap_mutations() {
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
    let (journal_root, mut store) = pid1_single_job_store("journal-4c-mmap-after-seal");
    let principal = Principal::create(2101, 2101);
    let allocated = store
        .allocate(
            [0x27; 16],
            principal,
            [0xb1; 16],
            Reservation::create(MOUNT_BYTES, MOUNT_INODES, 1).expect("reservation"),
            1,
        )
        .expect("allocate");
    let mut systemd = ZbusSystemd::connect_system().expect("system bus");
    let runtime = approved_pid1_runtime();
    let spec = TransientUnits::derive(
        allocated.job_id(),
        PathBuf::from("/run/storecore_media/jobs"),
        Principal::create(2102, 2102),
        &runtime,
    )
    .expect("spec");
    assert_eq!(
        systemd.start_transient(UnitKind::Mount, &spec),
        Ok(UnitState::Active)
    );
    let original = b"sealed-media";
    let digest: [u8; 32] = Sha256::digest(original).into();
    let source = open_held_source(journal_root.join("source.bin"), original);
    let snapshot_path = spec.mount().where_path().join("snapshot.bin");
    let evidence = copy_snapshot(
        source.as_fd(),
        &snapshot_path,
        original.len() as u64,
        digest,
    )
    .expect("snapshot");
    mutate_held_source_via_mmap(&source, original.len());
    assert_eq!(fs::read(&snapshot_path).expect("read snapshot"), original);
    assert_eq!(evidence.size(), original.len() as u64);
    assert_eq!(evidence.digest(), digest);
    let stopped_mount = systemd.stop(UnitKind::Mount, &spec).expect("stop mount");
    assert!(matches!(
        stopped_mount,
        UnitState::Inactive | UnitState::Failed
    ));
    drop(store);
    let _ = fs::remove_dir_all(&journal_root);
}

fn approved_pid1_runtime() -> ApprovedRuntime {
    let java =
        PathBuf::from(std::env::var("STORECORE_MEDIA_JAVA").expect("STORECORE_MEDIA_JAVA"));
    let jar = PathBuf::from(std::env::var("STORECORE_MEDIA_JAR").expect("STORECORE_MEDIA_JAR"));
    let java_digest = Sha256::digest(fs::read(&java).expect("java bytes")).into();
    let jar_digest = Sha256::digest(fs::read(&jar).expect("jar bytes")).into();
    ApprovedRuntime::open(&java, &jar, 0, java_digest, jar_digest).expect("runtime")
}

fn open_held_source(path: PathBuf, original: &[u8]) -> File {
    let mut source = OpenOptions::new()
        .read(true)
        .write(true)
        .create_new(true)
        .mode(0o600)
        .open(path)
        .expect("source");
    source.write_all(original).expect("write source");
    source.sync_all().expect("sync source");
    source
}

fn mutate_held_source_via_mmap(source: &File, original_len: usize) {
    let mapping = {
        // SAFETY: `source` is a regular file this harness created; `original_len`
        // is its size; a null hint lets the kernel choose the address; no Rust
        // reference into that VA exists yet.
        unsafe {
            mmap(
                ptr::null_mut(),
                original_len,
                ProtFlags::READ | ProtFlags::WRITE,
                MapFlags::SHARED,
                source,
                0,
            )
            .expect("mmap source")
        }
    };
    // SAFETY: `mapping` is the live MAP_SHARED region of `original_len` bytes.
    unsafe {
        ptr::copy_nonoverlapping(b"changed-media".as_ptr(), mapping.cast::<u8>(), original_len);
    }
    // SAFETY: `mapping` is still the region returned by `mmap` above.
    unsafe {
        msync(mapping, original_len, MsyncFlags::SYNC).expect("msync");
    }
    source
        .set_len((original_len as u64).saturating_mul(2))
        .expect("grow");
    source.set_len(4).expect("truncate");
    source.sync_all().expect("sync mutation");
    // SAFETY: `mapping` is still mapped; munmap uses the same length as mmap.
    unsafe {
        munmap(mapping, original_len).expect("munmap");
    }
}

fn pid1_single_job_store(journal_name: &str) -> (PathBuf, BrokerStore) {
    fs::create_dir_all("/run/storecore_media/jobs").expect("jobs root");
    let journal_root = Path::new("/run/storecore_media").join(journal_name);
    let _ = fs::remove_dir_all(&journal_root);
    fs::create_dir(&journal_root).expect("journal root");
    fs::set_permissions(&journal_root, Permissions::from_mode(0o700))
        .expect("journal mode");
    let owner = rustix::process::geteuid().as_raw();
    let limits = BudgetLimits::create(1, 1, MOUNT_BYTES, MOUNT_INODES, MOUNT_BYTES, MOUNT_INODES)
        .expect("limits");
    let mut store = BrokerStore::open(&journal_root, owner, limits).expect("store");
    assert_eq!(
        store.finish_reconciliation(false),
        Ok(AdmissionStatus::Open)
    );
    (journal_root, store)
}
