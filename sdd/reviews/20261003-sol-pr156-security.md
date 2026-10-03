# GPT-6.1 Sol security review — PR #156

VERDICT: APPROVED

- Provider: OpenAI
- Model: `gpt-6.1-sol`
- Effort: `medium`
- Head SHA: `b698e96a975c3ae59d7af8f9b27922345aa9450f`
- Base SHA: `a631597`
- Scope: V9 SECURITY DEFINER path/ACL hardening and adversarial tests

V9 fixes six published signatures with explicit `pg_temp` ordering, revokes `PUBLIC`, and grants execution only to `storecore_runtime`. The upgrade and temporary-identity tests cover ownership, ACL, path and absence of mutation. No P0–P3 findings. Local Testcontainers/Maven execution remained blocked by the sandbox; hosted Verify is required.
