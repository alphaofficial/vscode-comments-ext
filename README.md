# Margin

Margin lets developers and agents leave review comments on files without changing source code, creating commits, or sending data to external services. Comments appear through VS Code's native Comments panel and are stored as private workspace state.

## How it works

Margin keeps all comment data in the current workspace:

```text
.vscode/
├── margin.json
└── bin/
    ├── margin
    └── margin-cli.mjs
```

Running **Margin: Initialize Margin** creates the local store and CLI files, then adds these private paths to `.git/info/exclude`:

```gitignore
.vscode/margin.json
.vscode/bin/margin
.vscode/bin/margin-cli.mjs
```

The repository's `.gitignore` is intentionally not modified.

## VS Code commands

Open the Command Palette and run:

| Command | Description |
| --- | --- |
| `Margin: Initialize Margin` | Create `.vscode/margin.json`, install the workspace CLI, and update `.git/info/exclude`. |
| `Margin: Add Comment Thread` | Add a new thread at the active editor line. |
| `Margin: Add Reply` | Reply to a selected Margin thread or a thread on the active line. |
| `Margin: Resolve Thread` | Mark a selected thread as resolved. |
| `Margin: Reopen Thread` | Reopen a resolved thread. |
| `Margin: Delete Thread` | Delete a selected thread after confirmation. |

Margin requires a trusted workspace and currently targets single-root workspace usage.

## Agent CLI

Agents and scripts should use the workspace-local CLI:

```bash
.vscode/bin/margin add src/index.ts 42 --author codex --text "This skips the null case."
.vscode/bin/margin reply <thread-id> --author codex --text "Confirmed after test run."
.vscode/bin/margin resolve <thread-id> --author codex
.vscode/bin/margin reopen <thread-id> --author codex
.vscode/bin/margin delete <thread-id> --author codex
```

The CLI validates file paths and line numbers, captures anchor context, generates IDs, adds timestamps, and writes `.vscode/margin.json` atomically.

> Agents and scripts must not edit `.vscode/margin.json` directly. Direct JSON mutation is unsupported and may be overwritten or rejected by Margin.

## Data model

The store uses schema version `1`:

```json
{
  "version": 1,
  "threads": [
    {
      "id": "thr_abc123",
      "file": "src/index.ts",
      "line": 42,
      "anchor": {
        "text": "function calculateTotal(items) {",
        "contextBefore": "export class CartService {",
        "contextAfter": "return total;"
      },
      "comments": [
        {
          "id": "cmt_def456",
          "author": "agent",
          "text": "This skips the null case.",
          "timestamp": "2026-05-03T10:00:00Z"
        }
      ],
      "resolved": false,
      "createdAt": "2026-05-03T10:00:00Z",
      "updatedAt": "2026-05-03T10:00:00Z"
    }
  ]
}
```

## Development

Install dependencies, compile, and run tests:

```bash
npm install
npm run compile
npm test
```

To build, package, and install the extension into VS Code in one step:

```bash
chmod +x ./install.sh
./install.sh
```

The installer pulls the latest `main` branch when available, installs dependencies, compiles TypeScript, packages a `.vsix`, and installs it through the VS Code `code` CLI. If the `code` CLI is unavailable, it prints manual “Install from VSIX...” instructions.

Useful scripts:

| Script | Description |
| --- | --- |
| `npm run compile` | Build the TypeScript extension into `out/`. |
| `npm run watch` | Rebuild continuously during development. |
| `npm test` | Run the Node test suite. |
| `npm run package` | Package the extension with `vsce`. |

## Project structure

```text
.
├── package.json
├── src/
│   ├── extension.ts
│   ├── commentProvider.ts
│   ├── fileWatcher.ts
│   ├── store.ts
│   └── types.ts
├── test/
│   ├── cli.test.mjs
│   ├── commentProvider.test.mjs
│   ├── extension.test.mjs
│   └── store.test.mjs
└── .vscode/
    └── bin/
        ├── margin
        └── margin-cli.mjs
```

## Scope

In scope:

- Native Comments panel integration
- Add, reply, resolve, reopen, and delete thread workflows
- Local JSON storage
- Workspace-local CLI for agents
- Live refresh from `.vscode/margin.json`
- Anchor context capture
- Private untracked storage

Out of scope:

- Cloud sync or external services
- Multi-user collaboration
- Markdown rendering
- Labels, tags, or categories
- Global `margin` shell command
- Committing comments to the repository

## Requirements document

See `PRD.md` for the product requirements and acceptance criteria.
