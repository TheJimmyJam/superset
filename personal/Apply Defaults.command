#!/bin/bash
# Apply jimmy.json (projects, agents, theme) to the running JamAgents app.
# Double-click while the app is open. Safe to run any time.

set -u
cd "$(dirname "$0")/.." || exit 1
export PATH="$HOME/.bun/bin:$PATH"

echo "== Applying personal defaults =="
bun personal/src/apply.ts
STATUS=$?
echo
if [ $STATUS -eq 0 ]; then
  echo "Done. The sidebar updates on its own; if it doesn't, click another view and back."
else
  echo "That didn't work (exit $STATUS). Is JamAgents running? Scroll up for the reason."
fi
read -r -p "Press Enter to close"
