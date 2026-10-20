# 008 — Guided setup and evidence for recent-chat discovery

Date: 20 October 2026. Version: 0.12.0 local candidate; 0.11.2 remains the signed installation.

## Problem and authorization

The user found manual URL collection incompatible with the product's core value: delegate discovery and reasoning to the LLM. During a three-chat demo, list_chats returned source_read_failed; keyword search returned older unrelated conversations. Direct reads using supplied links worked, but this is a fallback, not a satisfactory demo. Exact cause of the failed list is unknown. A subsequent authorized agent read-only list request returned ten chats, so do not claim the failure is constant or repaired.

The user also explicitly reauthorized the previously deferred setup redesign: numbered, discursive, one action followed by the next, with an explanation of purpose and feedback adjacent to the action. Old onboarding deferment is superseded by this instruction.

## Decision: derive steps from connection facts

Three numbered expandable steps replace the scattered form sections:

1. Prepare or unlock the tunnel runtime key. Explain prerequisites and local password purpose. Save requests OpenAI access only, then advances to tab connection; it does not implicitly pair a new tab.
2. Open an authenticated personal ChatGPT tab, select it and explicitly connect. Explain requested browser permission and protected-source behavior. Show pending/permission/error/bound feedback next to the button. Refresh available tabs when options regain focus. Preserve same-account automatic reconnection after unlock, without silently trusting a new account.
3. Connect/refresh the ChatGPT app and run an English read-only sample prompt inside ChatGPT. Explain that tool results appear in the conversation. Acknowledging app configuration is not presented as an actual tool verification.

The first incomplete step opens automatically on a real state transition; completed steps collapse and remain editable. Ordinary refresh must not reset an already opened step. Controls for later operations are disabled until prerequisites hold. Key and tab state are derived, not persisted as a second wizard state. Lock/forget remain separate management controls with contextual error output. Reset stale pairing instructions when a source is actually bound. Keep input clearing, encrypted vault, private capabilities and no mutation retry unchanged. English and Italian copy share native browser catalogs and English fallback.

## Decision: preserve specific read failures

The page previously returned list_failed/list_read_failed/session_read_failed and other codes not recognized at the extension boundary; callers could see only source_read_failed. Recognize these codes and distinguish list/search HTTP 429 and 401/403. Carry only allowlisted phase, HTTP status/null, failure category and bounded elapsed_ms through the source/RPC boundary. Never expose response bodies, URLs, query text, headers, credentials or raw exception messages as diagnostics. Identity errors still discard data. There is no new endpoint, cache, automatic request loop, relaxed schema or write behavior.

Guide the LLM to use recent listing as well as keyword search for recent topical discovery, then read candidates before recommendations. Search absence does not prove topic absence or index delay. Stop on rate limiting; direct links remain an honest fallback only when discovery is unavailable. Do not claim completeness or pretend to have read chats. Tool schemas remain unchanged; catalog/instructions bump to 0.12.0 requires Refresh tools, while review-v4 resource stays unchanged.

## Validation and limit

123 local tests pass, including key-save versus explicit-pair separation with browser-like structured-cloned messages, next-step transitions, revoked-source/invalid-key recovery, list HTTP/timeout/network errors through RPC, search rate limits, no retries, discarded raw fields and native translations. Existing account/identity, mutation confirmation, vault and packaging regressions remain.

Headless visual preview attempted with synthetic local state; Firefox/Snap refused startup because confinement is unavailable. No bypass or system changes were attempted. Real layout, keyboard and signed browser verification remain pending. The original intermittent recent-list failure has not been reproduced with its full cause and is not declared fixed. Existing signed screenshots depict 0.11.2 and need replacement after the guided UI is verified. No further live mutations or external upload occurred during implementation.
