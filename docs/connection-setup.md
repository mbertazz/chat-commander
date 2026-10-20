# Setup

## Prerequisites

Use desktop Firefox 140+ and your own personal ChatGPT account. You need authorized OpenAI Secure MCP Tunnel access, a dedicated runtime key and a custom ChatGPT app connection. Installing Chat Commander does not provide those services or entitlements. Follow the [official tunnel guide](https://developers.openai.com/api/docs/guides/secure-mcp-tunnels) to create and associate a private tunnel with the intended organization/workspace. Never use an Admin key as a runtime key or share your production tunnel.

Credentials belong only in the extension settings, not in chat, command arguments, screenshots or Git.

## Installation

Use a Mozilla-signed XPI for a stable installation. For development, run `python3 scripts/build_firefox.py` and load dist/firefox/manifest.json using about:debugging. Temporary loading is removed on full Firefox exit and cannot verify persistent installation.

## Three numbered steps

1. **Prepare your connection key.** Enter the tunnel ID and runtime key. Choose session-only storage or an encrypted saved copy with a long unique local password entered twice. Save and grant OpenAI access if requested. The result is shown inside this step; saving the key does not itself pair a new ChatGPT tab.
2. **Connect your ChatGPT tab.** Open ChatGPT, sign in and wait for the tab to load. Return to settings, select the intended tab if several are available, and press Connect selected tab. Grant requested ChatGPT access. Bound-state feedback appears below the button. The connected conversation is protected from review/moves/deletion. Automatic reconnection is optional and only trusts the paired account.
3. **Use Chat Commander in ChatGPT.** Connect the Chat Commander custom app to the same private tunnel in ChatGPT settings. Use Manage → Refresh tools after catalog/resource updates, not on every startup. In the conversation ask: “Use Chat Commander to list my 3 most recent chats. Do not modify anything.” Actual tool results/errors appear in ChatGPT; the settings acknowledgement is not a tool test.

After a full restart, unlock the saved key with the local password, open/load an authenticated ChatGPT tab, then allow same-account reconnection. If it does not reconnect, return to step 2. The local password is not your ChatGPT password and is never sent to OpenAI or saved by the extension.

## Lock, forget and failures

Lock stops the tunnel and clears unlocked credentials and pending review state, keeping an encrypted saved key. Disconnect and forget also removes the saved vault and trusted-account binding. A forgotten password requires entering the runtime key again. These controls do not revoke a key at OpenAI; revoke exposed keys there separately.

Pending reviews are volatile: restart, source replacement or reconnection can invalidate them. Do not replay old approvals. Different-account pairing must be explicit. Revoking chatgpt.com permission blocks new reads until permission and pairing are restored.

The current source uses fixed undocumented endpoints. HTTP 429 means stop and wait, not loop requests. Read failures now distinguish bounded phase/status/failure metadata; do not share raw responses or HAR. After an uncertain write, inspect the report and target without blindly repeating the mutation.

[Security](../SECURITY.md) · [Validation status](status.md)
