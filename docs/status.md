# Validation status — 0.13.0 development

## Automated

141 tests pass locally on Node 24.22.0. Tests include real serialized page-adapter execution with synthetic HTTP responses, MCP/tunnel integration, component bridge simulations, encrypted-key lifecycle, all-write previews, stale-card rehydration, exact-step replay rejection, same-account report recovery and project-plan dependencies. No runtime npm dependencies.

CI is configured for Node 22.22 and 24. Node 22 is not installed in this environment; its hosted result is not yet verified. The portable runner selects the appropriate isolation flag. Packaging uses Python standard library and produces unsigned install/source archives with SHA-256 files. No new Mozilla upload has occurred.

## Browser evidence

Earlier 0.12.x owner checks covered listing/search/reading, individual actions, project creation/moves, a verified disposable deletion, vault restart/unlock, permission recovery and English settings/component screenshots. Earlier intermittent discovery/deletion failures were not root-caused.

The new 0.13 flows require fresh authenticated Firefox validation: every-write confirmation, partial-plan reload/resume, same-account report recovery, batch project organization and observed setup feedback. A full 50-chat run, second-account/workspace checks and prolonged lifecycle remain unverified. Android is not declared compatible; Chromium is not supported by current browser evidence.

## External status

The owner submitted 0.12.2 to the public Mozilla channel; approval/live listing has not been rechecked. 0.13.0 is a local development update only. GitHub CI must be checked after pushing this update. Recorded real-response fixtures, new host-form screenshots and web-ext lint are outstanding; synthetic tests are not substituted as evidence for them.

See [review resolution](review-resolution.md), [connection setup](connection-setup.md) and [manual verification](review-setup.md). No independent security certification or physical data-erasure claim is made.
