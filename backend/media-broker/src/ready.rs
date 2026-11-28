//! Effective Ready attestation for MEDIA-NORMALIZE-003B-4C.
//!
//! ADR-001 only allows `Ready` when every live sandbox property matches. This
//! cut still has no `Ready` variant: even a finite `CPUQuotaPerSecUSec` and a
//! deny-list `RestrictAddressFamilies` evaluate to
//! [`ReadyAttestation::Unavailable`]. Absence, a laxer value, or an unreadable
//! value is also `Unavailable`.

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ReadyAttestation {
    Unavailable,
    Unknown,
}

impl ReadyAttestation {
    #[must_use]
    pub fn from_wire(raw: &str) -> Self {
        match raw {
            "UNAVAILABLE" => Self::Unavailable,
            _ => Self::Unknown,
        }
    }

    /// Evaluate live PID 1 readings. This cut never produces Ready.
    #[must_use]
    #[allow(clippy::if_same_then_else)]
    pub fn from_effective(cpu_quota: &str, address_families: &str) -> Self {
        if cpu_quota_absent(cpu_quota) || families_unrestricted(address_families) {
            Self::Unavailable
        } else {
            Self::Unavailable
        }
    }
}

fn cpu_quota_absent(value: &str) -> bool {
    value.is_empty() || value == "~" || value == "infinity" || value.eq_ignore_ascii_case("n/a")
}

fn families_unrestricted(value: &str) -> bool {
    value.is_empty() || value == "~"
}

#[cfg(test)]
mod tests {
    use super::ReadyAttestation;

    #[test]
    fn from_wire_unknown_includes_ready_literal() {
        assert_eq!(
            ReadyAttestation::from_wire("UNAVAILABLE"),
            ReadyAttestation::Unavailable
        );
        assert_eq!(
            ReadyAttestation::from_wire("READY"),
            ReadyAttestation::Unknown
        );
        assert_eq!(
            ReadyAttestation::from_wire("unknown"),
            ReadyAttestation::Unknown
        );
    }

    #[test]
    fn unbounded_cpu_quota_is_unavailable() {
        for cpu in ["", "~", "infinity", "n/a", "N/A"] {
            assert_eq!(
                ReadyAttestation::from_effective(cpu, "AF_UNIX"),
                ReadyAttestation::Unavailable,
                "cpu {cpu:?}"
            );
        }
    }

    #[test]
    fn unrestricted_address_families_is_unavailable() {
        for families in ["", "~"] {
            assert_eq!(
                ReadyAttestation::from_effective("100%", families),
                ReadyAttestation::Unavailable,
                "families {families:?}"
            );
        }
    }

    #[test]
    fn finite_quota_and_af_unix_are_still_unavailable() {
        assert_eq!(
            ReadyAttestation::from_effective("100%", "AF_UNIX"),
            ReadyAttestation::Unavailable
        );
    }
}
