use storecore_media_broker::protocol::{
    BrokerOperation, BrokerRequest, BrokerResponse, BrokerResult, ProtocolError,
};

const VECTORS: &str = include_str!("../vectors/v1.properties");

#[test]
fn request_matches_the_cross_language_golden_vector() {
    let expected = vector("request");
    let request = BrokerRequest::create(BrokerOperation::SealInput, job_id(), 7, digest(), 5)
        .expect("valid request");

    assert_eq!(request.encode().as_slice(), expected);
    assert_eq!(BrokerRequest::decode(&expected), Ok(request));
}

#[test]
fn response_matches_the_cross_language_golden_vector() {
    let expected = vector("response");
    let response = BrokerResponse::create(BrokerResult::SnapshotAccepted, job_id(), 7)
        .expect("valid response");

    assert_eq!(response.encode().as_slice(), expected);
    assert_eq!(BrokerResponse::decode(&expected), Ok(response));
}

#[test]
fn decoder_fails_closed_for_unknown_and_malformed_wire_values() {
    let mut unknown_operation = vector("request");
    unknown_operation[6] = 99;
    assert_eq!(
        BrokerRequest::decode(&unknown_operation),
        Err(ProtocolError::UnknownOperation)
    );

    let mut non_zero_reserved = vector("response");
    non_zero_reserved[7] = 1;
    assert_eq!(
        BrokerResponse::decode(&non_zero_reserved),
        Err(ProtocolError::InvalidReservedByte)
    );

    let mut future_version = vector("request");
    future_version[5] = 2;
    assert_eq!(
        BrokerRequest::decode(&future_version),
        Err(ProtocolError::UnsupportedVersion)
    );
}

fn vector(key: &str) -> Vec<u8> {
    let raw = VECTORS
        .lines()
        .find_map(|line| line.strip_prefix(&format!("{key}=")))
        .expect("golden vector exists");
    assert_eq!(raw.len() % 2, 0);
    raw.as_bytes()
        .as_chunks::<2>()
        .0
        .iter()
        .map(|pair| {
            let text = std::str::from_utf8(pair).expect("ASCII hex");
            u8::from_str_radix(text, 16).expect("valid hex")
        })
        .collect()
}

fn job_id() -> [u8; 16] {
    [
        0x00, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88, 0x99, 0xaa, 0xbb, 0xcc, 0xdd, 0xee,
        0xff,
    ]
}

fn digest() -> [u8; 32] {
    core::array::from_fn(|index| u8::try_from(index).expect("digest index fits"))
}
