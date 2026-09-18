#!/bin/bash
# Start JamAgents in dev mode and apply Jimmy's personal defaults.
# Double-click to run. Leave this window open while you use the app;
# closing it stops the dev servers.

set -u
cd "$(dirname "$0")/.." || exit 1
export PATH="$HOME/.bun/bin:/Applications/Docker.app/Contents/Resources/bin:/Applications/OrbStack.app/Contents/MacOS/xbin:/opt/homebrew/bin:/usr/local/bin:$PATH"

if [ ! -f .env ]; then
  echo "No .env yet. Run 'Setup JamAgents.command' first."
  read -r -p "Press Enter to close"; exit 1
fi

# Apply personal defaults once the host service is up (it writes a manifest
# under ~/.superset-*/host/). Retries quietly in the background for ~3 minutes.
(
  for _ in $(seq 1 36); do
    sleep 5
    if bun personal/src/apply.ts --dry-run >/dev/null 2>&1; then
      echo
      echo "== Applying personal defaults =="
      bun personal/src/apply.ts
      echo "== Done =="
      echo
      exit 0
    fi
  done
  echo "(personal defaults not applied: host service never came up; run 'bun personal/src/apply.ts' by hand)"
) &

echo "== Starting JamAgents (dev) =="
echo "Sign in with the 'Sign in as dev' button when the window opens."
echo
bun run dev:desktop
