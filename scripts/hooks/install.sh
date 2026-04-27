#!/usr/bin/env bash
# scripts/hooks/install.sh
#
# Installs git hooks for tax-portal by symlinking scripts/hooks/* into .git/hooks/.
# Run once after cloning the repo:
#
#   bash scripts/hooks/install.sh
#
# Idempotent: safe to re-run. Existing symlinks pointing to the same target are
# not touched; conflicting non-symlink files prompt for confirmation before overwrite.

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
HOOKS_DIR="${REPO_ROOT}/.git/hooks"
SOURCE_DIR="${REPO_ROOT}/scripts/hooks"

if [[ ! -d "$HOOKS_DIR" ]]; then
  echo "ERROR: .git/hooks not found — are you inside a git repository?" >&2
  exit 1
fi

echo "Installing git hooks from scripts/hooks/ → .git/hooks/"

install_hook() {
  local hook_name="$1"
  local source="${SOURCE_DIR}/${hook_name}"
  local target="${HOOKS_DIR}/${hook_name}"

  if [[ ! -f "$source" ]]; then
    echo "  SKIP: $hook_name (source file not found at $source)"
    return
  fi

  # Make the hook script executable
  chmod +x "$source"

  # Check existing target
  if [[ -L "$target" ]]; then
    local existing_target
    existing_target="$(readlink "$target")"
    if [[ "$existing_target" == "$source" ]]; then
      echo "  OK (already installed): $hook_name → $source"
      return
    else
      echo "  Replacing symlink: $hook_name (was → $existing_target)"
      rm "$target"
    fi
  elif [[ -f "$target" ]]; then
    echo "  WARNING: $target is a regular file (not a symlink)."
    printf "  Overwrite? [y/N] "
    read -r reply
    if [[ "$reply" != "y" && "$reply" != "Y" ]]; then
      echo "  SKIP: $hook_name (user chose not to overwrite)"
      return
    fi
    rm "$target"
  fi

  ln -s "$source" "$target"
  echo "  Installed: $hook_name → $source"
}

install_hook "pre-push"

echo ""
echo "Done. Hooks installed in ${HOOKS_DIR}/"
echo "To verify: ls -la ${HOOKS_DIR}/"
