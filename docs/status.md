# Validation status — 0.13.4 development

## Automated

156 tests pass locally on Node 24.22.0. Tests include real serialized page-adapter execution with synthetic HTTP responses, MCP/tunnel integration, component bridge simulations, encrypted-key lifecycle, all-write previews, stale-card rehydration, exact-step replay rejection, same-account report recovery and project-plan dependencies. No runtime npm dependencies.

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

## 0.13.3 setup and confirmation usability

Live user evidence: 0.13.2 successfully prepared 3 new projects and 12 moves; nothing applied. Initial invalid-argument cause remains unknown (project_id was omitted, so explicit null was not its cause). A transient tunnel read failure recovered and the same review resumed. The confirmation screenshot repeated a shared reason for every move. Local 0.13.3 groups destinations while retaining every operation and state. Setup previously advanced to step 3 on automatic reconnect; it now pauses at step 2 to check the actual connected tab before continuing, with a visible selector and contextual feedback. Missing tabs cannot appear connected based on saved metadata alone. New behavior has automated coverage; authenticated browser validation remains pending.

## 0.13.4 failed read diagnostics

Owner reported one failed review read followed by four more reads before the host stopped, despite a stop-on-error prompt. Reproduced code defects: read_review_chat used isError:false and told callers to continue, discarded bounded causes, and readLiveChat shadowed its message catalog with a local message list, throwing a ReferenceError on the error path. These are corrected with tool-error signaling, explicit stop instructions, allowlisted cause codes and bounded conversation diagnostics retained in get_review. This does not establish why the owner's original HTTP/read request failed; that payload is unavailable. Added tests cover an HTTP403 through the real page adapter and extension boundary, plus rate-limit/schema/private-error handling and reports. 156 tests pass; authenticated verification pending. Host callers must still honor stop instructions and inspect each sequential result; no server-side batching or automatic retry is introduced. Owner confirmed 0.13.3 tool-call observation after Refresh tools; grouped card remains untested because the fresh review stopped during reading.
