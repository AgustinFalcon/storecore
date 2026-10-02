# Browser acceptance — issue #148

AC-148-1: the browser manifest represents exactly the 24 existing component leaf routes, excluding shell/layout parents and redirects. Runtime inventory drift fails the gate.
AC-148-2: every route renders its expected heading and representative loaded content under its existing public, CUSTOMER or USER session boundary; smoke confirms final URL, readiness and skip-link.
AC-148-3: page errors, unexpected API or external requests and serious/critical axe violations fail. Unexpected mutations cannot reach a backend.
AC-148-4: fixtures are test-only; guards, HTTP repositories, CSRF paths and production providers remain in use. No backend, credential or live integration is required.
AC-148-5: UX22 is distinct from runtime24. Favorites is observed as an existing browser-only prototype, not authorized or promoted; offers is an existing operator route. Coverage is not visual homologation, mobile QA or server authorization assurance.
