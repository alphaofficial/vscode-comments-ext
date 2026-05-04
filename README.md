# Margin

Margin is a VS Code extension for local code comments. It stores threads in `.vscode/margin.json` and keeps them out of source control.

## Install The Extension

Install a packaged VSIX:

```bash
code --install-extension margin.vsix
```

Or install from the latest GitHub release:

```bash
curl -fsSL https://raw.githubusercontent.com/alphaofficial/vscode-comments-ext/main/install.sh | bash
```

## Initialize A Workspace

After the extension is installed, open a trusted workspace and run `Margin: Initialize Margin` from the Command Palette.

That creates workspace-local files:

```text
.vscode/margin.json     # stored comment threads
.vscode/bin/margin      # generated project CLI entrypoint
.vscode/bin/margin-cli.mjs
```

Margin adds those paths to `.git/info/exclude` so they stay local to your clone. It does not modify your repository `.gitignore`.

If you want this setup to happen automatically when a workspace opens, enable:

```json
"margin.autoInit": true
```

## Commands

### For Humans

Use the VS Code command palette and comment UI.

| Command | Description |
| --- | --- |
| `Margin: Initialize Margin` | Set up Margin in the current workspace. |
| `Margin: Add Comment Thread` | Create a thread on the active line. |
| `Margin: Add Reply` | Reply to an existing thread. |
| `Margin: Resolve Thread` | Mark a thread resolved. |
| `Margin: Reopen Thread` | Reopen a resolved thread. |
| `Margin: Delete Thread` | Delete a thread. |
| `Margin: Clear Thread` | Remove a thread from the workspace store. |

Reply, resolve, reopen, clear, and delete are also available from the VS Code comments UI when a thread is selected.

### For Agents

After a workspace has been initialized, agents and scripts should use the generated `.vscode/bin/margin` CLI:

```bash
.vscode/bin/margin add src/index.ts 42 --text "Skips the null case."
.vscode/bin/margin reply   <thread-id> --text "Confirmed."
.vscode/bin/margin resolve <thread-id>
.vscode/bin/margin reopen  <thread-id>
.vscode/bin/margin delete  <thread-id>
.vscode/bin/margin clear   <thread-id>
```

`--author` is optional. When omitted, Margin uses the current shell user from `USER` or `USERNAME`.

The extension owns `.vscode/bin/*`. Those files are generated from bundled assets and are refreshed automatically when the extension updates. Do not edit them directly.

## LLM Instructions

Use this block when you want an LLM or coding agent to leave Margin comments instead of editing source files or writing ad hoc notes:

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

## Development

```bash
npm install
npm run compile
npm test
npm run package
```

`npm run package` builds a VSIX you can install locally in VS Code.

## License

MIT. See [LICENSE](LICENSE).
