#!/bin/bash
# One-time setup for JamAgents on this Mac. Double-click to run.
# Installs Bun if missing, checks Docker, then runs Superset's local dev setup
# (Postgres + Redis in Docker, bun install, migrations, a local dev account).
# Safe to re-run.

set -u
cd "$(dirname "$0")/.." || exit 1

echo "== JamAgents setup =="
echo "Repo: $(pwd)"
echo

# The native-module build (node-gyp) cannot handle spaces in the repo path.
case "$(pwd)" in
  *" "*)
    echo "This repo is at a path with a space in it:"
    echo "  $(pwd)"
    echo "The native build fails there. Move the folder to \$HOME/JamAgents (double-click 'Clone JamAgents.command' in Projects does this) and re-run."
    read -r -p "Press Enter to close"; exit 1 ;;
esac

# Bun, pinned to .bun-version. Newer Bun skips an optional Postgres driver the
# migrations rely on, so the exact version matters.
export PATH="$HOME/.bun/bin:$PATH"
WANT="$(cat .bun-version 2>/dev/null || echo 1.3.14)"
if ! command -v bun >/dev/null 2>&1 || [ "$(bun --version)" != "$WANT" ]; then
  echo "Installing Bun $WANT..."
  curl -fsSL https://bun.sh/install | bash -s "bun-v$WANT" || { echo "Bun install failed"; read -r -p "Press Enter to close"; exit 1; }
  export PATH="$HOME/.bun/bin:$PATH"
fi
if [ "$(bun --version)" != "$WANT" ]; then
  echo "Bun is $(bun --version), wanted $WANT. Check that ~/.bun/bin/bun is first on your PATH."
  read -r -p "Press Enter to close"; exit 1
fi
echo "Bun $(bun --version)"

# Docker
export PATH="/Applications/Docker.app/Contents/Resources/bin:/Applications/OrbStack.app/Contents/MacOS/xbin:/opt/homebrew/bin:/usr/local/bin:$PATH"
if ! command -v docker >/dev/null 2>&1; then
  echo "Docker isn't on PATH. Install Docker Desktop or OrbStack, then re-run this."
  read -r -p "Press Enter to close"; exit 1
fi
if ! docker info >/dev/null 2>&1; then
  echo "Docker is installed but not running. Opening it; re-run this once the whale is steady."
  open -a Docker 2>/dev/null || open -a OrbStack 2>/dev/null
  read -r -p "Press Enter to close"; exit 1
fi
echo "Docker OK"

# jq is used by setup.local.sh
if ! command -v jq >/dev/null 2>&1; then
  if command -v brew >/dev/null 2>&1; then
    echo "Installing jq via Homebrew..."; brew install jq
  else
    echo "jq is missing and Homebrew isn't installed. Install jq, then re-run."
    read -r -p "Press Enter to close"; exit 1
  fi
fi

echo
echo "Running Superset's local dev setup (this takes a few minutes the first time)..."
./.superset/setup.local.sh 2>&1 | tee personal/setup.log
STATUS=${PIPESTATUS[0]}
echo
if [ $STATUS -eq 0 ]; then
  echo "Setup finished. Next: double-click 'Start JamAgents.command'."
else
  echo "Setup reported a problem (exit $STATUS). Scroll up for the failing step."
fi
read -r -p "Press Enter to close"
