# Functional acceptance

All existing repository delegation and reactive sequencing stay the same. CUSTOMER and USER retain distinct sessions, cookies, guards and permissions. Successful sign-in/registration marks only its own session; failed operations do not mark authenticated. Probe marks only after profile/me and CSRF complete successfully. Logout clears its own local authentication/CSRF on success and on error, never the other realm.

Production composition resolves every current use case with its existing HTTP repository and, where needed, its own session. No token or credential moves into the domain.
