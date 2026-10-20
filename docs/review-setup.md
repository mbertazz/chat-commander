# Manual verification

For repeatable copy/paste conversations, synthetic fixtures and expected outcomes, use the [20-scenario conversational suite (Italian)](conversational-tests.md). The JSON specification is prepared for future automation; a live runner is not implemented.

Use disposable chats and test data. When guiding a user interactively, give **one manual step at a time and wait for its result**. Never ask for credentials or private contents in chat.

## Regression after 0.10.0

Load/reload the generated Firefox extension and verify version 0.10.0 in settings. Follow [setup](connection-setup.md) or unlock an existing vault. First ask Chat Commander in ChatGPT to list five real recent chats; compare the result locally. Then verify search, paginated reading, and a requested rename/archive/restore on a disposable chat. No synthetic fallback should exist.

Verify save → lock → unlock with the password alone, and same-account reconnection after a tab reload. Explicitly inspect a different-account case and permission removal. A full browser restart needs a stable signed installation; a temporary add-on must be loaded again. Do not call an unperformed browser check “passed.”

## Guided review

1. Ask: “Review my latest five chats, excluding the chat open in the connected source tab. Read them and suggest clearer titles, any justified archives and related groups. Do not apply changes yet.”
2. Expect `begin_review`, `read_review_chat` and `prepare_review`. The excluded current chat must be identified by ID. Partial/failed reads and unread attachments must be disclosed. No writes during proposal.
3. Inspect the in-chat card. Ask an exception such as “Only change the titles; do not archive anything.” A new exact proposal must replace the old approval.
4. Only if the displayed changes match your intention, click **Confermo e applico queste modifiche** in the new card.
5. Check `get_review` and the metadata of modified chats. Excluded chats stay unchanged. Suggested groups create no project and move no chats.
6. In a separate review cancel before applying; verify zero writes.

If the component does not load or cannot confirm, do not ask the model to bypass it with individual mutations. Report the displayed diagnostic only. After a conflict or uncertain outcome inspect `get_review`/`get_chat` before any further write. A completed earlier step may remain applied; there is no rollback.

## Projects, moves and deletion — controlled test

Refresh tools in ChatGPT after loading 0.10.0. Start with `list_projects` and `get_project` to verify schema, sharing and permissions without writes. Unknown sharing remains unknown and blocks moves; do not infer private status or bypass the check.

Ask to create a uniquely named disposable project. Expect a card with the exact project name and no immediate creation. Confirm it only if desired; check `get_review` for the created project ID and compare the native sidebar. If creation is uncertain, inspect list/native UI before making any new request with the same name. No automatic fallback to another endpoint is implemented.

Choose a disposable chat outside the source tab. Ask to move it to the new project. Inspect chat title/link, source and exact destination in the card. Confirm and verify the native project and operation_result.project_id through the report. A separate null destination removes a chat from its project, with its own preview/confirmation. Custom GPT chats and shared/unverifiable project contexts are refused.

For deletion use only a disposable chat explicitly selected by the user. Ask to delete it, check the exact title/link and the irreversible warning, then click the dedicated red confirmation button only if intended. No deletion before that click. The result verifies inaccessibility, not physical data purging; verify the native UI too. No restoration or project deletion is offered. Finally cancel a different pending proposal and check zero changes.

Give these as separate steps, waiting for each result. Do not ask for HAR files, credentials, real chat contents or screenshots containing secrets. If a candidate endpoint or schema fails, report only method/path/status and redacted field names; resolve the contract before expanding functionality claims.
