# Changelog

## 0.13.3

- Keep setup at step 2 after unlocking or reopening settings, even after automatic reconnect. Show the tab selector and connected title in context; explicitly continue only with the connected selection. A saved binding whose tab is unavailable no longer claims a connection.
- Group project-plan confirmation rows by destination with one shared reason, preserving every creation/move, source, state and reading caveat. Execution order and approval checks are unchanged.
- Browser-host validation of the new layout remains pending.

## 0.13.2 — Development

- Accept explicit null or omitted project_id for new-project groups consistently in the schema and validator.
- Return bounded field-specific argument errors before execution, without echoing private values.
- Reject duplicate chat membership across project groups during validation.
- Add a three-project/twelve-move preview regression with zero writes.

## 0.13.1 — Development

- Default reviews to 50 eligible chats, privately overfetch one replacement for the protected source conversation and report exact selection counts.
- Return actual runtime/catalog versions, limits and advertised model tools in every tool result.
- Require catalog preflight before broad reviews and document Refresh tools → enable tools → new conversation.
- Record successful review/preview traffic consistently; observation-storage errors do not alter computed results.
- Tighten grouping guidance to require explicit shared outcomes, not generic references to tests or tools.

## 0.13.0 — Development

- Require an exact in-chat confirmation for individual renames, archives and restores as well as all other writes.
- Refresh remounted cards from live reports, show explicit partial resume, reject step replay and revoke terminal approval tokens.
- Keep bounded same-account read-only reports after source reconnection; distinguish pre-injection failures from uncertain writes.
- Add one confirmed project creation/move plan for reviewed groups and bounded overview reading for up to 50 recent candidates.
- Show observed ChatGPT catalog/tool traffic, add offline setup guidance and read-only schema checks.
- Use stable translation IDs, English model messages, readable modules and Node 22.22/24 test support; remove Android compatibility declaration.


## 0.12.2

Version-only increment from tested 0.12.1 for the public Mozilla submission. Existing extension ID, review-v5 resource and 0.12.1 catalog retained.

## 0.12.1

English/Italian confirmation card with English fallback from the ChatGPT host locale. Locale updates preserve exact-revision confirmation and duplicate-submission guards.

## 0.12.0

Three-step connection setup with explanatory copy and contextual feedback. Separate key save from new tab pairing. Preserve specific recent-list/search errors and bounded diagnostics. Guide recent discovery through listing and content reads instead of manual URL collection.

## Earlier 0.10–0.11 versions

Project discovery/creation, single-chat moves/deletion previews, immediate confirmation feedback, bounded uncertain-delete diagnostics, English/Italian settings, Firefox consent metadata and signed-install lifecycle verification. Earlier intermittent write failures are not claimed fixed.
