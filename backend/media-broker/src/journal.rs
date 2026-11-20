use std::collections::BTreeMap;
use std::fs::File;
use std::io::{Read, Write};
use std::os::fd::OwnedFd;
use std::path::Path;

use rustix::fs::{
    AtFlags, Dir, FileType, FlockOperation, Mode, OFlags, flock, fstat, fsync, open, openat,
    renameat, unlinkat,
};
use sha2::{Digest, Sha256};

use crate::state::{JobId, JobRecord, JobRecordFields, JobState, Principal, StateError};

const MAGIC: [u8; 4] = *b"SCBJ";
const VERSION: u16 = 1;
const PAYLOAD_LENGTH: usize = 96;
const RECORD_LENGTH: usize = 128;
const FINAL_SUFFIX: &[u8] = b".job";
const TEMP_SUFFIX: &[u8] = b".tmp";
const GATE_NAME: &[u8] = b"admission.blocked";
const GATE_TEMP_NAME: &[u8] = b"admission.blocked.tmp";
const GATE_MAGIC: [u8; 4] = *b"SCBG";
const GATE_PAYLOAD_LENGTH: usize = 32;
const GATE_LENGTH: usize = 64;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum DurableBlockReason {
    ReconciliationMismatch,
    ReconciliationUnavailable,
    InvalidTransition,
    Unknown,
}

impl DurableBlockReason {
    const fn from_wire(value: u8) -> Self {
        match value {
            1 => Self::ReconciliationMismatch,
            2 => Self::ReconciliationUnavailable,
            3 => Self::InvalidTransition,
            _ => Self::Unknown,
        }
    }

    const fn to_wire(self) -> u8 {
        match self {
            Self::ReconciliationMismatch => 1,
            Self::ReconciliationUnavailable => 2,
            Self::InvalidTransition => 3,
            Self::Unknown => 0,
        }
    }
}

#[derive(Debug, Eq, PartialEq)]
pub struct JournalSnapshot {
    records: BTreeMap<JobId, JobRecord>,
    durable_block: Option<DurableBlockReason>,
}

impl JournalSnapshot {
    #[must_use]
    pub const fn durable_block(&self) -> Option<DurableBlockReason> {
        self.durable_block
    }

    #[must_use]
    pub fn into_records(self) -> BTreeMap<JobId, JobRecord> {
        self.records
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum JournalError {
    RootUnavailable,
    RootNotDirectory,
    RootOwnership,
    RootPermissions,
    LockUnavailable,
    DirectoryReadFailed,
    UnexpectedEntry,
    TemporaryArtifact,
    EntryUnavailable,
    EntryNotRegular,
    EntryOwnership,
    EntryPermissions,
    EntryLinkCount,
    InvalidLength,
    InvalidMagic,
    UnsupportedVersion,
    InvalidReservedBytes,
    InvalidBlockReason,
    ChecksumMismatch,
    InvalidState(StateError),
    FilenameMismatch,
    DuplicateJob,
    WriteFailed,
    FileSyncFailed,
    RenameFailed,
    DirectorySyncFailed,
}

pub struct Journal {
    directory: OwnedFd,
    expected_owner: u32,
    #[cfg(test)]
    fail_after_rename: std::cell::Cell<bool>,
    #[cfg(test)]
    fail_before_latch_create: std::cell::Cell<bool>,
}

impl Journal {
    /// Opens an existing private journal directory without following a symlink.
    ///
    /// # Errors
    ///
    /// Returns a closed [`JournalError`] if the directory is missing, is not a
    /// directory, has an unexpected owner or grants any group/other access.
    pub fn open(root: &Path, expected_owner: u32) -> Result<Self, JournalError> {
        let directory = open(
            root,
            OFlags::RDONLY | OFlags::DIRECTORY | OFlags::NOFOLLOW | OFlags::CLOEXEC,
            Mode::empty(),
        )
        .map_err(|_| JournalError::RootUnavailable)?;
        let metadata = fstat(&directory).map_err(|_| JournalError::RootUnavailable)?;
        if FileType::from_raw_mode(metadata.st_mode) != FileType::Directory {
            return Err(JournalError::RootNotDirectory);
        }
        if metadata.st_uid != expected_owner {
            return Err(JournalError::RootOwnership);
        }
        if metadata.st_mode & 0o077 != 0 {
            return Err(JournalError::RootPermissions);
        }
        flock(&directory, FlockOperation::NonBlockingLockExclusive)
            .map_err(|_| JournalError::LockUnavailable)?;
        Ok(Self {
            directory,
            expected_owner,
            #[cfg(test)]
            fail_after_rename: std::cell::Cell::new(false),
            #[cfg(test)]
            fail_before_latch_create: std::cell::Cell::new(false),
        })
    }

    /// Loads every fixed-size journal record through the pinned directory FD.
    ///
    /// # Errors
    ///
    /// Fails closed for an unknown entry, crash residue, malformed record,
    /// ownership/mode drift or duplicate job identity.
    pub fn load(&self) -> Result<JournalSnapshot, JournalError> {
        let mut entries =
            Dir::read_from(&self.directory).map_err(|_| JournalError::DirectoryReadFailed)?;
        let mut records = BTreeMap::new();
        let mut durable_block = None;
        for entry in &mut entries {
            let entry = entry.map_err(|_| JournalError::DirectoryReadFailed)?;
            let name = entry.file_name().to_bytes();
            if matches!(name, b"." | b"..") {
                continue;
            }
            if name.ends_with(TEMP_SUFFIX) {
                return Err(JournalError::TemporaryArtifact);
            }
            if name == GATE_NAME {
                let descriptor = openat(
                    &self.directory,
                    entry.file_name(),
                    OFlags::RDONLY | OFlags::NONBLOCK | OFlags::NOFOLLOW | OFlags::CLOEXEC,
                    Mode::empty(),
                )
                .map_err(|_| JournalError::EntryUnavailable)?;
                validate_fixed_entry(&descriptor, self.expected_owner, GATE_LENGTH)?;
                durable_block = Some(read_gate(descriptor)?);
                continue;
            }
            let file_job_id = parse_final_name(name).ok_or(JournalError::UnexpectedEntry)?;
            let descriptor = openat(
                &self.directory,
                entry.file_name(),
                OFlags::RDONLY | OFlags::NONBLOCK | OFlags::NOFOLLOW | OFlags::CLOEXEC,
                Mode::empty(),
            )
            .map_err(|_| JournalError::EntryUnavailable)?;
            validate_entry(&descriptor, self.expected_owner)?;
            let record = read_record(descriptor)?;
            if record.job_id() != file_job_id {
                return Err(JournalError::FilenameMismatch);
            }
            if records.insert(record.job_id(), record).is_some() {
                return Err(JournalError::DuplicateJob);
            }
        }
        Ok(JournalSnapshot {
            records,
            durable_block,
        })
    }

    /// Atomically replaces one record and makes both file and directory entry
    /// durable before returning success.
    ///
    /// # Errors
    ///
    /// Returns a closed [`JournalError`]. Any error is an unknown commit outcome
    /// to the caller and must close further admission.
    pub fn persist(&self, record: JobRecord) -> Result<(), JournalError> {
        let final_name = final_name(record.job_id());
        let temporary_name = temporary_name(record.job_id());
        let descriptor = openat(
            &self.directory,
            temporary_name.as_slice(),
            OFlags::WRONLY | OFlags::CREATE | OFlags::EXCL | OFlags::NOFOLLOW | OFlags::CLOEXEC,
            Mode::RUSR | Mode::WUSR,
        )
        .map_err(|_| JournalError::WriteFailed)?;
        if let Err(error) = validate_new_entry(&descriptor, self.expected_owner) {
            let _ = unlinkat(&self.directory, temporary_name.as_slice(), AtFlags::empty());
            return Err(error);
        }
        let bytes = encode(record);
        let write_result = write_and_sync(descriptor, &bytes);
        if let Err(error) = write_result {
            let _ = unlinkat(&self.directory, temporary_name.as_slice(), AtFlags::empty());
            return Err(error);
        }
        renameat(
            &self.directory,
            temporary_name.as_slice(),
            &self.directory,
            final_name.as_slice(),
        )
        .map_err(|_| JournalError::RenameFailed)?;
        #[cfg(test)]
        if self.fail_after_rename.replace(false) {
            return Err(JournalError::DirectorySyncFailed);
        }
        fsync(&self.directory).map_err(|_| JournalError::DirectorySyncFailed)
    }

    /// Persists an intervention-required latch that cannot be cleared through
    /// the normal broker lifecycle.
    ///
    /// # Errors
    ///
    /// Returns a closed [`JournalError`] if the reason is unknown or the
    /// file-fsync/rename/dir-fsync sequence cannot be proven durable.
    pub fn latch_block(&self, reason: DurableBlockReason) -> Result<(), JournalError> {
        if reason == DurableBlockReason::Unknown {
            return Err(JournalError::InvalidBlockReason);
        }
        #[cfg(test)]
        if self.fail_before_latch_create.replace(false) {
            return Err(JournalError::WriteFailed);
        }
        let descriptor = openat(
            &self.directory,
            GATE_TEMP_NAME,
            OFlags::WRONLY | OFlags::CREATE | OFlags::EXCL | OFlags::NOFOLLOW | OFlags::CLOEXEC,
            Mode::RUSR | Mode::WUSR,
        )
        .map_err(|_| JournalError::WriteFailed)?;
        validate_new_entry(&descriptor, self.expected_owner)?;
        let bytes = encode_gate(reason);
        let mut file = File::from(descriptor);
        if file.write_all(&bytes).is_err() {
            return Err(JournalError::WriteFailed);
        }
        if file.sync_all().is_err() {
            return Err(JournalError::FileSyncFailed);
        }
        renameat(&self.directory, GATE_TEMP_NAME, &self.directory, GATE_NAME)
            .map_err(|_| JournalError::RenameFailed)?;
        fsync(&self.directory).map_err(|_| JournalError::DirectorySyncFailed)
    }

    #[cfg(test)]
    pub(crate) fn fail_next_persist_after_rename(&self) {
        self.fail_after_rename.set(true);
    }

    #[cfg(test)]
    pub(crate) fn fail_next_latch_before_create(&self) {
        self.fail_before_latch_create.set(true);
    }
}

fn validate_new_entry(descriptor: &OwnedFd, expected_owner: u32) -> Result<(), JournalError> {
    let metadata = fstat(descriptor).map_err(|_| JournalError::EntryUnavailable)?;
    if FileType::from_raw_mode(metadata.st_mode) != FileType::RegularFile {
        return Err(JournalError::EntryNotRegular);
    }
    if metadata.st_uid != expected_owner {
        return Err(JournalError::EntryOwnership);
    }
    if metadata.st_nlink != 1 {
        return Err(JournalError::EntryLinkCount);
    }
    if metadata.st_mode & 0o177 != 0 {
        return Err(JournalError::EntryPermissions);
    }
    Ok(())
}

fn validate_entry(descriptor: &OwnedFd, expected_owner: u32) -> Result<(), JournalError> {
    validate_fixed_entry(descriptor, expected_owner, RECORD_LENGTH)
}

fn validate_fixed_entry(
    descriptor: &OwnedFd,
    expected_owner: u32,
    expected_length: usize,
) -> Result<(), JournalError> {
    let metadata = fstat(descriptor).map_err(|_| JournalError::EntryUnavailable)?;
    if FileType::from_raw_mode(metadata.st_mode) != FileType::RegularFile {
        return Err(JournalError::EntryNotRegular);
    }
    if metadata.st_uid != expected_owner {
        return Err(JournalError::EntryOwnership);
    }
    if metadata.st_nlink != 1 {
        return Err(JournalError::EntryLinkCount);
    }
    if metadata.st_mode & 0o177 != 0 {
        return Err(JournalError::EntryPermissions);
    }
    if metadata.st_size
        != i64::try_from(expected_length).map_err(|_| JournalError::InvalidLength)?
    {
        return Err(JournalError::InvalidLength);
    }
    Ok(())
}

fn encode_gate(reason: DurableBlockReason) -> [u8; GATE_LENGTH] {
    let mut bytes = [0_u8; GATE_LENGTH];
    bytes[0..4].copy_from_slice(&GATE_MAGIC);
    bytes[4..6].copy_from_slice(&VERSION.to_be_bytes());
    bytes[6] = reason.to_wire();
    let digest = Sha256::digest(&bytes[..GATE_PAYLOAD_LENGTH]);
    bytes[GATE_PAYLOAD_LENGTH..].copy_from_slice(&digest);
    bytes
}

fn read_gate(descriptor: OwnedFd) -> Result<DurableBlockReason, JournalError> {
    let mut file = File::from(descriptor);
    let mut bytes = [0_u8; GATE_LENGTH];
    file.read_exact(&mut bytes)
        .map_err(|_| JournalError::InvalidLength)?;
    if bytes[0..4] != GATE_MAGIC {
        return Err(JournalError::InvalidMagic);
    }
    if u16::from_be_bytes([bytes[4], bytes[5]]) != VERSION {
        return Err(JournalError::UnsupportedVersion);
    }
    if bytes[7..GATE_PAYLOAD_LENGTH] != [0; GATE_PAYLOAD_LENGTH - 7] {
        return Err(JournalError::InvalidReservedBytes);
    }
    let expected = Sha256::digest(&bytes[..GATE_PAYLOAD_LENGTH]);
    if bytes[GATE_PAYLOAD_LENGTH..] != expected[..] {
        return Err(JournalError::ChecksumMismatch);
    }
    let reason = DurableBlockReason::from_wire(bytes[6]);
    if reason == DurableBlockReason::Unknown {
        return Err(JournalError::InvalidBlockReason);
    }
    Ok(reason)
}

fn write_and_sync(descriptor: OwnedFd, bytes: &[u8; RECORD_LENGTH]) -> Result<(), JournalError> {
    let mut file = File::from(descriptor);
    file.write_all(bytes)
        .map_err(|_| JournalError::WriteFailed)?;
    file.sync_all().map_err(|_| JournalError::FileSyncFailed)
}

fn read_record(descriptor: OwnedFd) -> Result<JobRecord, JournalError> {
    let mut file = File::from(descriptor);
    let mut bytes = [0_u8; RECORD_LENGTH];
    file.read_exact(&mut bytes)
        .map_err(|_| JournalError::InvalidLength)?;
    decode(&bytes)
}

fn encode(record: JobRecord) -> [u8; RECORD_LENGTH] {
    let mut bytes = [0_u8; RECORD_LENGTH];
    bytes[0..4].copy_from_slice(&MAGIC);
    bytes[4..6].copy_from_slice(&VERSION.to_be_bytes());
    bytes[6] = record.state().to_wire();
    bytes[8..24].copy_from_slice(&record.job_id().bytes());
    bytes[24..32].copy_from_slice(&record.revision().to_be_bytes());
    bytes[32..36].copy_from_slice(&record.principal().uid().to_be_bytes());
    bytes[36..40].copy_from_slice(&record.principal().gid().to_be_bytes());
    bytes[40..56].copy_from_slice(&record.boot_id().bytes());
    bytes[56..64].copy_from_slice(&record.reservation().bytes().to_be_bytes());
    bytes[64..72].copy_from_slice(&record.reservation().inodes().to_be_bytes());
    bytes[72..76].copy_from_slice(&record.reservation().mounts().to_be_bytes());
    bytes[76..84].copy_from_slice(&record.created_at_ms().to_be_bytes());
    bytes[84..92].copy_from_slice(&record.updated_at_ms().to_be_bytes());
    let digest = Sha256::digest(&bytes[..PAYLOAD_LENGTH]);
    bytes[PAYLOAD_LENGTH..].copy_from_slice(&digest);
    bytes
}

fn decode(bytes: &[u8; RECORD_LENGTH]) -> Result<JobRecord, JournalError> {
    if bytes[0..4] != MAGIC {
        return Err(JournalError::InvalidMagic);
    }
    if u16::from_be_bytes([bytes[4], bytes[5]]) != VERSION {
        return Err(JournalError::UnsupportedVersion);
    }
    if bytes[7] != 0 || bytes[92..96] != [0; 4] {
        return Err(JournalError::InvalidReservedBytes);
    }
    let expected = Sha256::digest(&bytes[..PAYLOAD_LENGTH]);
    if bytes[PAYLOAD_LENGTH..] != expected[..] {
        return Err(JournalError::ChecksumMismatch);
    }
    let fields = JobRecordFields {
        job_id: array::<16>(&bytes[8..24]),
        revision: u64::from_be_bytes(array::<8>(&bytes[24..32])),
        state: JobState::from_wire(bytes[6]),
        principal: Principal::create(
            u32::from_be_bytes(array::<4>(&bytes[32..36])),
            u32::from_be_bytes(array::<4>(&bytes[36..40])),
        ),
        boot_id: array::<16>(&bytes[40..56]),
        bytes: u64::from_be_bytes(array::<8>(&bytes[56..64])),
        inodes: u64::from_be_bytes(array::<8>(&bytes[64..72])),
        mounts: u32::from_be_bytes(array::<4>(&bytes[72..76])),
        created_at_ms: u64::from_be_bytes(array::<8>(&bytes[76..84])),
        updated_at_ms: u64::from_be_bytes(array::<8>(&bytes[84..92])),
    };
    JobRecord::restore(fields).map_err(JournalError::InvalidState)
}

fn array<const N: usize>(bytes: &[u8]) -> [u8; N] {
    let mut value = [0_u8; N];
    value.copy_from_slice(bytes);
    value
}

fn final_name(job_id: JobId) -> Vec<u8> {
    name_with_suffix(job_id, FINAL_SUFFIX)
}

fn temporary_name(job_id: JobId) -> Vec<u8> {
    name_with_suffix(job_id, TEMP_SUFFIX)
}

fn name_with_suffix(job_id: JobId, suffix: &[u8]) -> Vec<u8> {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut name = Vec::with_capacity(32 + suffix.len());
    for byte in job_id.bytes() {
        name.push(HEX[usize::from(byte >> 4)]);
        name.push(HEX[usize::from(byte & 0x0f)]);
    }
    name.extend_from_slice(suffix);
    name
}

fn parse_final_name(name: &[u8]) -> Option<JobId> {
    if name.len() != 32 + FINAL_SUFFIX.len() || !name.ends_with(FINAL_SUFFIX) {
        return None;
    }
    let mut bytes = [0_u8; 16];
    for (index, byte) in bytes.iter_mut().enumerate() {
        *byte = (hex(name[index * 2])? << 4) | hex(name[index * 2 + 1])?;
    }
    JobId::create(bytes)
}

const fn hex(value: u8) -> Option<u8> {
    match value {
        b'0'..=b'9' => Some(value - b'0'),
        b'a'..=b'f' => Some(value - b'a' + 10),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use std::fs::{self, OpenOptions};
    use std::io::{Seek, SeekFrom};
    use std::os::unix::fs::{OpenOptionsExt, PermissionsExt};
    use std::process::Command;
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::sync::mpsc;
    use std::time::Duration;

    use super::*;
    use crate::state::{Principal, Reservation};

    static NEXT_FIXTURE: AtomicU64 = AtomicU64::new(1);

    #[test]
    fn journal_round_trip_replaces_one_monotonic_record() {
        let fixture = Fixture::new();
        let journal = fixture.journal();
        let allocated = record();
        journal.persist(allocated).expect("persist allocated");
        let sealed = allocated
            .transition(1, JobState::InputSealed, 2)
            .expect("transition");
        journal.persist(sealed).expect("persist sealed");

        let loaded = journal.load().expect("load");
        assert_eq!(loaded.records.len(), 1);
        assert_eq!(loaded.records.get(&sealed.job_id()), Some(&sealed));
        assert_eq!(loaded.durable_block(), None);
    }

    #[test]
    fn checksum_corruption_is_rejected() {
        let fixture = Fixture::new();
        let journal = fixture.journal();
        let record = record();
        journal.persist(record).expect("persist");
        let path = fixture
            .root
            .join(String::from_utf8(final_name(record.job_id())).expect("name"));
        let mut file = OpenOptions::new().write(true).open(path).expect("open");
        file.seek(SeekFrom::Start(80)).expect("seek");
        file.write_all(b"NOPE").expect("corrupt");
        file.sync_all().expect("sync corruption");
        assert_eq!(journal.load(), Err(JournalError::ChecksumMismatch));
    }

    #[test]
    fn crash_residue_and_unknown_entries_block_loading() {
        let fixture = Fixture::new();
        let journal = fixture.journal();
        create_private(&fixture.root.join("orphan.tmp"), b"orphan");
        assert_eq!(journal.load(), Err(JournalError::TemporaryArtifact));

        fs::remove_file(fixture.root.join("orphan.tmp")).expect("remove temp");
        create_private(&fixture.root.join("unexpected"), b"unknown");
        assert_eq!(journal.load(), Err(JournalError::UnexpectedEntry));
    }

    #[test]
    fn checksummed_unknown_state_is_still_rejected() {
        let mut bytes = encode(record());
        bytes[6] = 0xff;
        let digest = Sha256::digest(&bytes[..PAYLOAD_LENGTH]);
        bytes[PAYLOAD_LENGTH..].copy_from_slice(&digest);
        assert_eq!(
            decode(&bytes),
            Err(JournalError::InvalidState(StateError::UnknownState))
        );
    }

    #[test]
    fn intervention_latch_is_durable_and_closed() {
        let fixture = Fixture::new();
        let journal = fixture.journal();
        journal
            .latch_block(DurableBlockReason::ReconciliationMismatch)
            .expect("latch block");
        let loaded = journal.load().expect("load marker");
        assert_eq!(
            loaded.durable_block(),
            Some(DurableBlockReason::ReconciliationMismatch)
        );
        assert_eq!(
            journal.latch_block(DurableBlockReason::Unknown),
            Err(JournalError::InvalidBlockReason)
        );
    }

    #[test]
    fn unknown_intervention_reason_is_rejected_at_the_wire_boundary() {
        let fixture = Fixture::new();
        let journal = fixture.journal();
        journal
            .latch_block(DurableBlockReason::ReconciliationMismatch)
            .expect("latch block");
        let path = fixture
            .root
            .join(String::from_utf8(GATE_NAME.to_vec()).expect("name"));
        let mut file = OpenOptions::new()
            .read(true)
            .write(true)
            .open(path)
            .expect("open marker");
        let mut bytes = [0_u8; GATE_LENGTH];
        file.read_exact(&mut bytes).expect("read marker");
        bytes[6] = 0xff;
        let digest = Sha256::digest(&bytes[..GATE_PAYLOAD_LENGTH]);
        bytes[GATE_PAYLOAD_LENGTH..].copy_from_slice(&digest);
        file.seek(SeekFrom::Start(0)).expect("seek");
        file.write_all(&bytes).expect("write marker");
        file.sync_all().expect("sync marker");
        assert_eq!(journal.load(), Err(JournalError::InvalidBlockReason));
    }

    #[test]
    fn a_second_writer_cannot_open_the_same_journal() {
        let fixture = Fixture::new();
        let first = fixture.journal();
        assert!(matches!(
            Journal::open(&fixture.root, fixture.owner),
            Err(JournalError::LockUnavailable)
        ));
        drop(first);
        assert!(Journal::open(&fixture.root, fixture.owner).is_ok());
    }

    #[test]
    fn exclusive_lock_is_visible_to_a_competing_process() {
        let fixture = Fixture::new();
        let _journal = fixture.journal();
        let output = Command::new(std::env::current_exe().expect("test executable"))
            .arg("--exact")
            .arg("journal::tests::journal_lock_probe_helper")
            .env("STORECORE_JOURNAL_LOCK_PROBE", &fixture.root)
            .env("STORECORE_JOURNAL_LOCK_OWNER", fixture.owner.to_string())
            .output()
            .expect("run competing process");
        assert!(
            output.status.success(),
            "{}",
            String::from_utf8_lossy(&output.stderr)
        );
    }

    #[test]
    fn journal_lock_probe_helper() {
        let Some(root) = std::env::var_os("STORECORE_JOURNAL_LOCK_PROBE") else {
            return;
        };
        let owner = std::env::var("STORECORE_JOURNAL_LOCK_OWNER")
            .expect("probe owner")
            .parse::<u32>()
            .expect("numeric owner");
        assert!(matches!(
            Journal::open(Path::new(&root), owner),
            Err(JournalError::LockUnavailable)
        ));
    }

    #[test]
    fn fifo_with_a_valid_record_name_is_rejected_without_blocking() {
        let fixture = Fixture::new();
        let journal = fixture.journal();
        let name = format!("{}.job", "01".repeat(16));
        rustix::fs::mkfifoat(
            rustix::fs::CWD,
            fixture.root.join(name),
            Mode::RUSR | Mode::WUSR,
        )
        .expect("create fifo");
        let (sender, receiver) = mpsc::channel();
        std::thread::spawn(move || sender.send(journal.load()).expect("send result"));
        assert_eq!(
            receiver
                .recv_timeout(Duration::from_secs(2))
                .expect("FIFO validation must be bounded"),
            Err(JournalError::EntryNotRegular)
        );
    }

    fn create_private(path: &Path, bytes: &[u8]) {
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .mode(0o600)
            .open(path)
            .expect("create");
        file.write_all(bytes).expect("write");
        file.sync_all().expect("sync");
    }

    fn record() -> JobRecord {
        JobRecord::allocate(
            [1; 16],
            Principal::create(1000, 1000),
            [2; 16],
            Reservation::create(1024, 8, 1).expect("reservation"),
            1,
        )
        .expect("record")
    }

    struct Fixture {
        root: std::path::PathBuf,
        owner: u32,
    }

    impl Fixture {
        fn new() -> Self {
            let id = NEXT_FIXTURE.fetch_add(1, Ordering::Relaxed);
            let root = std::env::temp_dir().join(format!(
                "storecore-media-broker-journal-{}-{id}",
                std::process::id()
            ));
            fs::create_dir(&root).expect("create fixture");
            fs::set_permissions(&root, fs::Permissions::from_mode(0o700)).expect("permissions");
            Self {
                root,
                owner: rustix::process::geteuid().as_raw(),
            }
        }

        fn journal(&self) -> Journal {
            Journal::open(&self.root, self.owner).expect("journal")
        }
    }

    impl Drop for Fixture {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.root);
        }
    }
}
