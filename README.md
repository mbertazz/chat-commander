# Chat Commander

Your chat history is full of side quests. Let the LLM build the quest log.

Ask ChatGPT to find related chats, read them, and figure out what belongs together. Your hiking itinerary and gear debates become one trip plan, with a proposed project to hold them.

Chat Commander supplies the MCP tools. The handler runs in Firefox, receives requests through your private OpenAI tunnel, and uses a selected, signed-in ChatGPT tab to read chats and execute confirmed operations. You inspect the exact card and click before any writes.

**LLM: reasoning. Firefox: plumbing. You: commit permission.**

**Experimental · 0.13.6 · Firefox desktop 140+ · MIT**

```text
ChatGPT ↔ OpenAI Secure MCP Tunnel ↔ Firefox worker ↔ selected ChatGPT tab
```

No daemon, developer-hosted backend or runtime npm dependencies. Uses undocumented ChatGPT endpoints.

## Tools

- Discover recent chats; search titles and messages with pagination.
- Read active-branch text in bounded pages. Attachments are not interpreted.
- Review up to 50 recent chats; prepare rename/archive plans.
- Prepare project creation and chat moves: up to 5 projects and 50 moves per plan.
- Rename, archive, restore or permanently delete a single chat.

Every write requires the exact in-chat confirmation card. The source conversation is excluded. Stale approvals, conflicts and uncertain outcomes stop execution. No automatic mutation retries, transaction or rollback.

[Try the demo prompt](docs/demo-prompt.md).

## Run

Requires your own private OpenAI Secure MCP Tunnel, a dedicated runtime key, a custom ChatGPT app connection and a signed-in personal ChatGPT tab. Installation does not provision these. Keep the tunnel private: there is no multiuser caller authorization.

```sh
python3 scripts/build_firefox.py
```

Load `dist/firefox/manifest.json` temporarily in `about:debugging#/runtime/this-firefox`. Open extension settings:

1. Save or unlock the tunnel key.
2. Select/connect the personal ChatGPT tab, check its title and continue.
3. Configure the ChatGPT app, refresh tools and run a read-only request.

Keep Firefox and the connected tab open. After an update, refresh ChatGPT tools too. [Setup and recovery](docs/connection-setup.md).

Version 0.13.6 was submitted to Mozilla on 21 October 2026; approval, signing and public availability have not been confirmed. Local packages are unsigned. Stable Firefox installation requires a Mozilla-signed XPI. Temporary loads disappear on browser exit.

## Build

Node.js 22.22+ for tests. Python 3 standard library for packaging.

```sh
npm test
python3 scripts/package_firefox.py
```

Produces deterministic install/source ZIPs and SHA-256 files under `dist/`. No `npm install` required. The source ZIP rebuilds the install ZIP byte for byte.

## Trust boundaries

- Session tokens stay in the selected ChatGPT page. Requested text, titles, project metadata and results pass through OpenAI.
- No analytics or persistent conversation database. The optional saved tunnel key is password-encrypted locally; the password is not stored.
- Text read into a command conversation can remain there after source deletion.
- Reviews are volatile. Prepared review/project cards have a 30-minute confirmation window; extension reload or worker restart can lose them earlier.
- Moving chats changes their project context. Deletion has no extension undo; inaccessible does not mean physically erased from OpenAI systems.

[Privacy](extension/privacy.html) · [Security](SECURITY.md) · [Architecture](docs/architecture.md)

## Validation

161 local tests. Owner-reported Firefox test on 0.13.6: create one project, move two fully read demo chats, verify all three operations. A 50-chat review produced a three-project/twelve-move proposal; that larger plan was not applied.

Second-account browser checks, prolonged lifecycle, Android and Chromium remain unverified. Tests and signing are not an independent security audit. [Evidence and open checks](docs/status.md).

Not affiliated with OpenAI or Mozilla. Support: sbaginov@yahoo.it. Report error codes and sanitized metadata; no credentials, HARs or private chats.
