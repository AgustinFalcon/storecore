VERDICT: APPROVED

## Evidence identity

- provider: xAI
- model: Grok 4.7
- effort: medium
- substitute-for: gpt-5.6-sol-medium (no quota)
- lane: security
- PR: 335 `feat(media): start derived worker unit through PID 1`
- head SHA: `1b143d56ac88cffa1b8bd679ad6794267a0b43a1`
- base SHA: `a20b4adc20ea0e1538dc77eadc5863973fcc16d1`
- Verify: `44965939283` 7/7 success, none cancelled
- media-broker-pid1: `137034939357`

## Why this cut

Start the derived worker unit on PID 1 with root-owned Java/jar and `SELF_TEST` on tmpfs `03770`. Client cannot supply `ExecStart`, `Where`, or properties.

## What holds

- `ApprovedRuntime::open` `NOFOLLOW`, owner 0, `nlink=1`, Java `0555`, jar `0444`
- Parents reject group/other write unless sticky
- `User`/`Group` derived numeric 2102; CI NSS group named `2102` so systemd can resolve `Group=2102`
- `NoNewPrivileges`, `ProtectSystem=strict`, `ReadWritePaths=<Where>`, `TMPDIR=<Where>`
- `request.bin` `0640` root:2102; `result.bin` `NOFOLLOW` uid 2102 size > 0; no `output.bin`
- `NoSuchUnit` only maps to `NotLoaded`; other D-Bus errors stay `Unavailable`
- No secrets, HTTP, or `Ready`

## Findings

No P0. No P1. No P2. No P3.

## Residuals

`003B-4B-3`, `003B-4C`, TASK-005, and #7 stay open. This file is not a GitHub approval.
