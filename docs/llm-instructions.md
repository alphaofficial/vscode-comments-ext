# Margin LLM Instructions

Use this text when you want an LLM or coding agent to leave comments through Margin.

## Copy-Paste Prompt

```text
This repository uses Margin for local code comments.

When you want to leave a review note, TODO, concern, or follow-up, do not edit source files just to add comments. Do not write directly to .vscode/margin.json. Do not modify .vscode/bin/*.

Use the generated workspace CLI instead:

- Add a new thread:
  .vscode/bin/margin add <file> <line> --text "<comment>"

- Reply to an existing thread:
  .vscode/bin/margin reply <thread-id> --text "<comment>"

- Resolve a thread:
  .vscode/bin/margin resolve <thread-id>

- Reopen a thread:
  .vscode/bin/margin reopen <thread-id>

- Delete a thread:
  .vscode/bin/margin delete <thread-id>

- Clear a thread:
  .vscode/bin/margin clear <thread-id>

The --author flag is optional. If omitted, Margin uses the current shell user.

Before using the CLI, assume the workspace has already been initialized with Margin. If the CLI is missing, tell the user to run "Margin: Initialize Margin" in VS Code.
```

## Notes

- Margin stores local comments in `.vscode/margin.json`.
- The extension generates `.vscode/bin/margin` and `.vscode/bin/margin-cli.mjs`.
- Those generated files should be treated as extension-managed workspace state, not hand-edited source files.
