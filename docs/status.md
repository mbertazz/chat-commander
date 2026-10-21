# Validation — 0.13.6

Updated 21 October 2026. Owner-reported Mozilla submission on 21 October 2026; approval, signing and public availability remain unconfirmed.

## Automated

- 161 tests pass locally on Node 24.22.0. Coverage includes serialized page adapters with synthetic HTTP responses, MCP/tunnel dispatch, private exact-step approvals, stale cards, report recovery, encrypted-key lifecycle, bounded read diagnostics and project-plan dependencies.
- Current and compatibility resource URIs (`review-v8`, `review-v7`) return the current guarded component. Unknown URIs remain rejected. Resource observation failures cannot block HTML responses.
- Python standard-library packaging produces deterministic install/source ZIPs and SHA-256 files. A clean extraction of the source ZIP reproduces the install ZIP byte for byte. No runtime npm dependencies.
- CI targets Node 22.22 and 24. The owner reported both jobs green for release commit45d49f7 (0.13.6); this is owner-provided CI evidence, not an API inspection. Node 22 is unavailable locally. Local `web-ext lint` has not been run.

## Owner-reported Firefox evidence

On 0.13.6 the owner supplied a screenshot of the current component version, expiry countdown, grouped destination, three pending operations and active confirmation button. After clicking confirmation, Chat Commander reported:

- Created the previously absent Dolomites demo project.
- Moved the two fully read itinerary/gear conversations into it.
- Review completed; 3 applied and verified, no conflicts, unknown outcomes or failures.

This validates one create-project/two-move batch through the authenticated browser and exact-card confirmation. No independent native project-view capture was provided. It does not validate a 50-chat write batch.

Other owner checks during 0.13 development:

- Runtime/catalog versions and callable `prepare_project_plan` verified after Refresh tools.
- 50 eligible chats selected from 51 scanned; the command/source conversation excluded. A sequential review reported 19 complete text reads and 31 partial reads, then prepared 3 projects/12 moves without applying them. Attachments were disclosed as unsupported.
- Grouped confirmation layout verified by screenshots. The current card shows one reason per destination and individual operation/read states.
- Unlock/tab-check flow and observed successful tool-call feedback verified. Resource-request diagnostics report prepared responses, not proof of host delivery/rendering.
- Previously failing conversation read successfully in a targeted test; original failure cause remains unknown.

Earlier 0.12 owner checks covered recent listing/search/read, rename/archive/restore, project moves, one independently verified disposable deletion, signed installation, vault restart/unlock and permission recovery. These are historical evidence, not all repeated against 0.13.6.

## Resolved local defects

- Reading failures returned `isError:false`, told callers to continue, and lost useful codes. They now signal MCP errors, request a stop and retain bounded safe diagnostics.
- A local `messages` variable shadowed the error catalog and raised a ReferenceError on failed reads. Regression tests cover the error path through the page and extension boundary.
- Old review cards hid expiry and conflated elapsed lifetime with missing volatile state. Cards now expose deadlines; newly prepared review/project proposals get a fresh 30-minute window. Known expiry, missing memory and failed checks are distinct where evidence permits.
- Network evidence showed ChatGPT requesting `review-v7` and receiving HTTP404, HTML asset not found, while the server only served v8. Both URIs are now registered; fresh 0.13.6 component loading is owner-verified. Old host-cached HTML can still differ from the running server; component and server versions are separate evidence.

## Open checks and limits

- Applying the full 50-chat organization plan, second-account/workspace browser checks and prolonged lifecycle remain unverified. Automatic identity-refusal tests are not substitutes for those browser tests.
- Earlier intermittent discovery/deletion failures and the original project-plan INVALID_ARGUMENT were not root-caused. Its `project_id` fields were omitted; explicit null was not its cause. Later successful proposals are not proof of the original fix.
- Project listings alone do not prove suitability of existing project contents. Search/project coverage is not certified exhaustive; non-text attachments are not interpreted.
- Recorded sanitized real-response fixtures, refreshed public gallery captures, keyboard/screen-reader coverage and local web-ext lint remain outstanding.
- Android compatibility is not declared; Chromium is unsupported by current browser evidence. No independent security audit or physical-erasure claim is made.

## Publication

The owner reported submitting 0.12.2 to Mozilla's public channel; its live approval/listing status has not been rechecked. The owner reported submitting 0.13.6 on 21 October 2026 after AMO validation showed 0 errors and 1 warning; the visible warning was the submission checklist. Main and tag v0.13.6 were independently verified on GitHub at commit45d49f7. Both CI jobs were owner-reported green. GitHub hosted Release/assets are not created; Mozilla approval/signing/public availability remain unverified.

[Setup](connection-setup.md) · [Architecture](architecture.md) · [Manual checks](review-setup.md) · [Review response](review-resolution.md)
