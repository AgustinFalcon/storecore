# PCC-012 delivery contract review — 2026-11-25

## Decision

PCC-012 was split into five independently verifiable cuts: explicit report JSON/GET, complete export preparation, Angular domain/adapter, dashboard/navigation, and safe download/integrated browser journeys.

The amendment closes four gaps before delivery code:

- Domain objects and private maps cannot be serialized directly; an exact DTO mapper owns every wire shape and sealed report-value variant.
- Normal browser GET admission has an explicit same-origin evidence policy that does not require JavaScript to set `Origin`.
- Complete CSV evidence cannot reuse the bounded dashboard projection or open a later snapshot for its count/rows.
- Existing operational routes cannot claim exact drilldown semantics because they do not verify the report period token.

It also binds frontend publication/download to actor generation and request sequence, preserves all numeric values as canonical strings, and requires export preparation before the response is committed.

## Review

Two GPT-6.1 Sol reviewers independently examined the amended technical spec and task split from architecture/frontend and PostgreSQL/security perspectives. Both returned **APPROVE** with no P0-P3 and authorized starting **PCC-012A only**. The exact rectangular CSV record mapping remains an explicit precondition for PCC-012B rather than an invented implementation detail.

No route, runtime bean, frontend code, hosted CI result or merge is claimed by this contract-only evidence.
