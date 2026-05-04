# Margin

Private, local-only code review comments for VS Code. Leave review notes on any line without touching source files, creating commits, or sending data to external services.

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/alphaofficial/vscode-comments-ext/main/install.sh | bash
```

Or download `margin.vsix` from the [latest release](https://github.com/alphaofficial/vscode-comments-ext/releases) and run `code --install-extension margin.vsix`.

## Setup

Open a trusted workspace and run **Margin: Initialize Margin** from the Command Palette. This creates:

```
.vscode/margin.json     # comment store
.vscode/bin/margin      # agent CLI
```

Margin adds these paths to `.git/info/exclude` so they stay private to your clone. Your repo's `.gitignore` is left untouched.

To run the setup automatically on workspace open, set `"margin.autoInit": true` in your settings.

## Commands

| Command | Description |
| --- | --- |
| `Margin: Initialize Margin` | Set up the workspace store and CLI. |
| `Margin: Add Comment Thread` | Start a thread on the active line. |
| `Margin: Add Reply` | Reply to the selected thread. |
| `Margin: Resolve Thread` | Mark a thread resolved. |
| `Margin: Reopen Thread` | Reopen a resolved thread. |
| `Margin: Delete Thread` | Delete a thread. |
| `Margin: Clear Thread` | Clear all comments from a thread. |

## Agent CLI

Agents and scripts use the workspace-local CLI:

```bash
.vscode/bin/margin add src/index.ts 42 --author codex --text "Skips the null case."
.vscode/bin/margin reply   <thread-id> --author codex --text "Confirmed."
.vscode/bin/margin resolve <thread-id> --author codex
.vscode/bin/margin reopen  <thread-id> --author codex
.vscode/bin/margin delete  <thread-id> --author codex
```

The CLI validates inputs, captures anchor context, and writes `.vscode/margin.json` atomically. Do not edit the JSON file directly — Margin may overwrite or reject manual changes.

## Development

```bash
npm install
npm run compile
npm test
npm run package   # builds margin-<version>.vsix
```

## License

MIT — see [LICENSE](LICENSE).
