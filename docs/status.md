# Validation status — 0.13.2 development

## Automated

152 tests pass locally on Node 24.22.0. Tests include real serialized page-adapter execution with synthetic HTTP responses, MCP/tunnel integration, component bridge simulations, encrypted-key lifecycle, all-write previews, stale-card rehydration, exact-step replay rejection, same-account report recovery and project-plan dependencies. No runtime npm dependencies.

CI is configured for Node 22.22 and 24. Node 22 is not installed in this environment; the owner verified both hosted jobs for 0.13.0, while 0.13.1 needs a new CI run. The portable runner selects the appropriate isolation flag. Packaging uses Python standard library and produces unsigned install/source archives with SHA-256 files. No new Mozilla upload has occurred.

## Catalog mismatch regression

The owner’s live output examined 19 of 20 returned chats and could not call prepare_project_plan although server instructions named it. This is consistent with stale/disabled host metadata; the actual host callable set has not been independently inspected. The current MCP catalog includes the plan tool and 50-chat schemas. Six new tests exercise the real serialized adapter selecting 50 after exclusion, default/short selection, runtime evidence for cached callers/errors and non-fatal observation recording. Host refresh/new-conversation validation remains required.

## Browser evidence

Earlier 0.12.x owner checks covered listing/search/reading, individual actions, project creation/moves, a verified disposable deletion, vault restart/unlock, permission recovery and English settings/component screenshots. Earlier intermittent discovery/deletion failures were not root-caused.

The new 0.13 flows require fresh authenticated Firefox validation: every-write confirmation, partial-plan reload/resume, same-account report recovery, batch project organization and observed setup feedback. A full 50-chat run, second-account/workspace checks and prolonged lifecycle remain unverified. Android is not declared compatible; Chromium is not supported by current browser evidence.

## External status

The owner submitted 0.12.2 to the public Mozilla channel; approval/live listing has not been rechecked. 0.13.1 is a local development update only. The owner reported both Node 22.22 and Node 24 CI jobs green for the preceding 0.13.0 commit. GitHub CI must be checked after pushing this update. Recorded real-response fixtures, new host-form screenshots and web-ext lint are outstanding; synthetic tests are not substituted as evidence for them.

See [review resolution](review-resolution.md), [connection setup](connection-setup.md) and [manual verification](review-setup.md). No independent security certification or physical data-erasure claim is made.

## Project-plan argument rejection

The owner reports a live 50-chat selection and completed overview pass, followed by JSON-RPC -32602 on a three-project/twelve-move proposal. No card or writes occurred. The exact submitted arguments have been requested, not received. Explicit project_id:null was reproduced as rejected in 0.13.1 and is now supported; it is a plausible cause, not a confirmed diagnosis of the owner’s request. Five regression tests cover three new projects/twelve moves preparing without writes, omitted/null IDs, bounded private-safe diagnostics and pre-execution rejection. Live confirmation of the original case remains pending.
