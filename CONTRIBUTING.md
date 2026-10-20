# Contributing

Read README.md and SECURITY.md before changing data access or mutations. Keep fixed endpoint paths, strict identity/document checks, bounded results, exact-revision in-chat confirmation and the no-retry rule for uncertain writes.

Run `npm test` with Node 22.22+ and `python3 scripts/package_firefox.py` with Python 3. No npm install is required. Use synthetic fixtures for automation; label their provenance. Never call generated mocks recorded production responses. Real contract samples must be deliberately reduced/redacted and reviewed before commit. Never commit credentials, HAR, private chat contents or approval tokens. Examples must not use personal conversations.

Document architectural changes and their rationale in docs/architecture.md. Preserve the original owner-supplied artwork and MIT license. Bump the UI resource URI/catalog when client-visible component changes need cache invalidation; ordinary build-only version changes need not bump the catalog.

Use issues for reproducible non-sensitive problems. For sensitive reports, contact sbaginov@yahoo.it without including credentials or private user data in the initial message. A local mocked regression does not replace authenticated browser validation.
