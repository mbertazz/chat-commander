# Validation status — 0.12.2

Updated 20 October 2026. Experimental, personal-use software; claims below reflect observed checks rather than universal account compatibility.

## Local checks

125 tests pass using synthetic browser APIs, in-page VM execution and in-process tool/tunnel flows. Coverage includes identity/document checks, bounded reads, schema validation, pagination, exact confirmation capability/trusted click, duplicate/stale preview protection, no mutation retry, encrypted vault and permission lifecycle, setup progression, English/Italian component localization, filtered diagnostics and package contents/version consistency.

The source ZIP reproduces the unsigned Firefox ZIP byte for byte. Runtime code has no third-party library or downloaded executable code. Hosted GitHub CI has not yet been verified. Standalone web-ext lint was not run locally; the author supplied Mozilla online validation evidence for signed versions (including 0.12.1) of zero errors and zero warnings.

## Observed in desktop Firefox

- Listing recent chats, keyword search and continued text reads; individual rename/archive/restore and conflict rejection.
- Disposable project creation and moving a disposable chat into/out of a project.
- One deletion reported completed/applied with positive acknowledgement and independent same-account inaccessibility verification; no claim of physical purging.
- Signed installation survives full browser restart, requires password unlock for the encrypted key and reconnects when the authenticated paired-account tab is available.
- Revoking ChatGPT host permission blocks fresh reads; explicit grant/pairing restores access.
- English/Italian settings, local privacy notice, wrong-password refusal, guided steps and retained source-tab selection.
- Demo discovery among recent chats without manually supplied URLs, full reads and content-grounded recommendations. Separate English preview shows two pending renames, zero applied.

0.12.2 is a version-only increment from tested 0.12.1 for the public Mozilla channel. The user reports submitting it; public listing/review outcome has not been confirmed.

## Remaining limitations

Earlier intermittent discovery/deletion failures remain unexplained; successful later tests are not root-cause fixes. Unknown writes must not be retried automatically. Search/project/archive coverage is not exhaustive. Non-text attachment interpretation, physical data erasure, Android/Chromium functionality, extended unattended lifecycle and independent security review are not established. A real second-account browser test was explicitly skipped because no second account was available; synthetic identity-refusal tests pass. Keyboard/screen-reader coverage remains incomplete.

The private tunnel is an owner access boundary, not separate caller authentication or a public OpenAI plugin endpoint. Reviewers may require authorized service access for full functional testing; prerequisites and reproduction instructions accompany the Mozilla submission.
