#!/usr/bin/env bash

set -euo pipefail

echo "Margin Installation Script"
echo "====================================================================="

DEFAULT_GITHUB_REPOSITORY="alphaofficial/vscode-comments-ext"
GIT_EXCLUDE_PATTERNS=(
  ".vscode/margin.json"
  ".vscode/bin/margin"
  ".vscode/bin/margin-cli.mjs"
)

detect_github_repository() {
  local remote_url=""
  local repository=""

  remote_url="$(git remote get-url origin 2>/dev/null || true)"

  case "$remote_url" in
    https://github.com/*)
      repository="${remote_url#https://github.com/}"
      ;;
    git@github.com:*)
      repository="${remote_url#git@github.com:}"
      ;;
    ssh://git@github.com/*)
      repository="${remote_url#ssh://git@github.com/}"
      ;;
  esac

  repository="${repository%.git}"
  printf '%s' "$repository"
}

update_git_exclude() {
  local git_root=""
  local exclude_file=""
  local added=0

  git_root="$(git rev-parse --show-toplevel 2>/dev/null || true)"

  if [ -z "$git_root" ]; then
    echo "Git repository not detected; skipping .git/info/exclude update."
    return 0
  fi

  exclude_file="${git_root}/.git/info/exclude"
  mkdir -p "$(dirname "$exclude_file")"
  touch "$exclude_file"

  for pattern in "${GIT_EXCLUDE_PATTERNS[@]}"; do
    if ! grep -Fxq "$pattern" "$exclude_file"; then
      printf '%s\n' "$pattern" >> "$exclude_file"
      added=1
    fi
  done

  if [ "$added" -eq 1 ]; then
    echo "Updated .git/info/exclude with Margin local-state paths."
  else
    echo ".git/info/exclude already contains Margin local-state paths."
  fi
}

if ! command -v curl >/dev/null 2>&1; then
  echo "Error: curl is required to download the latest Margin release."
  exit 1
fi

GITHUB_REPOSITORY="${MARGIN_GITHUB_REPOSITORY:-$(detect_github_repository)}"
GITHUB_REPOSITORY="${GITHUB_REPOSITORY:-$DEFAULT_GITHUB_REPOSITORY}"

if [ -z "$GITHUB_REPOSITORY" ]; then
  echo "Error: Could not determine GitHub repository."
  echo "Set MARGIN_GITHUB_REPOSITORY=owner/repo and rerun this script."
  exit 1
fi

DOWNLOAD_URL="https://github.com/${GITHUB_REPOSITORY}/releases/latest/download/margin.vsix"
TMP_DIR="$(mktemp -d)"
VSIX_FILE="${TMP_DIR}/margin.vsix"

cleanup() {
  rm -rf "$TMP_DIR"
}

trap cleanup EXIT

echo "Repository: ${GITHUB_REPOSITORY}"
echo "Downloading latest released VSIX..."
echo "${DOWNLOAD_URL}"

if ! curl -fL "$DOWNLOAD_URL" -o "$VSIX_FILE"; then
  echo ""
  echo "Error: Could not download the latest released Margin VSIX."
  echo "Make sure the repository has a GitHub release with a margin.vsix asset."
  exit 1
fi

echo "Downloaded: ${VSIX_FILE}"

echo ""
echo "Configuring Git exclude..."
update_git_exclude

echo ""
echo "Installing extension in VS Code..."
if command -v code >/dev/null 2>&1; then
  code --install-extension "$VSIX_FILE" --force
  echo ""
  echo "Installation complete!"
  echo "Please reload VS Code to activate the extension:"
  echo "- Open Command Palette (Cmd+Shift+P / Ctrl+Shift+P)"
  echo "- Run 'Developer: Reload Window'"
else
  MANUAL_VSIX_FILE="$(pwd)/margin-latest.vsix"
  cp "$VSIX_FILE" "$MANUAL_VSIX_FILE"
  echo "Warning: VS Code CLI 'code' command not found."
  echo "Please install the extension manually:"
  echo "1. Open VS Code"
  echo "2. Go to Extensions (Cmd+Shift+X / Ctrl+Shift+X)"
  echo "3. Click 'Install from VSIX...'"
  echo "4. Select: ${MANUAL_VSIX_FILE}"
  echo "5. Reload VS Code when prompted"
fi

echo ""
echo "After reloading VS Code, run 'Margin: Initialize Margin' in the workspace where you want comments."
echo "Installation script complete!"
