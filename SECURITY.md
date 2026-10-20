# Security and privacy

Chat Commander is an experimental personal-use integration, not an independently audited security product. Review the code before entering credentials. Browser-level permission to read/change `chatgpt.com` data is powerful even though the implementation narrows its actual operations.

## Trust boundary

Use only your own private tunnel, personal ChatGPT workspace and browser profile. Anyone authorized to invoke that tunnel may invoke its exposed tools against the paired history. The extension does **not** add end-user MCP authentication, OAuth, multiuser isolation, or proof that the remote caller owns the paired ChatGPT account. Sharing the tunnel/app with other people is outside the supported model.

When exposed in the session, an explicit account ID participates in the binding fingerprint. Multiple-account and non-personal plan claims are refused. Absence of account/workspace metadata is not proof of workspace isolation; only a personal account/profile is supported, and a real workspace-switch browser check remains required.

The page is trusted for session access and API execution. MAIN-world JavaScript shares the ChatGPT page environment; a compromised page, extension, browser or operating system is outside the protection provided here. An isolated document marker prevents accidental reuse of a binding after navigation, but does not make a compromised page trustworthy.

## Where data lives

| Data | Location and lifetime |
|---|---|
| ChatGPT session token | Page execution only; used for fixed same-origin backend requests. Never returned to extension storage or the MCP result. |
| Unlocked tunnel runtime key | Trusted extension `storage.session`; sent as a bearer header only to fixed `api.openai.com` tunnel URLs. Removed on lock, forget and fatal transport stop. |
| Optional saved runtime key | Local, non-sync browser storage, encrypted using AES-256-GCM and PBKDF2-SHA256 with 600,000 iterations, random salt and IV. Tunnel ID is authenticated associated data. |
| Vault password | Submitted locally for derivation; not persisted. Long, unique passwords matter because stolen ciphertext permits offline password guessing. |
| Trusted account fingerprint | SHA-256 of the user ID and available explicit account ID, stored locally for same-account reconnection. This is pseudonymous account data, not an anonymity guarantee. |
| Binding | Tab/document identity and account fingerprint in session storage. |
| Conversation text and search excerpts | Temporary page/worker memory and requested MCP responses to OpenAI/ChatGPT. No content database, persistent cache, analytics or logs. |
| Review plans | Metadata and proposed changes in worker memory only; at most five active reviews plus up to 20 total plans/reports, 30-minute expiry. No retained full conversation text. |

OpenAI receives requested tool results so ChatGPT can answer. Text read from source chats may remain in the command conversation after those source chats are deleted; source deletion does not erase these copies. “No third-party backend” does not mean “data never leaves the browser.” This extension makes no claim about OpenAI’s separate retention policies, browser internals, OS swap, or reliable erasure of immutable JavaScript strings. Local browser storage is not an OS keychain; the encrypted vault protects an at-rest copy, not an unlocked compromised session.

## Reads and changes

Requests use fixed origins, reject redirects, have timeouts and bounded streamed JSON. Reads verify account identity before and after access and validate the document binding. Titles, excerpts and message text are untrusted data. Internal messages are omitted; attachments are not interpreted.

Every write is prepared first and requires the exact current proposal revision’s private capability, a specific expected step, and an explicit click in the in-chat component. Model-facing rename/archive/restore/project/move/delete tools never write. Confirmation reduces the impact of prompt injection; it does not make malicious chat content trustworthy or prevent a user from approving a bad proposal. All read content remains untrusted.

Cards query `get_review` before enabling confirmation; old revisions cannot authorize replacement plans. Replayed step numbers cannot execute the next step. Partial plans show explicit resume; completion, cancellation and attention revoke approval. Natural-language exceptions require an actual replacement proposal, not just a chat reply. Single-chat deletion has a dedicated irreversible-action button; bulk/project deletion is not exposed.

Moves require owned, explicitly private projects and verified write permissions. Missing sharing or project-association fields block the operation rather than being assumed safe. Creation checks for existing names across at most five pages of 20 owned projects; an incomplete scan blocks creation/moves. A chat open in the connected source tab is protected from all writes.

Delete verification requires an acknowledged PATCH followed by a same-account observation that the chat is no longer accessible or is explicitly invisible. A 404 alone, without the acknowledged write and identity checks, is insufficient. This is not evidence of physical purging from OpenAI systems.

Conflicts and uncertain writes stop a review. Already completed changes remain applied. Check `get_review`/`get_chat` before deciding what to do next; there is no automatic rollback or blind mutation retry.

## Credentials and permissions

Use a dedicated runtime key with the least tunnel permissions available for your account, not an Admin key. Tunnel creation and workspace association happen separately through OpenAI. OpenAI’s [Secure MCP Tunnel guide](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels) describes the required roles.

Only `storage`, `alarms` and `api.openai.com` host access are required at installation. ChatGPT host access, `activeTab` and `scripting` are requested during user-driven pairing. There is no cookies, native messaging, browsing history, broad host or permanent content-script permission.

**Lock** stops the tunnel, removes unlocked credentials/binding and revokes pending approvals while keeping the encrypted vault. Existing metadata reports remain only in worker memory until expiry/capacity eviction; after unlocking and reconnecting the same account they can be read, never resumed through the old binding. **Disconnect and forget** also purges reports, vault, trusted fingerprint and reconnect preference. Tunnel ID may remain as a non-secret setting. Removing a key locally does not revoke it at OpenAI; revoke it there if it is exposed. Removing a temporary extension is not a substitute for explicitly forgetting its stored credentials.

Do not attach HAR files, API keys, cookies, session tokens, vault ciphertext, approval capabilities or private chat contents to public issues. Report reproducible behavior using test data and the extension’s bounded diagnostic codes. If a private reporting channel is not yet configured, withhold exploit details and request one without including sensitive material.

## Firefox disclosure

The Firefox 140+ package declares authentication information, personal communications and website content transmission through built-in consent. Requested data is sent to OpenAI. The bundled [privacy notice](extension/privacy.html) is linked from settings. For security reports, contact sbaginov@yahoo.it without including credentials or private chat contents.

Retained report access revalidates the live session identity; if the session cannot be verified, reconnect the same account before reading the report.
