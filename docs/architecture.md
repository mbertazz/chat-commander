# Architecture

Chat Commander puts a private MCP handler and its tunnel client in one extension. It opens no listening socket. No local process or hosted application server sits between the extension and OpenAI.

## Components

| Component | Responsibility |
|---|---|
| `worker.js` | Browser events, serialized connection changes, lock/unlock and worker lifetime |
| `connection.mjs` | Explicit tab pairing and optional reconnection to the previously trusted account |
| `connection-state.mjs` | Derive a single UI phase from actual connection facts; no duplicated persisted status flags |
| `tunnel.mjs`, `transport-utils.mjs` | Outbound polling, deadlines, cancellation, bounded response-delivery retries |
| `protocol.mjs` | JSON-RPC validation, MCP initialization and tunnel response envelopes; knows no chat tools or UI HTML |
| `server.mjs`, `tools.mjs` | Server instructions, tool catalog and argument-validator registry |
| `live-source.mjs` | Route validated tool calls; check binding/document identity and allowlist page results |
| `chatgpt-page.mjs` | Sole serialized MAIN-world adapter: session identity, bounded JSON, fixed endpoints, reads and writes |
| `actions.mjs`, `read-chat.mjs`, `projects.mjs` | Tool schemas, validators and filtered project/workspace results |
| `review.mjs` | Volatile review state, coverage, exact bulk/single-operation plans, approval capability and sequential execution |
| `resources.mjs`, `review-widget.mjs` | MCP UI resource and explicit in-chat confirmation component |
| `vault.mjs`, `config.mjs` | Encrypted optional credential persistence and configuration validation |
| `options.*`, `platform.mjs` | Minimal settings interface and browser API differences |

The page adapter is intentionally one self-contained function with shared helpers and operation-specific branches. `scripting.executeScript` serializes functions without their module imports or closures. This keeps session credentials in the page without introducing a build-time JavaScript bundler or a permanent content script. The worker validates arguments before injection and filters the returned result again.

## Communication boundaries

```mermaid
sequenceDiagram
    actor User
    participant ChatGPT
    participant OpenAI as OpenAI Tunnel
    participant Extension as Extension worker
    participant Page as Selected ChatGPT tab
    participant API as Internal ChatGPT API
    User->>ChatGPT: Show my five most recent chats
    Extension->>OpenAI: Authenticated outbound poll
    OpenAI-->>Extension: tools/call list_chats({limit: 5})
    Extension->>Extension: Validate RPC, arguments, deadline, binding
    Extension->>Page: Verify isolated document marker; inject fixed adapter
    Page->>API: GET session (same origin)
    Page->>Page: Hash user ID; compare trusted identity
    Page->>API: GET non-archived conversations, limit 5
    API-->>Page: Conversation metadata
    Page->>API: Recheck session identity
    Page-->>Extension: Allowlisted metadata, no session credentials
    Extension->>Extension: Recheck document/binding; filter result
    Extension->>OpenAI: Correlated MCP response
    OpenAI-->>ChatGPT: Tool result
    ChatGPT-->>User: Five conversations
```

| Boundary | Evidence and limitation |
|---|---|
| ChatGPT ↔ OpenAI tunnel | Documented private integration; real calls worked on the author’s account. Account access is a prerequisite, not guaranteed by the extension. |
| OpenAI ↔ extension | Authenticated HTTPS polling, no inbound listener. Protocol subset has local tests and earlier browser evidence, not complete conformance certification. |
| Extension ↔ selected tab | Optional `activeTab`/`scripting` plus optional `chatgpt.com` access for direct pairing/reconnect. Top frame, isolated per-document marker, optional native document ID. |
| Page ↔ ChatGPT API | Same-origin session access; token remains in page. Internal endpoints were observed experimentally, not a stable public contract. |
| Review component ↔ tools | Exact proposal revision plus private approval capability, actual user click, one operation at a time. End-to-end successful batch verification remains pending after the current-chat exclusion fix. |

## State and failure handling

UI phases are `unconfigured`, `locked`, `source_needed`, `connecting`, `app_setup`, `ready` and `attention`. “Ready” means a paired tab and successful polling with the app reminder acknowledged; it does not prove a successful ChatGPT tool invocation.

Tab reload can reconnect only to the trusted account when the user enabled it. Missing permissions or a different account never silently establish new trust. New pairing, lock, disconnect or source invalidation clears pending review approvals. Worker restart loses review plans; browser/extension restart requires unlocking saved credentials. Browser closure means no tool execution; alarms cannot run a closed browser.

Writes read current metadata, compare expected values, then PATCH only the intended field and read back the result. Conflicts stop execution. After PATCH may have started, failure is reported as uncertain and is never automatically retried. Delivery retries reuse the already-computed response; they do not rerun a tool. Multi-step reviews are not transactions and have no automatic rollback.

A personal tunnel is the access boundary. The extension does not authenticate individual MCP callers or support multiple tenants. Fingerprint checks bind the browser account, not the remote caller or every possible workspace. See [security](../SECURITY.md).

## Deliberate omissions

No synthetic production mode, permanent content script, arbitrary endpoint tool, scheduler, database, framework, npm runtime dependency or general workflow engine. Historic probes were removed after the real adapter gained equivalent security and behavior tests. The 0.10.0 catalog adds list_projects, get_project, create_project, move_chat and delete_chat; the confirmation resource is review-v3.html. Refresh tools after this update. The last three public tools prepare only; the existing apply_review_step capability gate performs the one approved write. The existing review engine owns both bulk review and single-operation previews, with one shared volatile capacity, expiry and cancellation policy.

[Validation status](status.md)

Project operations use fixed internal endpoint adapters in `chatgpt-page.mjs` and filtered results in `projects.mjs`. No additional permissions, dependencies or installed services are introduced.

0.11.0 localizes settings through native browser catalogs (en/it, English fallback), adds a bundled bilingual privacy notice, targets Firefox desktop 140+ built-in transmission consent, and packages a deterministic unsigned ZIP. Toolbar opening only opens settings; source pairing remains an explicit options action. See [validation status](status.md).
