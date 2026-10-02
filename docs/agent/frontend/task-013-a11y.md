# TASK-013 residual — Playwright + axe

`npm run test:a11y` in `frontend/` defines 24 Chromium route smoke/axe cases, one exact runtime-manifest reconciliation check and eight focused fixture/parser/readiness regressions. Synthetic HTTP/session fixtures exercise the existing guards and repositories without a backend; unexpected API/external requests, writes, page errors and serious/critical axe violations fail the job. Expected heading, representative loaded content, final URL and skip-link are asserted.

Runtime coverage includes the historical UX22 plus `/customer/favorites` (existing browser-only prototype, not authorized/promoted here) and `/user/offers` (existing operator route). The manifest is `frontend/e2e/route-manifest.ts`. Shell/layout/redirect entries are not counted as leaf screens. Desktop browser coverage does not claim mobile, pixel-baseline, server authorization, payment or live assurance. Implementation/validation gates: `sdd/wip/20261002-all-routes-a11y/`.

Stitch HTML under `docs/agent/frontend/stitch/` remains a visual reference, not an automated pixel baseline.
