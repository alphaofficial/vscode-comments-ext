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

## Installation

### Option 1: One-line install with curl

Run the installer directly with `curl` without cloning the repository:

```bash
curl -fsSL https://raw.githubusercontent.com/alphaofficial/vscode-comments-ext/main/install.sh | bash
```

### Option 2: Install the latest release with the installer from a clone

Run the installer from a clone of this repository:

```bash
chmod +x ./install.sh
./install.sh
```

The installer downloads the latest released `margin.vsix` from GitHub Releases and installs it with the VS Code `code` CLI.

If the script cannot infer the GitHub repository from `origin`, provide it explicitly:

```bash
MARGIN_GITHUB_REPOSITORY=alphaofficial/vscode-comments-ext ./install.sh
```

If the VS Code `code` CLI is not available, the installer saves `margin-latest.vsix` in the current directory and prints manual install instructions.

### Option 3: Install a release manually

1. Open the latest GitHub Release for this repository.
2. Download `margin.vsix` from the release assets.
3. Open VS Code.
4. Open Extensions with `Cmd+Shift+X` on macOS or `Ctrl+Shift+X` on Windows/Linux.
5. Open the Extensions view menu (`...`).
6. Choose **Install from VSIX...**.
7. Select the downloaded `margin.vsix` file.
8. Reload VS Code when prompted.

### Option 4: Build and install locally from source

Use this path when testing unreleased changes:

```bash
npm install
npm run compile
npm run package
code --install-extension margin-0.0.1.vsix --force
```

Replace `margin-0.0.1.vsix` with the VSIX generated for the current `package.json` version.

### First-time workspace setup

After installing the extension:

1. Open the workspace where you want local comments.
2. Make sure the workspace is trusted.
3. Open the Command Palette with `Cmd+Shift+P` on macOS or `Ctrl+Shift+P` on Windows/Linux.
4. Run **Margin: Initialize Margin**.
5. Confirm that `.vscode/margin.json`, `.vscode/bin/margin`, and `.vscode/bin/margin-cli.mjs` were created.
6. Confirm that `.git/info/exclude` contains the Margin local-state paths.

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

Useful scripts:

| Script | Description |
| --- | --- |
| `npm run compile` | Build the TypeScript extension into `out/`. |
| `npm run watch` | Rebuild continuously during development. |
| `npm test` | Run the Node test suite. |
| `npm run package` | Package the extension with `vsce`. |

## Releases

Releases are created manually from the **Release** GitHub Actions workflow. The workflow:

- Computes a SemVer-compatible CalVer version in the form `YYYY.MDD.N`, where `N` increments for multiple releases on the same UTC day.
- Sets `package.json` to the computed version inside the release build.
- Installs dependencies, compiles, tests, and packages the extension.
- Creates a `vYYYY.MDD.N` tag and publishes a GitHub release without pushing a commit to `main`.
- Uploads both the versioned VSIX and a stable `margin.vsix` asset used by `install.sh`.

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
