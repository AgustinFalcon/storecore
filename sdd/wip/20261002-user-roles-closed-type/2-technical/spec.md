# Technical spec — closed internal roles

Kotlin InternalRole is an enum with ADMIN, OPERATOR and Unknown. fromWire accepts
only exact current codes, preserving existing authorization behavior without
normalization that could elevate previously invalid values. isKnown and
hasKnownRole belong to the type; InternalUserPrincipal exposes that predicate.

JdbcIdentityService translates roles via fromWire and requires a known role
before session issuance or USER authentication. RequestAuth also rejects an
Unknown-only principal. Both JdbcCapabilityService actor paths require a known
role, replacing non-empty-set checks that would accidentally accept Unknown.
Existing explicit ADMIN checks and ADMIN/OPERATOR write checks remain intact.

TypeScript UserRole has a private constructor, static instances, one fromWire
decoder accepting unknown and a fixed Unknown label. mapUserSession maps raw
array elements directly through that decoder; it never stringifies objects into
a valid role. UserSessionResult contains readonly UserRole[]. Sign-in and probe
require a known instance before marking local identity; probe rejects before
CSRF retrieval. Failure clears any previous local identity.

Tests cover strict decoding, collection identity, mocked database issuance and
authentication, request-level ADMIN separation, both capability evaluation
paths, HTTP mapping and local session establishment. Database mocks are unit
evidence, not live PostgreSQL or installation authorization evidence.
