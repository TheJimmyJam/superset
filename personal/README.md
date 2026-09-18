# JamAgents (personal fork of Superset)

Jimmy's personal build of [Superset](https://github.com/superset-sh/superset). Everything specific to this fork lives in this folder plus two tiny upstream edits, so pulling from `upstream/main` stays cheap.

## What is different from upstream

- `apps/desktop/package.json` - `productName` is `JamAgents` (window title, menu, app bundle name).
- `apps/desktop/src/renderer/routes/sign-in/components/SupersetLogo/` - sign-in wordmark reads JamAgents.
- `personal/` (this folder) - a small workspace package that applies personal defaults to the running app.

## First run on the Mac

The repo must live at a path with no spaces (`~/JamAgents`); node-gyp cannot build the native modules under `Desktop - Jimmy’s MacBook Air`. `Clone JamAgents.command` in Projects clones or moves it there.

1. Double-click `Setup JamAgents.command` (installs Bun if needed, checks Docker, runs Superset's local dev setup). Docker Desktop must be running.
2. Double-click `Start JamAgents.command`. It starts the dev app and, once the host service is up, applies `jimmy.json`.
3. In the app, click **Sign in as dev**.

Both files are safe to run again.

## `jimmy.json`

- `projects` - repos to register (`dir` is relative to `projectsRoot`, or absolute), with sidebar colors. Missing repos are skipped with a note.
- `agents.keep` - agent presets to show, in order. Other built-ins are removed from the list (restore any of them under Settings > Agents). Custom agents are never touched.
- `theme` - active theme id (`superset settings theme list` shows the options).

Apply by hand any time: `bun personal/src/apply.ts` (add `--dry-run` to preview).

## Pulling upstream

```
git fetch upstream
git merge upstream/main
```

Conflicts, if any, will be in the two upstream files listed above.
