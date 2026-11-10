# Technical specification

## Domain

Introduce `HealthStatus` as a TypeScript closed class with private constructor, static `Up` and `Unknown` instances, presentation label, readiness rule and the only `fromWire` translator.

`Health` owns a `HealthStatus`; it does not import Angular, HTTP or UI.

## Data boundary

`HealthHttpRepository` unwraps the response envelope as unknown, reads only an object `status` field and translates it through `HealthStatus.fromWire`.

## Store

`ShellState.apiStatus` is `HealthStatus`. Initial, malformed and transport-error states use `Unknown`; only `Up` sets `ready=true`.

## Verification

- Domain table test for known and unknown wire values.
- Repository tests for envelope `UP` and malformed/future payload.
- Store tests for `Up`, `Unknown` and transport error.
- Architecture, lint, complete frontend tests and production build.
