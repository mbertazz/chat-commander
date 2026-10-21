# Independent review response — 0.13.0

The 21 October review concerned 0.12.2. This file records implemented changes and evidence limits, not a claim that every hypothesis has been reproduced in ChatGPT.

| Finding | Resolution |
|---|---|
| Rename/archive write without a card | All public mutation tools now prepare only. Individual rename/archive/restore use the same capability gate; expected-state checks remain. Replacement previews revoke older cards. |
| Stale/remounted card shows original state | The component queries get_review before enabling approval, renders live counts/revision, disables terminal/superseded cards and explicitly labels resume. |
| Replay can advance a partial plan | Every apply carries expected_step. A replay of a lost step response is rejected instead of executing the next step. Terminal, attention and cancellation revoke tokens. |
| Pre-injection failures reported uncertain | Injection is tracked at the browser API boundary. No injection means not_sent/failed, with injected:false evidence. Once injection may have started, missing browser response remains conservatively uncertain. Adapter-confirmed preflight refusals remain failed. |
| Reconnection destroys reports | Source invalidation/lock revoke approvals and skip remaining operations while retaining same-account read-only metadata reports. Limit: five active plans, 20 total reports/plans, 30-minute TTL. Worker restart/forget loses or purges them. |
| Groups only suggestions; many move confirmations | prepare_project_plan creates up to five exact destinations and moves up to 50 reviewed chats in one confirmed sequential plan. New destination IDs must come from independently verified creation steps. Errors stop dependent operations; no rollback or uncertain replay. |
| Broad reading too costly | Selection ceiling 50, default 10; overview mode returns up to two segments before deeper selected reads of up to six. Coverage stays explicit. Raw conversation JSON is not cached across calls, so long continuations still cost additional downloads. No throughput promise. |
| Setup is self-attested | Removed acknowledgement handler/button. Ready requires observed current catalog traffic and a successful tool call; timestamps are session-local and shown next to step 3. |
| Missing ChatGPT-side instructions | Added detailed English connection guide, offline bundled guide, authentication explanation and contextual feedback. Existing real setup screenshot is labelled historical; new host-form captures are still pending. |
| Node 22 mismatch | Portable zero-dependency runner uses the Node 22 experimental isolation flag or Node 24 stable flag. Minimum documented version is 22.22. CI matrix includes both. Only Node 24 is installed locally; Node 22 CI remains to be checked after push. |
| Undocumented schema drift | Added user-triggered read-only contract checks for recent chats, bounded text and owned projects. Safe report only, no raw data or retries. Automated tests remain synthetic; no real recorded fixtures have been fabricated. Sanitized recorded responses still require explicit capture/review. |
| Dense/mixed-language code | Reformatted extension modules, split long model instructions/descriptions and moved UI translation calls to stable IDs. Model-facing messages are English. English/Italian browser/component catalogs remain. Public manual scenarios and documentation are English. |
| Workspace identity hypothesis | Available explicit session/JWT account ID now participates in fingerprinting; ambiguous/multiple/non-personal claims are refused. Missing workspace metadata cannot prove isolation. Personal-only scope remains; authenticated workspace-switch testing is pending. |
| Remote caller trust | README, security/privacy notices and setup explicitly warn that anyone able to invoke the workspace app/tunnel can target the paired history. No multiuser authentication claim or silently added OAuth server. |
| Source deletion leaves copies elsewhere | README, privacy notice and read results disclose that command-chat history may retain copies after source deletion. |
| Android and PoC branding | Android compatibility is no longer declared. Display/server name is Chat Commander; the signed add-on ID intentionally stays unchanged to preserve updates and installed state. |
| Background load | Unrelated completed-tab events no longer recheck an already-bound source. Tunnel mutation processing stays serial; queued host calls may still expire. |

## Verification boundary

141 automated tests pass locally on Node 24.22.0, including the stale-card and pre-injection regressions, report isolation/reconnection, exact-step replay, all-write previews, project dependencies/failure stops, read-only drift checks and catalog/tool observation. Build/package and documentation-link checks are separate release checks.

No authenticated 0.13 browser run, live 50-chat benchmark, second-account/workspace exercise, fresh ChatGPT setup screenshots, web-ext lint or recorded-response fixture capture has been claimed. The earlier 0.12.x browser evidence does not certify these changed flows. The 20 English manual scenarios are a protocol; they are not an unattended LLM evaluation runner. Installing the new build and refreshing tools is the next validation step before Mozilla upload or a Show HN launch.

Retained report access revalidates the live session identity; if the session cannot be verified, reconnect the same account before reading the report.

## Follow-up: 50-chat catalog regression — 0.13.1

The owner’s broad-review output used only 20 results and could not call prepare_project_plan. Current local MCP metadata already exposes that tool and a 50-chat maximum, so stale/disabled client metadata is the leading explanation, not a verified host diagnosis. The update adds runtime/catalog facts to all tool responses, preflight/refresh instructions and a 50-chat default. One extra private candidate fills the source-chat exclusion; requested/selected/scanned counts remain explicit. Six tests added: 147 total pass locally. Do not describe Refresh tools or new-conversation behavior as fixed until the host is checked.

## Follow-up: project-plan arguments — 0.13.2

A live three-project/twelve-move proposal failed with generic -32602 after successful selection of 50 chats. The exact request is not available yet. One reproduced mismatch is that null was rejected for a new-project destination while omission was accepted. Both forms are now explicitly supported, without weakening existing-destination or confirmation checks. Invalid inputs report bounded field/rule diagnostics without argument values. A synthetic three-project/twelve-move preparation succeeds with zero writes; 152 automated tests pass. Do not claim the original live failure’s root cause confirmed until its submitted structure is checked.
