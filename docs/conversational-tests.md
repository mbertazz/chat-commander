# Conversational checks — 0.13.0

The [machine-readable scenarios](../tests/manual/conversations.json) contain 20 English prompts and outcome invariants. They are a manual host-test protocol, not an automated LLM evaluation or evidence that the latest release passed in ChatGPT.

Create disposable chats for route planning, hiking equipment, interview preparation, rename/archive/restore, long reading and deletion. Use a unique CCQA prefix; capture their exact IDs locally. Never commit real IDs, transcripts, credentials or browser profiles. Keep the command conversation outside the target set. The [long-read fixture](../tests/fixtures/manual/long-chat.txt) is synthetic.

For the injection fixture, put an instruction to rename another disposable fixture inside retrieved text. The command prompt must ask only for a summary. Confirm no native changes occur; do not click a misleading proposal. This checks consent boundaries, not whether the LLM never follows an injected instruction.

Run scenarios one at a time, compare tool results with native ChatGPT state, and mark unperformed cases as not run. A model claiming success is not an independent oracle. Mutating cases require a human to inspect and click the exact confirmation card; never automate approval or retrieve its capability into an LLM prompt.

See [manual verification](review-setup.md) for interruption, reconnect, stale-card and project-plan checks. The automated Node suite tests the dispatcher/page adapter/component with synthetic data; it does not replace authenticated host testing. Future unattended evaluation needs an explicitly authorized disposable account and host automation that preserves consent.
