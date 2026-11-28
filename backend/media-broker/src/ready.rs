//! Effective Ready attestation for MEDIA-NORMALIZE-003B-4C.
//!
//! ADR-001 only allows [`ReadyAttestation::Ready`] when live
//! `CPUQuotaPerSecUSec` is 100% and `RestrictAddressFamilies` denies
//! `AF_INET`/`AF_INET6`. Absence, a laxer value, or an unreadable value is
//! [`ReadyAttestation::Unavailable`]. This module does not close the factory
//! or `003B-4C`.

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ReadyAttestation {
    Ready,
    Unavailable,
    Unknown,
}

impl ReadyAttestation {
    #[must_use]
    pub fn from_wire(raw: &str) -> Self {
        match raw {
            "READY" => Self::Ready,
            "UNAVAILABLE" => Self::Unavailable,
            _ => Self::Unknown,
        }
    }

    /// Evaluate live PID 1 readings of `CPUQuotaPerSecUSec` and
    /// `RestrictAddressFamilies`.
    #[must_use]
    pub fn from_effective(cpu_quota: &str, address_families: &str) -> Self {
        if cpu_quota_is_100_percent(cpu_quota) && families_deny_inet(address_families) {
            Self::Ready
        } else {
            Self::Unavailable
        }
    }
}

fn cpu_quota_is_100_percent(value: &str) -> bool {
    let trimmed = value.trim();
    trimmed == "1000000"
        || trimmed == "1s"
        || trimmed == "1 s"
        || trimmed == "1000000us"
        || trimmed == "1,000,000"
}

fn families_deny_inet(value: &str) -> bool {
    let trimmed = value.trim();
    if trimmed.is_empty() || trimmed == "~" {
        return false;
    }
    // systemd dump uses one leading `~` for the whole deny-list:
    // `~AF_INET AF_INET6` means both families are denied.
    let deny_list = trimmed.starts_with('~');
    let tokens: Vec<String> = trimmed
        .trim_start_matches('~')
        .split_whitespace()
        .map(|token| {
            token
                .trim_start_matches('~')
                .trim_matches(|c| c == '"' || c == '\'')
                .to_ascii_uppercase()
        })
        .filter(|token| !token.is_empty())
        .collect();
    if tokens.is_empty() {
        return false;
    }
    if deny_list {
        return tokens.iter().any(|token| token == "AF_INET")
            && tokens.iter().any(|token| token == "AF_INET6");
    }
    !tokens
        .iter()
        .any(|token| token == "AF_INET" || token == "AF_INET6")
}

#[cfg(test)]
mod tests {
    use super::ReadyAttestation;

    #[test]
    fn from_wire_ready_is_the_ready_literal() {
        assert_eq!(
            ReadyAttestation::from_wire("UNAVAILABLE"),
            ReadyAttestation::Unavailable
        );
        assert_eq!(
            ReadyAttestation::from_wire("READY"),
            ReadyAttestation::Ready
        );
        assert_eq!(
            ReadyAttestation::from_wire("unknown"),
            ReadyAttestation::Unknown
        );
        assert_eq!(
            ReadyAttestation::from_wire("ready"),
            ReadyAttestation::Unknown
        );
    }

    #[test]
    fn unbounded_cpu_quota_is_unavailable() {
        for cpu in ["", "~", "infinity", "n/a", "N/A", "100%"] {
            assert_eq!(
                ReadyAttestation::from_effective(cpu, "~AF_INET AF_INET6"),
                ReadyAttestation::Unavailable,
                "cpu {cpu:?}"
            );
        }
    }

    #[test]
    fn unrestricted_address_families_is_unavailable() {
        for families in ["", "~"] {
            assert_eq!(
                ReadyAttestation::from_effective("1000000", families),
                ReadyAttestation::Unavailable,
                "families {families:?}"
            );
        }
    }

    #[test]
    fn hundred_percent_quota_and_inet_deny_list_are_ready() {
        assert_eq!(
            ReadyAttestation::from_effective("1000000", "~AF_INET AF_INET6"),
            ReadyAttestation::Ready
        );
        assert_eq!(
            ReadyAttestation::from_effective("1s", "~AF_INET ~AF_INET6"),
            ReadyAttestation::Ready
        );
        assert_eq!(
            ReadyAttestation::from_effective("1000000", "AF_UNIX AF_NETLINK"),
            ReadyAttestation::Ready
        );
    }

    #[test]
    fn allow_list_that_includes_inet_is_unavailable() {
        assert_eq!(
            ReadyAttestation::from_effective("1000000", "AF_UNIX AF_INET AF_INET6"),
            ReadyAttestation::Unavailable
        );
    }
}
