import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import type { AppRouter as HostServiceRouter } from "@superset/host-service/trpc";
import type { TRPCClient } from "@trpc/client";

export interface PersonalProject {
	name: string;
	dir: string;
	color?: string;
}

export interface PersonalManifest {
	productName: string;
	projectsRoot: string;
	projects: PersonalProject[];
	agents: { keep: string[] };
	theme?: string;
}

export interface ApplyOptions {
	client: TRPCClient<HostServiceRouter>;
	personal: PersonalManifest;
	/** Superset home dir of the running host (theme state lives there). */
	homeDir: string;
	dryRun: boolean;
	log: (line: string) => void;
}

export async function applyProjects({
	client,
	personal,
	dryRun,
	log,
}: ApplyOptions): Promise<void> {
	const existing = await client.project.list.query();
	const byPath = new Map(existing.map((p) => [resolve(p.repoPath), p]));

	for (const project of personal.projects) {
		const repoPath = resolve(personal.projectsRoot, project.dir);
		if (!existsSync(join(repoPath, ".git"))) {
			log(`skip   ${project.name}: no git repo at ${repoPath}`);
			continue;
		}
		const registered = byPath.get(repoPath);
		let projectId = registered?.id;
		let currentColor = registered?.color ?? null;
		if (registered) {
			log(`have   ${project.name}`);
		} else {
			log(`add    ${project.name}  <- ${repoPath}`);
			if (!dryRun) {
				const created = await client.project.create.mutate({
					name: project.name,
					mode: { kind: "importLocal", repoPath, initIfNeeded: false },
				});
				projectId = created.projectId;
				currentColor = null;
			}
		}
		if (project.color && projectId && currentColor !== project.color) {
			log(`color  ${project.name} -> ${project.color}`);
			if (!dryRun) {
				await client.project.setColor.mutate({
					projectId,
					color: project.color,
				});
			}
		}
	}
}

export async function applyAgents({
	client,
	personal,
	dryRun,
	log,
}: ApplyOptions): Promise<void> {
	const keep = personal.agents.keep;
	const agents = await client.settings.agentConfigs.list.query();
	const isCustom = (presetId: string) => presetId.startsWith("custom:");
	const toRemove = agents.filter(
		(a) => !isCustom(a.presetId) && !keep.includes(a.presetId),
	);
	for (const agent of toRemove) {
		log(`remove agent ${agent.label} (${agent.presetId})`);
		if (!dryRun) {
			await client.settings.agentConfigs.remove.mutate({ id: agent.id });
		}
	}
	const kept = agents.filter((a) => !toRemove.includes(a));
	const ordered = [
		...keep
			.map((presetId) => kept.find((a) => a.presetId === presetId))
			.filter((a): a is NonNullable<typeof a> => a !== undefined),
		...kept.filter((a) => !keep.includes(a.presetId)),
	];
	const currentOrder = kept.map((a) => a.id).join(",");
	const wantedOrder = ordered.map((a) => a.id).join(",");
	if (ordered.length > 1 && currentOrder !== wantedOrder) {
		log(`reorder agents -> ${ordered.map((a) => a.label).join(", ")}`);
		if (!dryRun) {
			await client.settings.agentConfigs.reorder.mutate({
				ids: ordered.map((a) => a.id),
			});
		}
	}
	for (const presetId of keep) {
		if (!agents.some((a) => a.presetId === presetId)) {
			log(
				`note   preset "${presetId}" is not in the agent list; add it under Settings > Agents`,
			);
		}
	}
}

export async function applyTheme({
	personal,
	homeDir,
	dryRun,
	log,
}: ApplyOptions): Promise<void> {
	if (!personal.theme) return;
	process.env.SUPERSET_HOME_DIR = homeDir;
	const { readThemeState, requireThemeId, writeThemeState } = await import(
		"@superset/cli/src/lib/settings"
	);
	let state: ReturnType<typeof readThemeState>;
	try {
		state = readThemeState();
	} catch (error) {
		log(
			`theme  skipped: ${error instanceof Error ? error.message : String(error)} (launch the app once, then re-run)`,
		);
		return;
	}
	if (state.activeThemeId === personal.theme) {
		log(`theme  ${personal.theme} (already)`);
		return;
	}
	log(`theme  ${state.activeThemeId} -> ${personal.theme}`);
	if (!dryRun) {
		const id = requireThemeId(state, personal.theme, { allowSystem: true });
		await writeThemeState({ activeThemeId: id });
	}
}

export async function applyDefaults(options: ApplyOptions): Promise<void> {
	await applyProjects(options);
	await applyAgents(options);
	await applyTheme(options);
}
