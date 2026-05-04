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

For a copy-pasteable instruction block you can hand to an LLM or coding agent, see [docs/llm-instructions.md](/Users/albertmacmini/Developer/personal/vscode-comments-ext/docs/llm-instructions.md:1).

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
