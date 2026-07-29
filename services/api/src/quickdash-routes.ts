import {
	claimIdempotencyKey,
	getFirstActionChecklistState,
	getQuickDashOrientationState,
	listAccessibleWorkspaces,
	releaseIdempotencyKey,
	restartQuickDashOrientation,
	saveFirstActionChecklistState,
	saveQuickDashOrientationOutcome,
} from "@quickengine/db";
import {
	declineContract,
	sendContract,
	signContract,
	viewContractForSigning,
} from "@quickengine/mod-contracts-esign";
import {
	createFileDocument,
	createFileDownloadAccess,
} from "@quickengine/mod-files";
import {
	accountSecurityGuidedGoal,
	findRecipe,
	getWorkspaceModules,
	listModules,
	resolveFirstActions,
} from "@quickengine/module-registry";
import { getSearchProvider } from "@quickengine/search";
import {
	createLocalStorageProvider,
	createVercelBlobStorageProvider,
} from "@quickengine/storage";
import type { Hono } from "hono";
import { z } from "zod";
import { authorizeWorkspace } from "./authorize";
import { authorizeSession } from "./authorize-account";
import type { PlatformDependencies, PlatformEnv } from "./platform-types";
import { resolveDatabaseGuidedStepCompletions } from "./quickdash-guided-action-completion-database";
import { resolveGuidedActions } from "./quickdash-guided-action-resolution";
import { respond, respondError } from "./respond";

const checklistSchema = z.object({
	collapsed: z.boolean(),
	dismissed: z.boolean(),
});
const orientationSchema = z.object({
	outcome: z.enum(["completed", "skipped"]),
});

/**
 * Product-shell reads and personal presentation state for the static QuickDash
 * SPA. Operational module data continues to use the public module endpoints.
 */
export function registerQuickDashRoutes(
	app: Hono<PlatformEnv>,
	options: { platform: PlatformDependencies },
) {
	const view = authorizeWorkspace(options.platform, {
		keyCapability: "catalog:read",
		sessionCapability: "workspace.view",
	});
	const session = authorizeSession(options.platform);
	const operate = authorizeWorkspace(options.platform, {
		keyCapability: "contracts:write",
		module: "contracts-esign",
		sessionCapability: "records.write",
	});
	const operateFiles = authorizeWorkspace(options.platform, {
		keyCapability: "files:write",
		module: "files",
		sessionCapability: "records.write",
	});
	const readFiles = authorizeWorkspace(options.platform, {
		keyCapability: "files:read",
		module: "files",
		sessionCapability: "workspace.view",
	});

	const storageProvider = (origin: string) =>
		process.env.BLOB_READ_WRITE_TOKEN
			? createVercelBlobStorageProvider({
					token: process.env.BLOB_READ_WRITE_TOKEN,
					storeId: process.env.BLOB_STORE_ID,
				})
			: createLocalStorageProvider(origin);

	const sessionIdentity = (c: {
		get(name: "authorized"): {
			principal:
				| { kind: "session"; userId: string }
				| { kind: "key"; keyId: string };
		};
	}) => {
		const principal = c.get("authorized").principal;
		return principal.kind === "session" ? principal.userId : null;
	};

	app.get("/v1/quickdash/workspaces", session, async (c) =>
		respond(c, {
			items: await listAccessibleWorkspaces(c.get("account").userId),
		}),
	);

	app.get("/v1/quickdash/context", view, async (c) => {
		const userId = sessionIdentity(c);
		if (!userId) {
			return respondError(
				c,
				"AUTHENTICATION_REQUIRED",
				"A signed-in user is required.",
				401,
			);
		}
		const { workspace, workspaceId } = c.get("authorized");
		const [workspaces, modules, checklist, orientation] = await Promise.all([
			listAccessibleWorkspaces(userId),
			getWorkspaceModules(workspaceId),
			getFirstActionChecklistState(userId, workspaceId),
			getQuickDashOrientationState(userId, workspaceId),
		]);
		const enabledModules = modules.filter((module) => module.enabled);
		const firstActions = resolveFirstActions({
			manifests: listModules(),
			enabledModuleIds: enabledModules.map((module) => module.id),
			preferredActionIds: findRecipe(workspace.workspace.businessType)
				?.firstActions,
		});
		const completions = await resolveDatabaseGuidedStepCompletions(
			workspaceId,
			firstActions.flatMap((action) => action.steps.map((step) => step.id)),
		);
		const guided = resolveGuidedActions(firstActions, completions);
		const checklistItems = [
			...guided.goals.map((goal) => ({
				id: goal.id,
				label: goal.label,
				description: goal.description,
				completed: goal.completed,
				steps: goal.steps.map((step) => ({
					id: step.id,
					label: step.label,
					description: step.description,
					href: `/${workspaceId}/${goal.moduleId}?intent=${encodeURIComponent(step.intent)}`,
					completed: step.completed,
					optional: step.optional ?? false,
					isNext: step.id === guided.nextStep?.id,
				})),
			})),
			{
				id: accountSecurityGuidedGoal.id,
				label: accountSecurityGuidedGoal.label,
				description: accountSecurityGuidedGoal.description,
				completed: false,
				steps: accountSecurityGuidedGoal.steps.map((step) => ({
					id: step.id,
					label: step.label,
					description: step.description,
					href: "/account/settings/security",
					completed: false,
					optional: true,
					isNext: false,
				})),
			},
		];
		return respond(c, {
			checklist: {
				collapsed: checklist.hasStoredState ? checklist.collapsed : true,
				dismissed: checklist.dismissedAt !== null,
				hasStoredState: checklist.hasStoredState,
				items: checklistItems,
			},
			modules: modules
				.filter((module) => module.enabled)
				.map((module) => ({
					id: module.id,
					settings: module.settings,
				})),
			orientation,
			role: workspace.role,
			workspace: workspace.workspace,
			workspaces,
		});
	});

	app.get("/v1/quickdash/search", view, async (c) => {
		const query = String(c.req.query("q") ?? "").trim();
		if (!query) return respond(c, { items: [] });
		const results = await getSearchProvider().search({
			index: "quickdash",
			query,
			limit: 8,
			filters: { workspaceId: c.get("authorized").workspaceId },
		});
		return respond(c, {
			items: results.map((result) => ({
				objectID: result.objectID,
				title: result.title,
				description: result.description,
				url: result.url,
			})),
		});
	});

	app.put("/v1/quickdash/checklist", view, async (c) => {
		const userId = sessionIdentity(c);
		if (!userId) {
			return respondError(
				c,
				"AUTHENTICATION_REQUIRED",
				"A signed-in user is required.",
				401,
			);
		}
		const input = checklistSchema.parse(await c.req.json());
		return respond(
			c,
			await saveFirstActionChecklistState({
				...input,
				userId,
				workspaceId: c.get("authorized").workspaceId,
			}),
		);
	});

	app.put("/v1/quickdash/orientation", view, async (c) => {
		const userId = sessionIdentity(c);
		if (!userId) {
			return respondError(
				c,
				"AUTHENTICATION_REQUIRED",
				"A signed-in user is required.",
				401,
			);
		}
		const input = orientationSchema.parse(await c.req.json());
		await saveQuickDashOrientationOutcome({
			...input,
			userId,
			workspaceId: c.get("authorized").workspaceId,
		});
		return respond(c, { saved: true });
	});

	app.delete("/v1/quickdash/orientation", view, async (c) => {
		const userId = sessionIdentity(c);
		if (!userId) {
			return respondError(
				c,
				"AUTHENTICATION_REQUIRED",
				"A signed-in user is required.",
				401,
			);
		}
		await restartQuickDashOrientation(userId, c.get("authorized").workspaceId);
		return respond(c, { restarted: true });
	});

	/**
	 * QuickDash's manual-send path needs raw signing tokens exactly once. The
	 * public durable command deliberately strips them so replay storage can never
	 * become a plaintext credential store.
	 */
	app.post("/v1/quickdash/contracts/:id/send", operate, async (c) => {
		const userId = sessionIdentity(c);
		if (!userId) {
			return respondError(
				c,
				"AUTHENTICATION_REQUIRED",
				"A signed-in user is required.",
				401,
			);
		}
		const sent = await sendContract(
			c.get("authorized").workspaceId,
			z.uuid().parse(c.req.param("id")),
			{ actorId: userId },
		);
		return respond(c, {
			...sent,
			invitations: sent.invitations.map((invitation) => ({
				email: invitation.email,
				name: invitation.name,
				token: invitation.token,
			})),
		});
	});

	app.post("/v1/quickdash/files/upload", operateFiles, async (c) => {
		const form = await c.req.formData();
		const file = form.get("file");
		if (!(file instanceof File) || file.size === 0) {
			return respondError(
				c,
				"VALIDATION_ERROR",
				"Choose a nonempty file.",
				400,
			);
		}
		const workspaceId = c.get("authorized").workspaceId;
		const idempotencyKey = c.req.header("Idempotency-Key") ?? "";
		const scope = `files.upload:${workspaceId}`;
		if (!(await claimIdempotencyKey(idempotencyKey, scope))) {
			return respond(c, { replayed: true });
		}
		try {
			const bytes = new Uint8Array(await file.arrayBuffer());
			const digest = await crypto.subtle.digest("SHA-256", bytes);
			const checksumSha256 = [...new Uint8Array(digest)]
				.map((byte) => byte.toString(16).padStart(2, "0"))
				.join("");
			const result = await createFileDocument(
				workspaceId,
				{
					title: String(form.get("title") ?? "").trim() || file.name,
					description: String(form.get("description") ?? "").trim() || null,
					folderId: String(form.get("folderId") ?? "").trim() || null,
					tags: String(form.get("tags") ?? "")
						.split(",")
						.map((tag) => tag.trim())
						.filter(Boolean),
				},
				{
					originalName: file.name,
					contentType: file.type || "application/octet-stream",
					sizeBytes: file.size,
					checksumSha256,
				},
				bytes,
				storageProvider(new URL(c.req.url).origin),
			);
			return respond(c, {
				documentId: result.document?.id,
				versionId: result.version.id,
			});
		} catch (error) {
			await releaseIdempotencyKey(idempotencyKey, scope);
			throw error;
		}
	});

	app.get("/v1/quickdash/files/:id/download", readFiles, async (c) => {
		const access = await createFileDownloadAccess(
			c.get("authorized").workspaceId,
			z.uuid().parse(c.req.param("id")),
			null,
			(name) => {
				const provider = storageProvider(new URL(c.req.url).origin);
				return name === provider.name ? provider : undefined;
			},
		);
		return respond(c, {
			expiresAt: access.expiresAt.toISOString(),
			url: access.url,
		});
	});

	app.get("/v1/quickdash/sign/:token", async (c) => {
		const view = await viewContractForSigning(c.req.param("token"));
		return respond(c, view);
	});

	app.post("/v1/quickdash/sign/:token", async (c) => {
		const body = z
			.object({
				typedName: z.string().trim().min(1).max(200),
				consentAccepted: z.literal(true),
			})
			.parse(await c.req.json());
		const forwarded = c.req.header("x-forwarded-for");
		await signContract(c.req.param("token"), {
			...body,
			userAgent: c.req.header("user-agent") ?? null,
			ipAddress:
				forwarded?.split(",")[0]?.trim() ?? c.req.header("x-real-ip") ?? null,
		});
		return respond(c, { signed: true });
	});

	app.post("/v1/quickdash/sign/:token/decline", async (c) => {
		await declineContract(c.req.param("token"));
		return respond(c, { declined: true });
	});
}
