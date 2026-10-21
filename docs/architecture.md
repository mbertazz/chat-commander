# Architecture

The extension contains an MCP handler and outbound OpenAI tunnel client. There is no inbound listener, daemon, developer backend or chat database.

| Component | Responsibility |
|---|---|
| worker / connection | Serialized key/tab lifecycle, optional same-account reconnect and observed catalog/tool-call feedback |
| tunnel / protocol | Bounded HTTPS polling, JSON-RPC validation, deadline handling and response-delivery retries without tool replay |
| live-source | Validates binding, injects adapter and filters returned results; every public write routes to a preview |
| chatgpt-page | Self-contained serialized MAIN-world adapter; fixed same-origin endpoints, session checks, bounded JSON and independent read-back |
| review | Volatile exact plans, reading coverage, private revision capability, expected step, project dependencies, reports and cancellation |
| review-widget / resources | Isolated bilingual confirmation component, review-v6 resource, live status before approval, explicit partial resume |
| contract-checks | User-triggered read-only schema checks; only names and safe codes returned |
| vault | Optional local AES-GCM encryption; runtime credentials in session storage only |

The page adapter remains one function because executeScript serializes it without module closures. Internal helpers are now formatted for reading; adding a bundler is not necessary. Page credentials never return in MCP results.

## Consent and execution

rename_chat, set_chat_archived, create_project, move_chat and delete_chat prepare only. prepare_review creates title/archive plans; prepare_project_plan converts up to five groups and 50 reviewed chats into one creation/move plan. Existing project IDs/names are exact; new destinations reference only successfully verified creation steps in the same plan. Each move repeats metadata, ownership, sharing and permission checks. No automatic name reuse, sharing or project instruction changes.

Only the app-visible apply_review_step accepts a private capability plus revision and expected_step. Replaying step N cannot advance step N+1. Final/attention/cancelled states revoke the capability. Cards refresh get_review before enabling controls and show superseded/terminal state or explicit remaining-step resume. Old cards cannot replace plans through natural-language promises alone.

Writes compare expected metadata and independently read back. Failure before MAIN injection is not_sent, not unknown. After an injection may have started, browser failures remain conservatively uncertain; adapter-level preflight refusals remain failed. A page injection is not proof that HTTP was sent. Conflicts/failed/unknown outcomes stop remaining steps; no transaction or rollback.

## Catalog visibility

Every tool result carries model-visible server_info with actual runtime/catalog versions, limits and advertised model tools. This diagnoses a stale callable catalog but does not update host state. The custom app must be refreshed and its tools enabled in ChatGPT, followed by a new conversation. Model instructions require this preflight before a large read. Setup observations are recorded for successful reviews/previews as well as ordinary reads; storage observation failure never converts an already-computed result into a tool failure.

## Reports and identity

Reconnection/lock revoke pending approvals but retain read-only metadata reports for the same account, subject to TTL/capacity. Worker restart loses reports; disconnect/forget purges them. Reports contain no retained conversation text or credentials. New pairing never authorizes old plans.

An isolated document marker plus optional native document ID protects navigation binding. A SHA-256 fingerprint includes the user and explicit account ID when session/JWT claims expose it; multiple/non-personal workspace claims are refused. Missing claims do not prove workspace isolation. Only personal profiles and private tunnels are supported, not multiuser deployments.

## Reading and operational limits

Recent selection is bounded at 50, default 50. A private extra candidate replaces the protected source chat where available; the result reports requested/selected/scanned counts and request_fulfilled. Public list requests remain capped at 50. Overview reads return at most two segments, deeper reads six, with a 12k character cap per call. Partial coverage stays partial and cannot justify archiving. A cursor is bound to the chat revision. There is deliberately no cross-call raw chat cache: continuation downloads bounded JSON again, trading throughput for avoiding retained private text. Large histories may hit HTTP/context/time limits; no 50-chat performance claim is made.

Tunnel work is deliberately serial and polls one command at a time. No new concurrent mutations were introduced to hide latency. Host requests can still expire in a queue. Reconnect alarms remain bounded; unrelated completed-tab events no longer recheck an already-bound source.

Runtime uses no npm dependencies. Tests run on Node 22.22 and 24 in CI. Firefox desktop 140+ is targeted; Android compatibility is not declared. [Validation status](status.md) distinguishes mocks, past browser checks and pending 0.13 validation.

Retained report access revalidates the live session identity; if the session cannot be verified, reconnect the same account before reading the report.

## Argument rejection

The public project-plan schema and validator both accept an omitted or null project_id for an explicitly new destination. All existing-project ID/ownership/sharing checks remain. Schema failures return JSON-RPC -32602 with bounded validation_errors (path, code, expected rule), also summarized in the message for hosts that hide error data. Argument values, unknown field names, private text and capabilities are never echoed. Rejection occurs before any browser or tool operation. Cross-group duplicate membership is rejected at validation. This diagnostic cannot recover payloads of past calls, nor identify host-side validation failures that never reached the server.
