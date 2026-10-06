# Validation report

## Passed implementation evidence

- PR #168 local frontend `npm run verify`: architecture, lint, 139 tests and
  production build; mocked-browser accessibility coverage passed.
- PR #168 post-merge Verify `37505759364`: backend and frontend SUCCESS on
  `31d1d4590795580fcf737995fc14e53412d89e0c`.
- PR #169 exact-head Verify `37526296154`: backend SUCCESS, frontend SUCCESS and
  `unified-access-real-e2e` SUCCESS on
  `d20556baabe22f6a8227283215945baabe188fb0`.
- The real-browser gate discovered and executed 12 scenarios using PostgreSQL 16,
  the packaged Spring application, Angular over HTTPS and Chromium: CUSTOMER
  profile mutation/CSRF, USER Admin and Operator homes, both dual-context
  selections, two pre-existing sessions, consumed replay, actual 120-second
  expiry, both isolated logout directions and both role-loss paths. Result:
  12 passed in 2.4 minutes.
- PR #169 `npm run check:ua-real`, complete frontend `npm run verify` and
  `git diff --check` passed locally.
- Closeout branch repeated `npm run check:ua-real` (12 scenarios discovered)
  and complete frontend `npm run verify`: architecture 6/6, lint, 139/139 tests
  and production build. `git diff --check` passed and every relative Markdown
  link in the changed/archive set resolved locally.
- Two independent OpenAI GPT-6.1 Sol reviewers at medium effort approved PR #169
  exact base `31d1d4590795580fcf737995fc14e53412d89e0c` and head
  `d20556baabe22f6a8227283215945baabe188fb0` with no P0–P3 findings.

## Closeout gate

PR #169 was squash-merged as
`99380a656562c784dc8fc4805eccc2a835a2ea48`. Post-merge Verify run
`37528646167` passed backend, frontend and the 12-scenario real E2E job on that
exact `master` commit. The documentation closeout PR still requires two fresh
independent exact-head GPT-6.1 Sol approvals and its own GitHub Verify.

## Limits and retained compatibility

- Local Testcontainers could not use the Windows Docker named pipe in the
  sandbox; hosted GitHub CI is the authoritative PostgreSQL/browser runtime.
- Hosted raw artifacts are retained for seven days; this report records the
  durable scenario/result summary and run IDs.
- The consumer inventory proved repository consumers exist, not that all older
  external installations are absent. Legacy realm credential HTTP endpoints
  therefore remain supported and non-deprecated; `TODO-043` is deferred.
- BlackStore federation, deployment, tag, release, live credentials,
  fiscal/ARCA, Correo Argentino and companion activation were not tested or
  claimed.
