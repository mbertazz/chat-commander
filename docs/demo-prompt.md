# Organization demo — preflight before reading

After loading a changed build, refresh the custom app’s tools in ChatGPT, verify the new tools are enabled, then start a new conversation and select Chat Commander. Extension reload and a successful list call do not prove the conversation imported the complete new catalog.

This is the [official metadata refresh sequence](https://developers.openai.com/plugins/deploy/connect-chatgpt). The extension can advertise tools and diagnose mismatches; it cannot change ChatGPT’s cached callable set itself.

Use this English prompt:

```text
Use Chat Commander to organize my 50 most recently updated eligible chats.

Before reading the batch, call list_chats with limit:1 and report the actual server_info version and catalog_version. Check that YOUR callable tools include begin_review with a limit of 50, read_review_chat and prepare_project_plan. The server advertising a tool does not prove you can call it. If a required tool is absent or your schema caps the limit at 20, STOP and tell me to refresh the app tools, enable the missing tool and start a new conversation. Do not read a smaller batch as a substitute.

Then call begin_review with limit:50. Use its selected IDs and automatic source-chat exclusions; do not exclude chats by guessing their titles. Report requested_count, selected_count and scanned_count honestly. If fewer than 50 are available, state the actual coverage.

Read an overview page of each selected chat, then deepen relevant candidates. Distinguish complete from partial reading and unsupported attachments. Stop on rate limits or failures instead of repeatedly retrying.

Propose up to five projects based on explicit shared goals, decisions and dependencies. Explain each included conversation’s contribution. Do not group unrelated infrastructure or search chats into product release readiness merely because they mention tools or tests. Leave ambiguous or mixed-topic conversations untouched.

Inspect existing projects and reuse exact suitable IDs when their purpose is supported by the available evidence. Do not infer project contents or instructions from names alone. Do not silently create duplicates.

Prepare ONE confirmation card with prepare_project_plan, containing the exact project creations and chat moves. Each group must have label (up to 100 characters), ids (exact reviewed chat IDs), reason (up to 500 characters), and optionally project_id. For a NEW project omit project_id or set it to null; use an exact project ID only for an existing destination. Do not add fields named projects, moves, changes or confirmed. Do not rename, archive, delete or apply anything. I will inspect the complete plan before confirming it.
```

A valid result must include one exact card, not merely a grouping table or multiple substitute cards. No mutation occurs until the human clicks that card. The 50-chat selection test is automated with synthetic data; authenticated throughput and the final grouping quality still need a live run.

Read sequentially and inspect every result before the next call. Treat `reading:"failed"` or `isError:true` as a failure even if the transport call itself returned normally. Stop and report the returned code/diagnostic; do not continue a prewritten loop or retry automatically.
