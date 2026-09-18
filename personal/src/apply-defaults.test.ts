import { Database } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { HostServiceContext } from "@superset/host-service";
import * as schema from "@superset/host-service/db";
import { settingsRouter } from "@superset/host-service/settings";
import type { AppRouter as HostServiceRouter } from "@superset/host-service/trpc";
import { protectedProcedure, router } from "@superset/host-service/trpc";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { drizzle } from "drizzle-orm/bun-sqlite";
import { migrate } from "drizzle-orm/bun-sqlite/migrator";
import SuperJSON from "superjson";
import { z } from "zod";
import { applyDefaults, type PersonalManifest } from "./apply-defaults";

const tmp = mkdtempSync(join(tmpdir(), "jamagents-apply-"));
const projectsRoot = join(tmp, "Projects");
const homeDir = join(tmp, ".superset-test");

type FakeProject = { id: string; repoPath: string; color: string | null };
const fakeProjects: FakeProject[] = [];
let nextId = 1;

const fakeProjectRouter = router({
	list: protectedProcedure.query(() =>
		fakeProjects.map((p) => ({
			id: p.id,
			repoPath: p.repoPath,
			color: p.color,
		})),
	),
	create: protectedProcedure
		.input(
			z.object({
				name: z.string(),
				mode: z.object({
					kind: z.literal("importLocal"),
					repoPath: z.string(),
					initIfNeeded: z.boolean(),
				}),
			}),
		)
		.mutation(({ input }) => {
			const existing = fakeProjects.find(
				(p) => p.repoPath === input.mode.repoPath,
			);
			if (existing) {
				return {
					projectId: existing.id,
					repoPath: existing.repoPath,
					created: false,
				};
			}
			const id = `00000000-0000-4000-8000-${String(nextId++).padStart(12, "0")}`;
			fakeProjects.push({ id, repoPath: input.mode.repoPath, color: null });
			return { projectId: id, repoPath: input.mode.repoPath, created: true };
		}),
	setColor: protectedProcedure
		.input(z.object({ projectId: z.string(), color: z.string().nullable() }))
		.mutation(({ input }) => {
			const project = fakeProjects.find((p) => p.id === input.projectId);
			if (!project) throw new Error("not found");
			project.color = input.color;
			return project;
		}),
});

const testRouter = router({
	settings: settingsRouter,
	project: fakeProjectRouter,
});

let server: ReturnType<typeof Bun.serve>;
let client: ReturnType<typeof createTRPCClient<HostServiceRouter>>;

beforeAll(() => {
	mkdirSync(join(projectsRoot, "repo-a", ".git"), { recursive: true });
	mkdirSync(join(projectsRoot, "repo-b", ".git"), { recursive: true });
	mkdirSync(join(projectsRoot, "not-a-repo"), { recursive: true });
	mkdirSync(homeDir, { recursive: true });
	writeFileSync(
		join(homeDir, "app-state.json"),
		JSON.stringify({ themeState: { activeThemeId: "dark" } }),
	);

	const hostServicePkg = require.resolve("@superset/host-service/package.json");
	const migrationsFolder = join(dirname(hostServicePkg), "drizzle");
	const db = drizzle(new Database(":memory:"), { schema });
	migrate(db, { migrationsFolder });

	server = Bun.serve({
		port: 0,
		fetch: (request) =>
			fetchRequestHandler({
				endpoint: "/trpc",
				req: request,
				router: testRouter,
				createContext: () =>
					({ db, isAuthenticated: true }) as unknown as HostServiceContext,
			}),
	});

	client = createTRPCClient<HostServiceRouter>({
		links: [
			httpBatchLink({
				url: `http://127.0.0.1:${server.port}/trpc`,
				transformer: SuperJSON,
			}),
		],
	});
});

afterAll(() => {
	server?.stop(true);
	rmSync(tmp, { recursive: true, force: true });
});

const personal: PersonalManifest = {
	productName: "JamAgents",
	projectsRoot,
	projects: [
		{ name: "Repo A", dir: "repo-a", color: "#ff0000" },
		{ name: "Repo B", dir: "repo-b" },
		{ name: "Ghost", dir: "not-a-repo", color: "#00ff00" },
	],
	agents: { keep: ["codex", "claude"] },
	theme: "monokai",
};

function run(dryRun: boolean) {
	const lines: string[] = [];
	return applyDefaults({
		client,
		personal,
		homeDir,
		dryRun,
		log: (line) => lines.push(line),
	}).then(() => lines);
}

describe("applyDefaults", () => {
	it("dry-run changes nothing", async () => {
		const lines = await run(true);
		expect(lines.some((l) => l.startsWith("add    Repo A"))).toBe(true);
		expect(fakeProjects).toHaveLength(0);
		const agents = await client.settings.agentConfigs.list.query();
		expect(agents.length).toBeGreaterThan(2);
	});

	it("registers repos, sets colors, trims and orders agents, sets theme", async () => {
		const lines = await run(false);

		expect(fakeProjects.map((p) => p.repoPath)).toEqual([
			join(projectsRoot, "repo-a"),
			join(projectsRoot, "repo-b"),
		]);
		expect(fakeProjects[0]?.color).toBe("#ff0000");
		expect(fakeProjects[1]?.color).toBeNull();
		expect(lines.some((l) => l.startsWith("skip   Ghost"))).toBe(true);

		const agents = await client.settings.agentConfigs.list.query();
		expect(agents.map((a) => a.presetId)).toEqual(["codex", "claude"]);

		const appState = JSON.parse(
			readFileSync(join(homeDir, "app-state.json"), "utf-8"),
		) as { themeState: { activeThemeId: string } };
		expect(appState.themeState.activeThemeId).toBe("monokai");
	});

	it("is idempotent on a second run", async () => {
		const lines = await run(false);
		expect(lines.filter((l) => l.startsWith("add "))).toHaveLength(0);
		expect(lines.filter((l) => l.startsWith("remove "))).toHaveLength(0);
		expect(lines.filter((l) => l.startsWith("reorder "))).toHaveLength(0);
		expect(lines.filter((l) => l.startsWith("color "))).toHaveLength(0);
		expect(lines.some((l) => l.includes("monokai (already)"))).toBe(true);
	});
});
