# Functional specification

## Problem

The shell currently carries health as an arbitrary string. A future or malformed wire value can therefore be treated as a valid successful state.

## Acceptance

1. `UP` maps to the known available health state.
2. Every other value, including missing, non-string and differently-cased values, maps to `Unknown`.
3. Stores and tests use the closed type rather than string literals.
4. An unknown successful response does not mark the installation ready.
5. Raw unknown wire text is not displayed or retained as a valid status.
