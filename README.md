<p align="center"><img src="chat-commander-logo.png" alt="Chat Commander" width="600"></p>

Organize your ChatGPT conversations by talking to ChatGPT.

> “Find my recent chats about the Dolomites. Read them, connect the itinerary and gear decisions, and propose clearer titles and project groupings. Show your reasoning before changing anything.”

ChatGPT does the reasoning across conversation contents. Chat Commander supplies tools to discover and read chats, prepare an exact proposal, and carry out confirmed operations. You do not need to collect conversation links when discovery succeeds.

**Experimental · 0.13.6 (development) · Firefox desktop 140+ · MIT.** Requires your own private OpenAI Secure MCP Tunnel, a dedicated runtime key, a custom ChatGPT app connection and an authenticated personal ChatGPT tab. Installation does not provide access to these services. Not affiliated with OpenAI or Mozilla.

## See the workflow

The demo found three conversations among the ten most recent chats, read their active-branch text, connected hiking itinerary choices to gear and spending, and kept interview preparation separate. No manual conversation links were needed and no changes were applied.

<details><summary>Discovery and content-grounded reasoning</summary>
<img src="docs/images/demo-discovery-reasoning-en.png" alt="Related demo conversations grouped with reasons linking route, accommodation, weather and equipment choices" width="600">
</details>

<details><summary>Exact preview before confirmation</summary>
<img src="docs/images/demo-rename-preview-en.png" alt="Two proposed demo-chat renames, both pending, with zero changes applied" width="600">
</details>

<details><summary>Connection setup, one step at a time</summary>
<img src="docs/images/settings-guided-connected-en.png" alt="Three numbered steps for key preparation, ChatGPT tab connection and app verification" width="660">
</details>

These are actual disposable-data browser captures from 0.12.x, not mockups. The 0.13 setup replaces manual acknowledgement with observed catalog/tool-call feedback; refreshed captures are pending. A prepared proposal does not authorize execution. The host's developer-mode badge in the confirmation capture is not an extension setting; the extension does not relax page security headers or its declared CSP.

## What it does

- List recent non-archived chats and search titles/messages with pagination.
- Read bounded active-branch text and continue through long conversations.
- Rename, archive and restore individual chats using current-state checks.
- Review 50 recent eligible chats by default, triage bounded excerpts, deepen selected candidates and prepare evidence-based title/archive suggestions and optional groups.
- List projects; prepare empty project creation, individual moves and permanent single-chat deletion.
- Turn reviewed groups into one confirmed plan: create up to five projects and move up to 50 chats, sequentially.
- Require exact in-chat confirmation for every write, including individual renames and archives. Stop on conflicts or uncertain results; never automatically retry mutations.

Groups remain suggestions until `prepare_project_plan` turns them into an exact creation/move preview. Project deletion, bulk deletion, project instruction/file editing and rollback are not supported. A conversation open in the connected source tab is protected from review and all changes. Permanent deletion has no extension undo.

## How it works

```mermaid
flowchart LR
    C[ChatGPT conversation] <--> O[OpenAI Secure MCP Tunnel]
    E[Extension: MCP handler and tunnel client] -->|outbound HTTPS| O
    E <-->|selected authenticated tab| P[ChatGPT page adapter]
    P <-->|same-origin requests| A[Internal ChatGPT API]
```

The extension runs its tool handler and outbound tunnel client in the browser. No separately installed daemon, developer-operated backend or conversation database. The desktop browser must remain running.

The ChatGPT session token stays inside the page. Requested chat titles, links, text excerpts, project metadata and operation results travel through OpenAI so ChatGPT can respond. **Local execution does not mean no data transmission.** There is no analytics or persistent conversation cache. Optional password encryption stores the tunnel runtime key on this device; the password is not saved. See [privacy](extension/privacy.html) and [security](SECURITY.md).

Text read from another chat is copied into the command conversation. Deleting the source chat does not delete those copies from command-chat history.

The tunnel must stay private to its owner. Any member of a workspace where the app/tunnel is enabled may be able to invoke its tools against the paired history; do not share this connection. The extension does not authenticate distinct users sharing a tunnel and is not intended as a multiuser service.

## Install and connect

Version 0.13.6 is a local development release and has not been uploaded to Mozilla. The public Mozilla submission for 0.12.2 was sent; a live public listing has not yet been confirmed. Earlier versions were signed for self-distribution. Use a Mozilla-signed XPI for a stable Firefox installation. Local ZIP builds are unsigned and do not bypass signing requirements.

For development:

```sh
python3 scripts/build_firefox.py
```

Temporarily load `dist/firefox/manifest.json` in `about:debugging#/runtime/this-firefox`. Firefox removes temporary installations on full browser exit.

Open settings and follow three numbered steps: prepare/unlock the key, explicitly connect your personal ChatGPT tab, then configure/refresh the ChatGPT app and try a read-only request. Settings and the confirmation component support English and Italian, with English fallback. [Detailed setup](docs/connection-setup.md) and [50-chat demo prompt](docs/demo-prompt.md), including the ChatGPT-side connection and expected feedback.

## Development

Node.js 22.22+ for tests; Python 3 standard library for packaging. No npm install or runtime library dependency is required.

```sh
npm test
python3 scripts/package_firefox.py
```

Packaging produces a deterministic unsigned Firefox ZIP, a reproducible source ZIP and SHA-256 files in `dist/`. Checked-in icons are release inputs. Regenerating them from the original owner-supplied PNG requires Pillow; ordinary packaging does not. CI runs the tests and build; hosted CI results must be checked after pushing.

## Evidence and limits

The automated suite covers exact-step replay protection, card rehydration, all-write confirmation, report recovery and project batches. See [current evidence](docs/status.md) for results and unperformed browser checks. The author verified listing/search/read, reversible chat actions, project creation/moves, an independently verified disposable deletion, encrypted-key restart/unlock, permission revocation/recovery, guided settings and English confirmation previews in desktop Firefox. [Current evidence](docs/status.md).

Earlier intermittent discovery and deletion failures remain unexplained. A successful later run does not establish a root-cause fix. Recent keyword search can miss relevant conversations; listing recent candidates and reading them is an alternative, not a guarantee of exhaustive discovery. Undocumented ChatGPT endpoints may change. Non-text attachments are not interpreted. Inaccessibility after deletion does not certify physical erasure from OpenAI systems.

Android is not declared compatible on AMO; Chromium functionality, exhaustive search coverage and prolonged lifecycle behavior are unverified. A real second-account browser test was skipped; automatic identity-refusal tests pass. Automated tests and Mozilla signing are not an independent security audit. This private-tunnel architecture does not supply a public OpenAI plugin-directory endpoint.

[Architecture](docs/architecture.md) · [Manual review checks](docs/review-setup.md) · [Review response](docs/review-resolution.md)

Support: sbaginov@yahoo.it. Do not include credentials, cookies, HAR files or private conversations in reports. Licensed under the [MIT License](LICENSE).
