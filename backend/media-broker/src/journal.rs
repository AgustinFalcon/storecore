use crate::state::{Admission, DurableOperation, IsolationProfile, JobRecord, JobState, Principal};
use rustix::fs::{Mode, OFlags, open};
use sha2::{Digest, Sha256};
use std::fs::{self, File};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};

pub const RECORD_LENGTH: usize = 128;
const MAGIC: [u8; 4] = *b"SCJR";
const VERSION: u16 = 1;
const BODY: usize = 96;

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum JournalError {
    Unavailable,
    Corrupt,
}

pub struct DurableJournal {
    directory: PathBuf,
}

impl DurableJournal {
    /// Opens or creates a journal directory and refuses symbolic links.
    ///
    /// # Errors
    ///
    /// Returns [`JournalError::Unavailable`] when the directory cannot be created
    /// or opened without following links.
    pub fn open(root: &Path) -> Result<Self, JournalError> {
        if root.exists() {
            let metadata = fs::symlink_metadata(root).map_err(|_| JournalError::Unavailable)?;
            if metadata.file_type().is_symlink() || !metadata.is_dir() {
                return Err(JournalError::Unavailable);
            }
        } else {
            fs::create_dir_all(root).map_err(|_| JournalError::Unavailable)?;
        }
        Ok(Self {
            directory: root.to_path_buf(),
        })
    }

    /// Persists one job record with fsync, atomic rename and directory fsync.
    ///
    /// # Errors
    ///
    /// Returns [`JournalError`] when encoding fails or durable write cannot be
    /// proven.
    pub fn persist(&self, record: JobRecord) -> Result<(), JournalError> {
        let bytes = encode(record)?;
        let name = hex(record.job_id());
        let destination = self.directory.join(format!("{name}.rec"));
        let temporary = self.directory.join(format!("{name}.rec.tmp"));
        let _ = fs::remove_file(&temporary);
        {
            let mut file = File::from(open(
                &temporary,
                OFlags::CREATE | OFlags::EXCL | OFlags::WRONLY | OFlags::CLOEXEC | OFlags::NOFOLLOW,
                Mode::RUSR | Mode::WUSR,
            ).map_err(|_| JournalError::Unavailable)?);
            file.write_all(&bytes).map_err(|_| JournalError::Unavailable)?;
            file.sync_all().map_err(|_| JournalError::Unavailable)?;
        }
        fs::rename(&temporary, &destination).map_err(|_| JournalError::Unavailable)?;
        sync_directory(&self.directory)
    }

    /// Removes a job record after a proven ACK and directory fsync.
    ///
    /// # Errors
    ///
    /// Returns [`JournalError::Unavailable`] when the unlink or directory sync
    /// cannot be proven.
    pub fn remove(&self, job_id: [u8; 16]) -> Result<(), JournalError> {
        let path = self.directory.join(format!("{}.rec", hex(job_id)));
        if path.exists() {
            fs::remove_file(&path).map_err(|_| JournalError::Unavailable)?;
            sync_directory(&self.directory)?;
        }
        Ok(())
    }

    /// Loads every job record. Unknown or truncated frames are corruption.
    ///
    /// # Errors
    ///
    /// Returns [`JournalError::Corrupt`] for an unreadable closed record.
    pub fn load(&self) -> Result<Vec<JobRecord>, JournalError> {
        let mut records = Vec::new();
        let entries = fs::read_dir(&self.directory).map_err(|_| JournalError::Unavailable)?;
        for entry in entries {
            let entry = entry.map_err(|_| JournalError::Unavailable)?;
            let name = entry.file_name();
            let name = name.to_string_lossy();
            if !name.ends_with(".rec") {
                if name.ends_with(".tmp") {
                    return Err(JournalError::Corrupt);
                }
                continue;
            }
            records.push(read_record(&entry.path())?);
        }
        Ok(records)
    }
}

/// Persists the admission gate next to the journal.
///
/// # Errors
///
/// Returns [`JournalError`] when the gate cannot be written durably.
pub fn persist_admission(root: &Path, admission: Admission) -> Result<(), JournalError> {
    if matches!(admission, Admission::Unknown) {
        return Err(JournalError::Corrupt);
    }
    let destination = root.join("admission.bin");
    let temporary = root.join("admission.bin.tmp");
    let _ = fs::remove_file(&temporary);
    {
        let mut file = File::from(open(
            &temporary,
            OFlags::CREATE | OFlags::EXCL | OFlags::WRONLY | OFlags::CLOEXEC | OFlags::NOFOLLOW,
            Mode::RUSR | Mode::WUSR,
        ).map_err(|_| JournalError::Unavailable)?);
        file.write_all(&[admission.to_wire()])
            .map_err(|_| JournalError::Unavailable)?;
        file.sync_all().map_err(|_| JournalError::Unavailable)?;
    }
    fs::rename(&temporary, &destination).map_err(|_| JournalError::Unavailable)?;
    sync_directory(root)
}

/// Reads the admission gate. A missing file is open; unknown bytes close it.
///
/// # Errors
///
/// Returns [`JournalError::Corrupt`] when the file exists but is not a closed
/// gate value.
pub fn load_admission(root: &Path) -> Result<Admission, JournalError> {
    let path = root.join("admission.bin");
    if !path.exists() {
        return Ok(Admission::Open);
    }
    let mut file = File::from(open(
        &path,
        OFlags::RDONLY | OFlags::CLOEXEC | OFlags::NOFOLLOW,
        Mode::empty(),
    ).map_err(|_| JournalError::Unavailable)?);
    let mut bytes = [0_u8; 2];
    let read = file.read(&mut bytes).map_err(|_| JournalError::Unavailable)?;
    if read != 1 {
        return Err(JournalError::Corrupt);
    }
    match Admission::from_wire(bytes[0]) {
        Admission::Unknown => Err(JournalError::Corrupt),
        admission => Ok(admission),
    }
}

pub fn encode(record: JobRecord) -> Result<[u8; RECORD_LENGTH], JournalError> {
    if matches!(record.operation(), DurableOperation::Unknown)
        || matches!(record.state(), JobState::Unknown)
    {
        return Err(JournalError::Corrupt);
    }
    let mut bytes = [0_u8; RECORD_LENGTH];
    bytes[0..4].copy_from_slice(&MAGIC);
    bytes[4..6].copy_from_slice(&VERSION.to_be_bytes());
    bytes[6] = record.operation().to_wire();
    bytes[7] = record.state().to_wire();
    bytes[8..24].copy_from_slice(&record.job_id());
    bytes[24..32].copy_from_slice(&record.revision().to_be_bytes());
    bytes[32..36].copy_from_slice(&record.principal().uid().to_be_bytes());
    bytes[36..40].copy_from_slice(&record.principal().gid().to_be_bytes());
    bytes[40..56].copy_from_slice(&record.boot_id());
    bytes[56] = record.profile().to_wire();
    bytes[57] = u8::from(record.acknowledged());
    bytes[60..68].copy_from_slice(&record.bytes().to_be_bytes());
    bytes[68..76].copy_from_slice(&record.inodes().to_be_bytes());
    let digest: [u8; 32] = Sha256::digest(&bytes[..BODY]).into();
    bytes[BODY..RECORD_LENGTH].copy_from_slice(&digest);
    Ok(bytes)
}

pub fn decode(bytes: &[u8]) -> Result<JobRecord, JournalError> {
    if bytes.len() != RECORD_LENGTH {
        return Err(JournalError::Corrupt);
    }
    if bytes[0..4] != MAGIC {
        return Err(JournalError::Corrupt);
    }
    if u16::from_be_bytes([bytes[4], bytes[5]]) != VERSION {
        return Err(JournalError::Corrupt);
    }
    let expected: [u8; 32] = Sha256::digest(&bytes[..BODY]).into();
    if expected != bytes[BODY..RECORD_LENGTH] {
        return Err(JournalError::Corrupt);
    }
    if bytes[58..60] != [0, 0] || bytes[76..BODY] != [0_u8; 20] {
        return Err(JournalError::Corrupt);
    }
    let operation = DurableOperation::from_wire(bytes[6]);
    let state = JobState::from_wire(bytes[7]);
    if matches!(operation, DurableOperation::Unknown) || matches!(state, JobState::Unknown) {
        return Err(JournalError::Corrupt);
    }
    let mut job_id = [0_u8; 16];
    job_id.copy_from_slice(&bytes[8..24]);
    let revision = u64::from_be_bytes(bytes[24..32].try_into().map_err(|_| JournalError::Corrupt)?);
    let uid = u32::from_be_bytes(bytes[32..36].try_into().map_err(|_| JournalError::Corrupt)?);
    let gid = u32::from_be_bytes(bytes[36..40].try_into().map_err(|_| JournalError::Corrupt)?);
    let mut boot_id = [0_u8; 16];
    boot_id.copy_from_slice(&bytes[40..56]);
    let profile = IsolationProfile::from_wire(bytes[56]);
    let acknowledged = match bytes[57] {
        0 => false,
        1 => true,
        _ => return Err(JournalError::Corrupt),
    };
    let size = u64::from_be_bytes(bytes[60..68].try_into().map_err(|_| JournalError::Corrupt)?);
    let inodes = u64::from_be_bytes(bytes[68..76].try_into().map_err(|_| JournalError::Corrupt)?);
    JobRecord::create(
        operation,
        state,
        job_id,
        revision,
        Principal::create(uid, gid),
        boot_id,
        profile,
        acknowledged,
        size,
        inodes,
    )
    .ok_or(JournalError::Corrupt)
}

fn read_record(path: &Path) -> Result<JobRecord, JournalError> {
    let metadata = fs::symlink_metadata(path).map_err(|_| JournalError::Unavailable)?;
    if metadata.file_type().is_symlink() || !metadata.is_file() {
        return Err(JournalError::Corrupt);
    }
    let mut file = File::from(open(
        path,
        OFlags::RDONLY | OFlags::CLOEXEC | OFlags::NOFOLLOW,
        Mode::empty(),
    ).map_err(|_| JournalError::Unavailable)?);
    let mut bytes = [0_u8; RECORD_LENGTH + 1];
    let read = file.read(&mut bytes).map_err(|_| JournalError::Unavailable)?;
    if read != RECORD_LENGTH {
        return Err(JournalError::Corrupt);
    }
    decode(&bytes[..RECORD_LENGTH])
}

fn sync_directory(path: &Path) -> Result<(), JournalError> {
    let file = File::from(open(
        path,
        OFlags::RDONLY | OFlags::DIRECTORY | OFlags::CLOEXEC | OFlags::NOFOLLOW,
        Mode::empty(),
    ).map_err(|_| JournalError::Unavailable)?);
    file.sync_all().map_err(|_| JournalError::Unavailable)?;
    Ok(())
}

fn hex(bytes: [u8; 16]) -> String {
    bytes.iter().fold(String::with_capacity(32), |mut out, byte| {
        out.push_str(&format!("{byte:02x}"));
        out
    })
}
