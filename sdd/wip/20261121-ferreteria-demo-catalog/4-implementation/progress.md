# Implementation progress

Date: 2026-11-21

- FDC-T01 done: product owner requested a complete synthetic hardware-store population and full-flow validation; scope and non-goals recorded.
- FDC-T02 done: closed `V1`, `V2`, `Unknown`; legacy one-image wire and new ordered galleries translate once to immutable `images`.
- FDC-T03 done: committed catalog has 40 products, eight categories/brands, 84 image placements and eight low-stock products. All 66 unique image URLs returned HTTP 200 with an image content type on 2026-11-21.
- FDC-T04 done on rebased candidate `109cc92a2e417020da109253545a62fd3b7ba577`: showcase 99/99, surface manifest 2/2, Angular 228 files / 1621 tests, lint, demo build and productive-runner contract/list 126 cases pass. The known demo build warning remains 30.53 kB above its warning budget and below the error threshold.
- FDC-T05 done: fresh PostgreSQL 16.14, Flyway V1-V30 and packaged Spring. First real load completed all stages with 40 products and one pending order; replay completed with no new order. Direct DB readback: 40 products, 40 variants, 84 ordered media rows, eight categories, eight brands, stock range 1-86, one synthetic order, one offer and one home section. Exact Spring process, database container and Docker Desktop were stopped afterwards.
- FDC-T06 in progress: Demo Playwright passed 335/335 in 18.9 minutes, covering buyer/admin surfaces, all inventoried CTA, responsive widths, keyboard, Axe, text at 200 percent, persistence and failures. Review correctly identified that Demo uses its isolated repository, not the real API dataset. The workflow therefore injects `ferreteria-demo.json` into the isolated Linux productive runner. Its 126 real HTTP/browser cases remain a required PR CI gate and are not claimed locally; Windows correctly lacks the required non-root Linux UID plus root-owned IPv4/IPv6 firewall attestation.
- FDC-T07 in progress: the branch was rebased onto `origin/master` `9030319` after both preliminary reviewers identified base drift. Two fresh independent reviews are required on the rebased candidate before PR.
