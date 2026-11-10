# StoreCore initial bundle budget

StoreCore now defers the 12 USER administration leaf screens until their existing routes are activated. The root route tree, URLs, ordering, titles, authorization guards, providers and session behavior remain unchanged.

The content editor leave guard was separated from the component module so the guard can remain eager without pulling the editor and its dependencies into the initial graph.

## Result

- Baseline initial production bundle: `774.07 kB`.
- Final initial production bundle: `572.76 kB`.
- Reduction: `201.31 kB` (`26.0%`).
- Existing warning budget: `700 kB`, unchanged.
- Margin below warning budget: `127.24 kB`.

## Evidence

- Architecture: `9/9`.
- Lint: pass.
- Unit tests: `167` files, `1129` tests.
- Dynamic route loaders: `12/12` resolved by focused test.
- Independent Bugbot and Security reviews: `APPROVE`, no P0-P3.
- GitHub Verify candidate run `42755261209`: backend, frontend and unified-access-real-e2e passed.
