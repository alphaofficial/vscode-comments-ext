#!/usr/bin/env bash

set -euo pipefail

echo "Margin Installation Script"
echo "====================================================================="

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Step 0: Pull latest changes from git when available.
echo "Step 0: Pulling latest changes from git..."
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  git pull origin main || echo "Warning: Could not pull from git"
else
  echo "Warning: Not inside a git repository; skipping git pull"
fi
echo ""

# Check if Node.js is installed.
if ! command -v node >/dev/null 2>&1; then
  echo "Error: Node.js is not installed. Please install Node.js 18+ first."
  exit 1
fi

echo "Node.js version: $(node --version)"

# Check if npm is installed.
if ! command -v npm >/dev/null 2>&1; then
  echo "Error: npm is not installed. Please install npm first."
  exit 1
fi

echo "npm version: $(npm --version)"

# Step 1: Install dependencies.
echo ""
echo "Step 1: Installing npm dependencies..."
npm install

# Step 2: Compile TypeScript.
echo ""
echo "Step 2: Compiling TypeScript..."
npm run compile

# Step 3: Package as VSIX.
echo ""
echo "Step 3: Packaging extension as VSIX..."
npm run package

PACKAGE_NAME="$(node -p "require('./package.json').name")"
PACKAGE_VERSION="$(node -p "require('./package.json').version")"
VSIX_FILE="${PACKAGE_NAME}-${PACKAGE_VERSION}.vsix"

if [ ! -f "$VSIX_FILE" ]; then
  VSIX_FILE="$(find . -maxdepth 1 -name '*.vsix' -type f -print | sort | tail -n 1)"
fi

if [ -z "$VSIX_FILE" ] || [ ! -f "$VSIX_FILE" ]; then
  echo "Error: Could not find packaged VSIX file."
  exit 1
fi

echo "Packaged VSIX: $VSIX_FILE"

# Step 4: Install in VS Code.
echo ""
echo "Step 4: Installing extension in VS Code..."
if command -v code >/dev/null 2>&1; then
  code --install-extension "$VSIX_FILE" --force
  echo ""
  echo "Installation complete!"
  echo "Please reload VS Code to activate the extension:"
  echo "- Open Command Palette (Cmd+Shift+P / Ctrl+Shift+P)"
  echo "- Run 'Developer: Reload Window'"
else
  echo "Warning: VS Code CLI 'code' command not found."
  echo "Please install the extension manually:"
  echo "1. Open VS Code"
  echo "2. Go to Extensions (Cmd+Shift+X / Ctrl+Shift+X)"
  echo "3. Click 'Install from VSIX...'"
  echo "4. Select: $VSIX_FILE"
  echo "5. Reload VS Code when prompted"
fi

echo ""
echo "After reloading VS Code, run 'Margin: Initialize Margin' in the workspace where you want comments."
echo "Installation script complete!"
