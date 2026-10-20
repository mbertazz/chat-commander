# 007 — Confirmed project creation, chat moves and deletion

Date: 20 October 2026. Status: implemented in 0.10.0 against candidate internal contracts; authenticated browser verification pending. Supersedes earlier exclusions of these operations, not their historical evidence.

## Scope and user request

The user requested closing the README gaps for project creation, moves and deletion. Implement empty project creation, moving one chat into/out of a project, and deleting one explicitly selected chat. No project deletion, bulk deletion, instruction/file editing, sharing changes or automatic conversion of suggested groups into projects.

## Contracts and evidence

Primary implementation sources inspected on 20 October 2026:

- [ChatGPT Exporter API](https://github.com/pionxzh/chatgpt-exporter/blob/master/src/api.ts) and [Triage source](https://github.com/NASIRCISSISTIC/chatgpt-triage/blob/main/chatgpt-triage.user.js): project discovery via GET `/backend-api/gizmos/snorlax/sidebar`; nested project metadata and pagination. Triage uses PATCH `/backend-api/conversation/{id}` with `gizmo_id` for moves (empty string for removal), and `is_visible:false` for deletion.
- [image-use source](https://github.com/leeguooooo/image-use/blob/main/image-use): observed candidate POST `/backend-api/projects` with `{name,instructions}`; returned ID variants. It is a reference for endpoint behavior only; none of its authentication, automation, fallback or other implementation code is adopted.
- [Projects/chats documentation](https://learn.chatgpt.com/docs/projects) explains the product concept, not the internal HTTP contract.

These are public implementation observations, not documented API guarantees or account-specific tests. Older reports describe a different project-creation endpoint (`gizmos/snorlax/upsert`). The extension does not probe alternate mutation endpoints after a failed/uncertain POST. No code was imported and no package was added.

## Decision

Add `list_projects` and `get_project`, returning only bounded metadata. Public `create_project`, `move_chat` and `delete_chat` are read-only preview tools, despite their short conversational names. They capture exact requested parameters and current state. All writes reuse the existing in-chat component, private `_meta.reviewApproval` capability and app-only `apply_review_step`. Tool descriptions and a model-generated confirmation flag do not authorize writes.

Use the same review map (maximum five plans, 30-minute expiry), lock/cancel/source invalidation, report and no-retry policy. Single-action plans are immutable. A replacement proposal revokes the previous capability; an open bulk review cannot be bypassed by a single-action tool. A successful report retains only allowlisted result metadata so ChatGPT can reference a new project ID. No messages or credentials are retained.

## Preconditions and verification

Project IDs must have the observed `g-p-` form; GPT IDs are not treated as projects. Metadata must explicitly identify chat membership. Unknown fields block new actions instead of being interpreted as no project. Moves require private sharing status and write permission on source/destination, plus presence in a complete bounded owned-project scan. Names, sharing and memory scope are rechecked against the preview. Owned-project checks scan at most five pages of 20; incomplete/repeating pagination fails closed. Same-name creation is rejected rather than silently reusing an arbitrary match.

Creation sends one minimal POST with empty instructions, extracts the returned ID and independently reads project metadata. An unknown response or verification failure after sending is uncertain; do not retry blindly. A fresh listing/native check is needed.

Moves PATCH only `gizmo_id`, then read title/archive/membership back. Removing a chat uses an empty ID and has its own preview. Chat title, archived state or original membership conflicts block the write. The current source-tab chat is protected both in the engine and immediately before the page write.

Deletion PATCHes only `is_visible:false`, requires a positive acknowledgement and then checks same-account inaccessibility (404) or an explicit invisible flag. HTTP 401/403/5xx, timeouts and changed identity cannot verify success. The report does not equate inaccessibility with physical erasure from OpenAI systems. The dedicated red button states permanence and no restoration. Prefer archive in general cleanup suggestions.

The page adapter keeps the token in-page and continues using fixed same-origin paths, identity checks, bounded JSON and deadlines. No new permissions or transport mechanisms. Like earlier writes, concurrency checks are not atomic CAS; a running in-page request may finish after cancellation. Completed operations are not rolled back.

## Validation and release limit

The 0.10.0 suite has 106 passing local tests, including the prior 92 regressions. New tests cover schemas, no-write preparation, hidden capability, exact minimal mutation bodies, ownership/sharing/schema failures, conflicts, current-chat protection, cancellation, expiry, replay/concurrency, account changes, independent verification and uncertain outcomes without mutation retries. The existing component now renders each action explicitly and exposes a dedicated deletion button.

No real project creation/move/deletion was executed by the development agent. First verify read-only schemas in the user’s browser, then proceed one disposable operation and one manual instruction at a time. Missing sharing/permission fields may block all moves until the actual account response is understood. Do not remove that guard to make a demo pass. Refresh tools is required for the new catalog and `review-v3.html` resource.

## Observed sharing schema — 0.10.1

The user verified project discovery and supplied a native detail response. Its sharing object uses `recipient` and `subjects`; a private recipient is invitation-only, so only an explicitly empty subjects array establishes no invitees. Nonempty subjects or link access mean shared. `sharing_targets` lists permitted sharing options and is ignored for current access. Contradictory evidence is rejected. The parser supports this shape with two additional synthetic tests (108 passing tests); authenticated validation of the corrected parser and mutation contracts remains pending. The tool catalog is unchanged. No private response values are retained.

## Observed creation envelope — 0.10.2

The native POST response wraps the created project at `resource.gizmo`. Extract its ID, then independently fetch project metadata and verify the expected name and private sharing. Earlier unsupported envelopes produced an uncertain report despite successful creation. A synthetic regression covers this envelope and a mismatched read-back without retries. Live verification of the corrected flow is pending. No private response values are retained.

## Bounded uncertain-delete diagnostics — 0.10.4

Native reload and a subsequent same-chat GET 404 established that deletion occurred in one browser test, but the original review returned outcome_unknown. The original PATCH response was not captured. Preserve that uncertainty rather than weakening acknowledgement or identity verification. Unknown deletion reports may now include an allowlisted phase and HTTP status/null, filtered independently at page/source/report boundaries; arbitrary page fields and raw errors are discarded. No mutation retry, content retention, extra permissions or external telemetry is introduced. Synthetic fault injection covers each supported diagnostic boundary. Reload loses existing previews; inspect target state before any new explicit confirmation.

## Delete timeout budget — 0.10.5

Live 0.10.4 diagnostics located an uncertain deletion at phase write with HTTP null; Firefox showed NS_BINDING_ABORTED. Native reload subsequently showed the disposable target inaccessible. This is consistent with cancellation during the write, but does not establish the exact network cause or certify extension success. Do not retry these targets. No private identifiers or credentials were retained.

Deletion alone now allows up to 20 seconds for the PATCH (previously 10), bounded by the existing overall command deadline and reserving five seconds for identity/read-back checks. If at most five seconds remain before sending, no PATCH is issued. Other request limits stay at 10 seconds. Positive acknowledgement, same-account independent verification and no mutation retry remain required; slow verification can still produce an unknown outcome. This is a bounded mitigation pending browser validation, not a proven root-cause fix. Two virtual-time regressions cover a 12-second acknowledgement with independent disappearance verification and the short-budget guard. All 114 local tests pass; Firefox build regenerated. Catalog/resource remain 0.10.3/review-v4.

## Abort classification — 0.10.6

Live 0.10.5 still returned write/HTTP null; Firefox showed NS_BINDING_ABORTED with unusable zero/one-ms request timings. Native reload opened a new chat. The longer timeout did not resolve the reporting failure; do not retry the inaccessible test target. Exact deletion acknowledgement and cancellation cause remain unverified.

Static inspection: MAIN-world PATCH receives only its locally created AbortSignal.timeout signal. The worker/tunnel stop signal guards execution before/after injection but is not passed across executeScript into fetch; no explicit page AbortController cancels this PATCH. This cannot rule out page/browser/network interference or prove the timer caused the observed failure.

Unknown deletion diagnostics now optionally expose a fixed failure classification (write_timeout, request_timeout, request_aborted, fetch_type_error, other), write_signal_aborted, elapsed_ms since PATCH initiation (clamped 0–60000), write_timeout_ms (0–20000), and deadline_expired. write_timeout requires the assigned signal to be aborted with TimeoutError; an AbortError alone is classified without attributing its cause. Raw error names/messages/reasons, URLs, headers, IDs and payloads never leave the page. Each field is independently allowlisted again at source/review boundaries. Existing phase/http_status remain compatible. elapsed_ms uses the local wall clock and is diagnostic, not proof of network duration.

116 local tests pass, including virtual-time own-timeout/external-abort/fetch-error classification, no retry, and malformed diagnostic filtering. No real deletion was executed by the agent. Existing timeout/positive acknowledgement/identity/read-back rules are unchanged. Catalog and resource remain 0.10.3/review-v4. This release adds evidence, not a claimed deletion fix.
