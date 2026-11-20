#![cfg(target_os = "linux")]

use std::fs;
use std::time::{SystemTime, UNIX_EPOCH};
use storecore_media_broker::budget::BudgetLimits;
use storecore_media_broker::inventory::FakeRuntime;
use storecore_media_broker::journal::{self, RECORD_LENGTH};
use storecore_media_broker::machine::{ApplyError, DurableBroker};
use storecore_media_broker::state::{
    Admission, DurableIntent, DurableOperation, IsolationProfile, JobState, Principal,
};

#[test]
fn allocate_seal_start_terminate_ack_releases_budget() {
    let mut fixture = Fixture::new();
    let allocated = fixture
        .store
        .apply(intent(DurableOperation::Allocate, [1; 16], 0))
        .expect("allocate")
        .expect("record");
    assert_eq!(allocated.state(), JobState::Allocated);
    assert_eq!(allocated.revision(), 1);

    let sealed = fixture
        .store
        .apply(intent(DurableOperation::Seal, [1; 16], 1))
        .expect("seal")
        .expect("record");
    assert_eq!(sealed.state(), JobState::InputSealed);

    fixture.store.inventory_mut().insert_unit([1; 16]);
    let started = fixture
        .store
        .apply(intent(DurableOperation::Start, [1; 16], 2))
        .expect("start")
        .expect("record");
    assert_eq!(started.state(), JobState::Running);

    fixture.store.inventory_mut().clear([1; 16]);
    let terminated = fixture
        .store
        .apply(intent(
            DurableOperation::Terminate,
            [1; 16],
            started.revision(),
        ))
        .expect("terminate")
        .expect("record");
    assert_eq!(terminated.state(), JobState::Terminal);
    assert_eq!(fixture.store.admission(), Admission::Closed);

    assert_eq!(
        fixture
            .store
            .apply(intent(DurableOperation::Allocate, [2; 16], 0))
            .expect_err("unacked terminal blocks allocate"),
        ApplyError::AdmissionClosed
    );

    assert!(
        fixture
            .store
            .apply(intent(
                DurableOperation::Acknowledge,
                [1; 16],
                terminated.revision()
            ))
            .expect("ack")
            .is_none()
    );
    assert_eq!(fixture.store.admission(), Admission::Open);
    assert!(fixture.store.inspect([1; 16]).is_none());
}

#[test]
fn replayed_uuid_does_not_transfer_authority() {
    let mut fixture = Fixture::new();
    fixture
        .store
        .apply(intent(DurableOperation::Allocate, [9; 16], 0))
        .expect("allocate");
    assert_eq!(
        fixture
            .store
            .apply(intent(DurableOperation::Allocate, [9; 16], 0))
            .expect_err("replay"),
        ApplyError::StaleRevision
    );
    assert_eq!(fixture.store.inspect([9; 16]).expect("kept").revision(), 1);
}

#[test]
fn stale_revision_and_unknown_transition_close_admission() {
    let mut fixture = Fixture::new();
    fixture
        .store
        .apply(intent(DurableOperation::Allocate, [3; 16], 0))
        .expect("allocate");
    assert_eq!(
        fixture
            .store
            .apply(intent(DurableOperation::Seal, [3; 16], 99))
            .expect_err("cas"),
        ApplyError::StaleRevision
    );
    assert_eq!(
        fixture
            .store
            .apply(intent(DurableOperation::Start, [3; 16], 1))
            .expect_err("skip seal"),
        ApplyError::InvalidTransition
    );
    assert_eq!(fixture.store.admission(), Admission::Closed);
}

#[test]
fn leftover_pid_after_seal_quarantines_and_closes_gate() {
    let mut fixture = Fixture::new();
    fixture
        .store
        .apply(intent(DurableOperation::Allocate, [4; 16], 0))
        .expect("allocate");
    fixture.store.inventory_mut().insert_pid_only([4; 16]);
    let sealed = fixture
        .store
        .apply(intent(DurableOperation::Seal, [4; 16], 1))
        .expect("seal still records")
        .expect("record");
    assert_eq!(sealed.state(), JobState::Quarantined);
    let leftover = fixture.store.inventory_mut().clone();
    let reopened = DurableBroker::open(&fixture.root, [7; 16], BudgetLimits::STANDARD, leftover)
        .expect("reopen");
    assert_eq!(
        reopened.inspect([4; 16]).expect("job").state(),
        JobState::Quarantined
    );
    assert_eq!(reopened.admission(), Admission::Closed);
}

#[test]
fn truncated_journal_closes_admission() {
    let fixture = Fixture::new();
    drop(fixture.store);
    let journal = fixture.root.join("journal");
    fs::write(journal.join("dead.rec"), [0_u8; 8]).expect("truncate");
    let opened = DurableBroker::open(
        &fixture.root,
        [7; 16],
        BudgetLimits::STANDARD,
        FakeRuntime::empty(),
    );
    assert_eq!(opened.err(), Some(ApplyError::Corrupt));
    assert_eq!(
        journal::load_admission(&fixture.root).expect("gate"),
        Admission::Closed
    );
    let _ = RECORD_LENGTH;
}

struct Fixture {
    root: std::path::PathBuf,
    store: DurableBroker<FakeRuntime>,
}

impl Fixture {
    fn new() -> Self {
        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_nanos();
        let root = std::env::temp_dir().join(format!(
            "storecore-media-broker-durable-{}-{nonce}",
            std::process::id()
        ));
        fs::create_dir_all(&root).expect("root");
        let store =
            DurableBroker::open(&root, [7; 16], BudgetLimits::STANDARD, FakeRuntime::empty())
                .expect("open store");
        Self { root, store }
    }
}

impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.root);
    }
}

fn intent(operation: DurableOperation, job_id: [u8; 16], revision: u64) -> DurableIntent {
    DurableIntent::create(
        operation,
        job_id,
        revision,
        Principal::create(1000, 1000),
        IsolationProfile::ImageIoV1,
        4096,
        64,
    )
    .expect("intent")
}
