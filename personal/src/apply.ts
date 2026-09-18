/**
 * Apply Jimmy's personal defaults (personal/jimmy.json) to the running
 * JamAgents host service:
 *
 *   - register each listed repo as a project (skips ones already registered
 *     or missing on disk), and set its sidebar color
 *   - trim the agent list to the presets in `agents.keep`, in that order
 *   - set the active theme
 *
 * Idempotent: run it as often as you like. Needs the desktop app (or
 * `superset start`) running so a host-service manifest exists.
 *
 *   bun personal/src/apply.ts            # apply
 *   bun personal/src/apply.ts --dry-run  # show what would change
 *   SUPERSET_HOME_DIR=~/.superset-foo bun personal/src/apply.ts
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import type { AppRouter as HostServiceRouter } from "@superset/host-service/trpc";
import { getHostId } from "@superset/shared/host-info";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import SuperJSON from "superjson";
import { applyDefaults, type PersonalManifest } from "./apply-defaults";

interface HostServiceManifest {
	pid: number;
	endpoint: string;
	authToken: string;
	startedAt: number;
	organizationId: string;
}

const DRY_RUN = process.argv.includes("--dry-run");
const MANIFEST_PATH = resolve(import.meta.dir, "..", "jimmy.json");

function log(line: string): void {
	console.log(`${DRY_RUN ? "[dry-run] " : ""}${line}`);
}

function isProcessAlive(pid: number): boolean {
	if (!pid) return false;
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

/**
 * Find a live host-service manifest. Dev builds use `~/.superset-<workspace>`
 * so each worktree's app is isolated; scan every `~/.superset*` home unless
 * SUPERSET_HOME_DIR pins one.
 */
function findHost(): { homeDir: string; manifest: HostServiceManifest } {
	const homes = process.env.SUPERSET_HOME_DIR
		? [resolve(process.env.SUPERSET_HOME_DIR)]
		: readdirSync(homedir())
				.filter((name) => name === ".superset" || name.startsWith(".superset-"))
				.map((name) => join(homedir(), name));

	const candidates: { homeDir: string; manifest: HostServiceManifest }[] = [];
	for (const homeDir of homes) {
		const hostDir = join(homeDir, "host");
		if (!existsSync(hostDir)) continue;
		for (const org of readdirSync(hostDir)) {
			const path = join(hostDir, org, "manifest.json");
			if (!existsSync(path)) continue;
			try {
				const manifest = JSON.parse(
					readFileSync(path, "utf-8"),
				) as HostServiceManifest;
				if (isProcessAlive(manifest.pid))
					candidates.push({ homeDir, manifest });
			} catch {
				// unreadable manifest: ignore
			}
		}
	}

	if (candidates.length === 0) {
		throw new Error(
			"No running JamAgents host service found. Start the desktop app (bun run dev) and try again, or set SUPERSET_HOME_DIR.",
		);
	}
	candidates.sort((a, b) => b.manifest.startedAt - a.manifest.startedAt);
	const chosen = candidates[0] as (typeof candidates)[number];
	if (candidates.length > 1) {
		log(
			`Multiple host services running; using the newest (${chosen.homeDir}). Set SUPERSET_HOME_DIR to pick another.`,
		);
	}
	return chosen;
}

async function main(): Promise<void> {
	const personal = JSON.parse(
		readFileSync(MANIFEST_PATH, "utf-8"),
	) as PersonalManifest;
	const { homeDir, manifest } = findHost();
	log(`Host service: ${manifest.endpoint} (home ${homeDir})`);

	const client = createTRPCClient<HostServiceRouter>({
		links: [
			httpBatchLink({
				url: `${manifest.endpoint}/trpc`,
				transformer: SuperJSON,
				headers: {
					Authorization: `Bearer ${manifest.authToken}`,
					"x-superset-client-machine-id": getHostId(),
				},
			}),
		],
	});

	await applyDefaults({ client, personal, homeDir, dryRun: DRY_RUN, log });
	log("done");
}

main().catch((error: unknown) => {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
});
