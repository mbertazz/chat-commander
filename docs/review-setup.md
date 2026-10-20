# Manual verification — 0.13.0

Use disposable data, never real credentials or private transcripts in reports. When guiding a user, give one browser step at a time and wait for the result. These checks are a manual protocol, not claims that they have passed.

## Installation and setup

Load the generated Firefox build and follow [connection setup](connection-setup.md). After updating to 0.13.0, refresh tools. Check catalog/time feedback, then invoke list_chats and verify successful-call feedback. No acknowledgement button should exist. Save → lock → unlock → same-account reconnect must work; a full restart loses volatile reports and requires unlocking. Test permission removal, an unrelated tab loading, and a different personal account without authorizing any mutation in that account. Business/ambiguous workspace sessions are unsupported.

## Confirmation for every write

For each of rename, archive and restore, prepare one disposable change. The native state must stay unchanged until **Confirm and apply these changes**. Cancel a separate preview and verify zero writes. Try an adversarial instruction in a disposable source chat: reading it must not authorize a write. Review exact titles, links and archive/restore direction yourself; confirmation is not immunity from misleading proposals.

## Stale cards and reports

Prepare two renames, confirm, then interrupt the card after one completed operation. Reload the command conversation. The card must fetch get_review, display the applied count and offer **Resume remaining operations** only for pending steps. It must not say nothing was applied. Resume explicitly; replay of the old expected_step must not execute the next step. Completed/attention/cancelled/superseded cards stay disabled.

Reconnect the source tab after a completed or uncertain operation. Unlock if needed, reconnect the same personal account and ask get_review: metadata evidence must remain available within its 30-minute TTL/capacity limit. Another account must not read the report. Disconnect/forget purges it; worker restart loses it. No blind retries.

## Project batch

Start small: three disposable chats supporting two outcomes. Ask ChatGPT to find/read them without manual links, explain the shared outcomes and call prepare_project_plan. Inspect one card containing exact project creations followed by moves with source/destination names. No writes before confirmation. Confirm only if desired, then check each step and created ID with get_review plus native ChatGPT. A failed/uncertain creation must skip all dependent moves; no rollback or automatic replay.

Only after this works, try a larger recent-history review using overview pages and deeper candidate reads. The 50-chat selection ceiling is not a throughput guarantee. Report partial coverage and stop on rate limits. Group suggestions alone do not move chats.

## Deletion and contracts

Deletion is optional and requires a separately selected disposable chat and explicit irreversible confirmation. Verify acknowledged write plus inaccessibility; never claim physical erasure. No bulk deletion.

Run settings’ read-contract check. Report check names/codes only. Sanitized real response fixtures and authenticated host captures remain separate evidence; do not fabricate them from mocks or publish HAR.
