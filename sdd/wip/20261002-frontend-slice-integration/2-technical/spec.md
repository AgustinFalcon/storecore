# Test-boundary resolution

Combined PR #135 run 37065046894 exposed three frontend test failures and one unhandled error in use-case.providers.spec.ts. The composition fixture had roles:[]; after #149 that is intentionally invalid. #150's separate success/probe tests therefore no longer represented a successful internal identity.

Type the shared fixture as UserSessionResult and supply UserRole.Operator. Repository mocks already sit after the HTTP mapper, so use the domain instance directly rather than adding another fromWire translator. Keep actual appConfig/TestBed factories and session ports in the tests.

Assert the returned closed role and both CSRF reads. Add composed invalid-role cases using UserRole.Unknown/empty collections and existing use-case errors, proving realm isolation and fail-closed behavior. Do not alter production providers, mappers, use cases or authentication policy.
