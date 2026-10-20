# 006 — Consolidate the extension before public source release

Date: 20 October 2026. Status: implemented locally in 0.9.0; authenticated browser regression pending.

## Context

Sequential feasibility experiments left synthetic production results, arm-and-click probes, duplicated page session/JSON handling, feature-aware protocol code and chronological setup instructions. This increased the number of paths a new contributor had to understand and obscured current behavior.

## Decision

Expose only real tools. Remove the synthetic mode and diagnostic probes after migrating real-operation tests onto the shared page adapter. Keep one user-driven pairing path with optional same-account reconnect. Derive presentation phases from existing facts rather than persisting extra status flags.

Centralize MAIN-world authentication, response limits and timeout helpers inside `chatgpt-page.mjs`. Keep operation-specific validation and unknown-write handling intact. Separate protocol/envelopes, transport utilities, tool catalog, server instructions and UI resources. Retain the existing bounded review engine and approval flow.

Use plain ES modules and browser APIs, with no runtime library or bundler. Preserve the original two PNGs; commit resized extension icons and use the logo in the README. Normal packaging uses only Python's standard library, recreates its generated directory, and copies current files recursively. Pillow is optional for artwork regeneration, not installation or ordinary packaging.

Current public-facing documentation is English for GitHub/Hacker News/Reddit readers; historical Italian research remains explicitly archived. Do not replace evidence with marketing claims: private tunnel prerequisites, undocumented endpoints and pending browser checks must be visible near the top-level explanation.

## Consequences

Fewer production execution modes and a single auditable page authentication boundary. Self-contained page serialization keeps operation branches together; it is a deliberate platform constraint rather than a generic API client abstraction. Removing old probes reduces test count without removing real-operation regression coverage. Setup/storage formats remain compatible; obsolete probe state is cleared on worker startup. No new tools or resource URI require a catalog refresh solely for this refactor.

Public source distribution does not solve public ChatGPT plugin listing, multiuser authorization, browser signing or account-side provisioning. Those remain separate decisions. The author subsequently selected the MIT license; see ../../LICENSE.
