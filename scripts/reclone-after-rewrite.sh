#!/usr/bin/env bash
# Re-clone after the WMATA-key history rewrite (main was force-pushed).
#
# Usage:
#   ./scripts/reclone-after-rewrite.sh [target-dir]
#
# Default target: $HOME/Projects/MTA
# The script refuses to delete a dirty clone or a directory that is not a git
# worktree. Push/back up local work first.
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/tishtosh/MTA.git}"
TARGET="${1:-$HOME/Projects/MTA}"

die() { printf 'error: %s\n' "$*" >&2; exit 1; }

case "$TARGET" in
  /*) ;;
  *) TARGET="$PWD/$TARGET" ;;
esac
TARGET="${TARGET%/}"

[ -n "$TARGET" ] || die "empty target"
[ "$TARGET" != "/" ] || die "refusing to remove /"
[ "$TARGET" != "$HOME" ] || die "refusing to remove HOME"
[ "$TARGET" != "$HOME/Projects" ] || die "refusing to remove Projects"

if [ -e "$TARGET" ]; then
  if git -C "$TARGET" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    if [ -n "$(git -C "$TARGET" status --porcelain)" ]; then
      die "$TARGET has uncommitted or untracked changes. Commit/stash them or copy them elsewhere first."
    fi
    echo "Removing old clone: $TARGET"
  else
    die "$TARGET exists but is not a git worktree; refusing to delete it."
  fi
  rm -rf -- "$TARGET"
fi

mkdir -p "$(dirname "$TARGET")"
echo "Cloning $REPO_URL into $TARGET"
git clone "$REPO_URL" "$TARGET"
cd "$TARGET"
git fetch --all --prune --tags --force

echo
git log --oneline -1
git tag --list 'v*'
echo
echo "Done. This clone uses the rewritten history with the old WMATA keys removed."
echo "Remember: the old key is still compromised until it is revoked/rotated."
