# TASK-013 residual — Playwright + axe

`npm run test:a11y` in `frontend/` runs Chromium against `/`, `/catalog`, `/customer/session`, `/customer/register` and `/user/session`. Serious/critical axe violations fail the job.

Stitch HTML under `docs/agent/frontend/stitch/` remains a visual reference, not an automated pixel baseline.
