import { trackProductEvent } from "@quickengine/analytics";
import {
	claimIdempotencyKey,
	completeFirstActionChecklistState,
	db,
	eq,
	getFirstActionChecklistState,
	getQuickDashOrientationState,
	getWorkspaceHome,
	listAccessibleWorkspaces,
	listWorkspaceAudit,
	quickengineUsers,
	readEmailTemplateCopy,
	readWorkspaceBranding,
	releaseIdempotencyKey,
	resolveBrand,
	restartQuickDashOrientation,
	saveEmailTemplateCopy,
	saveFirstActionChecklistState,
	saveQuickDashOrientationOutcome,
	saveWorkspaceBranding,
	setWorkspaceModuleSettings,
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
	getModule,
	getWorkspaceModules,
	listModules,
	resolveFirstActions,
} from "@quickengine/module-registry";
import { getSearchProvider } from "@quickengine/search";
import { storageProviderFromEnv } from "@quickengine/storage";
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
	/**
	 * 🔴 No `module`, and `workspace.manage` rather than `records.write`.
	 *
	 * How a business appears to its own customers is a WORKSPACE setting, not a
	 * record in a module. Reusing the contracts authorizer here made saving a
	 * support email fail with "The contracts-esign module is not enabled", which
	 * is both wrong and impossible to act on.
	 */
	const manage = authorizeWorkspace(options.platform, {
		keyCapability: "catalog:read",
		sessionCapability: "workspace.manage",
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

	const storageProvider = (origin: string) => storageProviderFromEnv(origin);

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

	/**
	 * What needs a person today, in this workspace.
	 *
	 * 🔑 Assembled server-side from the ENABLED modules, so the response never
	 * mentions a module this business does not have — and the page is one request
	 * rather than nine whose answer depends on which of them failed.
	 */
	app.get("/v1/quickdash/home", view, async (c) => {
		const { workspaceId } = c.get("authorized");
		const modules = (await getWorkspaceModules(workspaceId))
			.filter((module) => module.enabled)
			.map((module) => module.id);
		return respond(
			c,
			await getWorkspaceHome(workspaceId, {
				modules,
				timeZone: c.req.query("timeZone") ?? "UTC",
			}),
		);
	});

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
		const alreadyCompleted = checklist.completedAt !== null;
		const completions = alreadyCompleted
			? firstActions.flatMap((action) =>
					action.steps.map((step) => ({ id: step.id, completed: true })),
				)
			: await resolveDatabaseGuidedStepCompletions(
					workspaceId,
					firstActions.flatMap((action) => action.steps.map((step) => step.id)),
				);
		const guided = resolveGuidedActions(firstActions, completions);
		const completedNow =
			!alreadyCompleted && firstActions.length > 0 && guided.nextStep === null;
		if (completedNow) {
			await completeFirstActionChecklistState(userId, workspaceId);

			// 🔴 The most important event in the system. The guided actions are real
			// business outcomes — an invoice sent, an order taken — so finishing them
			// is the moment an account becomes a user rather than a signup.
			//
			// `completedNow` rather than `checklistComplete`: the latter is true on
			// every subsequent request, which would report one activation thousands
			// of times and make the rate meaningless.
			trackProductEvent({
				name: "activation.first_outcome",
				surface: "quickdash",
				userId,
				workspaceId,
				properties: { goals: firstActions.length },
			});
		}
		const checklistComplete = alreadyCompleted || completedNow;
		const checklistItems = [
			...guided.goals.map((goal) => ({
				id: goal.id,
				label: goal.label,
				description: goal.description,
				completed: checklistComplete || goal.completed,
				steps: goal.steps.map((step) => ({
					id: step.id,
					label: step.label,
					description: step.description,
					href: `/${workspaceId}/${goal.moduleId}?intent=${encodeURIComponent(step.intent)}`,
					completed: checklistComplete || step.completed,
					optional: step.optional ?? false,
					isNext: !checklistComplete && step.id === guided.nextStep?.id,
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
				collapsed: alreadyCompleted
					? true
					: completedNow
						? false
						: checklist.hasStoredState
							? checklist.collapsed
							: true,
				dismissed:
					alreadyCompleted || (!completedNow && checklist.dismissedAt !== null),
				hasStoredState: checklist.hasStoredState,
				items: checklistItems,
			},
			// Display metadata travels with the enabled set so QuickDash's navigation
			// never keeps its own copy of the module names. A hand-maintained list in
			// the frontend is how the onboarding catalog drifted into offering 5 of 15
			// modules; the registry is the only place a module's name should live.
			modules: modules
				.filter((module) => module.enabled)
				.map((module) => ({
					id: module.id,
					name: module.name,
					description: module.description,
					kind: module.kind,
					settings: module.settings,
				})),
			orientation,
			role: workspace.role,
			// 🔴 `organizationId` lives on the RESOLUTION, not on the workspace row,
			// so spreading the row alone dropped it. The client has always declared
			// it and always received undefined — invisible until Connect needed it to
			// call an account endpoint, and the workspace switcher had been quietly
			// falling back to a default avatar seed the whole time.
			workspace: {
				...workspace.workspace,
				organizationId: workspace.organizationId,
			},
			workspaces,
		});
	});

	/**
	 * How a business appears to its own customers.
	 *
	 * 🔴 Until this existed the branding row was created only by a local script,
	 * so in production a business could never set its own name, support address
	 * or sender — and every email it sent went out as the platform. A receipt for
	 * a coffee order arriving from QuickEngine is the most visible way the
	 * platform shows through, and the shopper has no relationship with us.
	 */
	/**
	 * ⚠️ Colour is checked against a solid hex on purpose. Mail clients discard
	 * `oklch()` and custom properties, so an unvalidated value renders as no
	 * colour at all in exactly the place branding matters most.
	 */
	/**
	 * ⚠️ Length-capped, and deliberately plain text. A subject line is truncated
	 * by every mail client past about 70 characters, and a heading that wraps
	 * three times looks broken in exactly the place branding matters.
	 */
	const templateCopySchema = z.object({
		subject: z.string().trim().max(200).nullable().optional(),
		/**
		 * ⚠️ Capped at 100k. A whole email document is legitimately large, but an
		 * unbounded text field reachable by an authenticated write is a way to
		 * fill a database one request at a time.
		 */
		html: z.string().max(100_000).nullable().optional(),
	});

	const brandingInputSchema = z.object({
		displayName: z.string().trim().max(120).nullable().optional(),
		supportEmail: z.string().trim().max(200).nullable().optional(),
		senderEmail: z.string().trim().max(200).nullable().optional(),
		websiteUrl: z.string().trim().max(300).nullable().optional(),
		tagline: z.string().trim().max(200).nullable().optional(),
		accentColor: z
			.string()
			.trim()
			.regex(/^#[0-9a-fA-F]{6}$/, "Use a six digit hex colour, like #6B4423.")
			.nullable()
			.optional(),
		logoUrl: z.string().trim().max(500).nullable().optional(),
	});

	app.get("/v1/quickdash/branding", view, async (c) =>
		respond(c, await readWorkspaceBranding(c.get("authorized").workspaceId)),
	);

	app.patch("/v1/quickdash/branding", manage, async (c) => {
		const body = brandingInputSchema.parse(await c.req.json());
		await saveWorkspaceBranding(c.get("authorized").workspaceId, body);
		return respond(
			c,
			await readWorkspaceBranding(c.get("authorized").workspaceId),
		);
	});

	/**
	 * Change how a module behaves for THIS business.
	 *
	 * 🔴 Until this existed there was no write path for module settings anywhere.
	 * Every module carries a `settingsSchema` — an order number prefix, whether
	 * stock may go negative, where parcels ship from — and every one of them was
	 * frozen at whatever the workspace was created with. The schemas were real,
	 * the screens were not, and nothing joined them.
	 *
	 * 🔴 Parsed against the MODULE'S OWN schema, not a schema written here. A
	 * second copy of a module's settings shape in the API is a copy that drifts,
	 * and the drift shows up as a setting that saves and then does nothing.
	 *
	 * ⚠️ `manage`, not `operate`. Configuring a module is a workspace decision
	 * rather than a record write, and the `operate` authorizers each require
	 * their own module to be enabled — reusing one made saving a support email
	 * fail with "The contracts-esign module is not enabled".
	 *
	 * ⚠️ Whole-object replace, not a merge. A partial save cannot express
	 * "clear this", and a settings screen that can set a value but never unset it
	 * is one somebody has to edit the database to escape.
	 */
	app.patch("/v1/quickdash/modules/:moduleId/settings", manage, async (c) => {
		const moduleId = c.req.param("moduleId");
		const manifest = getModule(moduleId);
		if (!manifest) {
			return respondError(
				c,
				"VALIDATION_ERROR",
				"That module does not exist.",
				400,
			);
		}

		const parsed = manifest.settingsSchema.safeParse(await c.req.json());
		if (!parsed.success) {
			return respondError(
				c,
				"VALIDATION_ERROR",
				"Those settings are not valid for this module.",
				400,
			);
		}

		const settings = await setWorkspaceModuleSettings({
			workspaceId: c.get("authorized").workspaceId,
			moduleId,
			settings: parsed.data as Record<string, unknown>,
		});
		if (!settings) {
			// Not enabled here. A 404 rather than a 403: from the caller's side the
			// thing they asked to configure genuinely is not there.
			return respondError(
				c,
				"NOT_FOUND",
				"That module is not switched on for this workspace.",
				404,
			);
		}
		return respond(c, { moduleId, settings });
	});

	/**
	 * Every email a customer can receive, rendered with this business's brand.
	 *
	 * 🔑 Rendered SERVER-SIDE from the real templates rather than mocked up in the
	 * console. A preview drawn separately is a second implementation that drifts,
	 * and the first time anybody notices is when a customer gets the version that
	 * did not drift.
	 *
	 * ⚠️ `@quickengine/email/templates` — the pure subpath. The package root
	 * exports the Resend client, and importing that here would drag a provider
	 * SDK into route registration. See hard rule 12.
	 */
	app.get("/v1/quickdash/email-templates", view, async (c) => {
		const { workspaceId } = c.get("authorized");
		const brand = await resolveBrand(workspaceId);
		if (!brand) {
			return respondError(c, "NOT_FOUND", "That workspace was not found.", 404);
		}
		const { emailTemplatePreviews } = await import(
			"@quickengine/email/templates"
		);
		const copy = await readEmailTemplateCopy(workspaceId);
		return respond(c, {
			sender: brand.sender ?? null,
			items: emailTemplatePreviews(brand, copy).map((template) => ({
				...template,
				// What the business has typed, so the editor shows its own words
				// rather than the rendered result.
				copy: copy[template.key] ?? { subject: null, html: null },
			})),
		});
	});

	/**
	 * Send one template to the person asking, with their own branding.
	 *
	 * 🔴 To the SIGNED-IN USER, never an address from the request. An endpoint
	 * that mails arbitrary recipients on a business's behalf is an open relay,
	 * and "just for testing" is how one ships.
	 *
	 * ⚠️ Failures are returned, not swallowed. This is the one place where the
	 * whole point is finding out that a sending domain is not verified — the
	 * customer path deliberately hides that, and it has to surface somewhere.
	 */
	/**
	 * Set or clear a business's own wording for one email.
	 *
	 * ⚠️ Clearing every field DELETES the row rather than storing empties, so
	 * "cleared" and "never set" behave identically. Otherwise a business that
	 * empties a heading keeps overriding the built-in one with nothing.
	 */
	app.patch("/v1/quickdash/email-templates/:key", manage, async (c) => {
		const { workspaceId } = c.get("authorized");
		const body = templateCopySchema.parse(await c.req.json());
		await saveEmailTemplateCopy(workspaceId, c.req.param("key"), body);
		return respond(c, { saved: true });
	});

	app.post("/v1/quickdash/email-templates/:key/test", manage, async (c) => {
		const { workspaceId } = c.get("authorized");
		const principal = c.get("authorized").principal;
		if (principal.kind !== "session") {
			return respondError(
				c,
				"VALIDATION_ERROR",
				"A test email is sent to the person asking for it, so this needs a signed in user.",
				400,
			);
		}

		const brand = await resolveBrand(workspaceId);
		if (!brand) {
			return respondError(c, "NOT_FOUND", "That workspace was not found.", 404);
		}

		const { emailTemplatePreviews } = await import(
			"@quickengine/email/templates"
		);
		const template = emailTemplatePreviews(
			brand,
			await readEmailTemplateCopy(workspaceId),
		).find((item) => item.key === c.req.param("key"));
		if (!template) {
			return respondError(c, "NOT_FOUND", "No such email.", 404);
		}

		/**
		 * ⚠️ Looked up, not taken from the request. The session proves who is
		 * asking; their stored address is the only one this may send to.
		 */
		const [user] = await db
			.select({ email: quickengineUsers.email })
			.from(quickengineUsers)
			/**
			 * ⚠️ From the PRINCIPAL, not `c.get("account")`.
			 *
			 * That context is populated by the account authorizer; this route uses
			 * the workspace one, where it is undefined — reading it threw a 500 with
			 * no useful message. The principal is already narrowed to a session
			 * above, so its user id is the right and available source.
			 */
			.where(eq(quickengineUsers.id, principal.userId))
			.limit(1);
		const to = user?.email;
		if (!to) {
			return respondError(
				c,
				"VALIDATION_ERROR",
				"Your account has no email address to send to.",
				400,
			);
		}

		try {
			const { getEmailProvider } = await import("@quickengine/email");
			await getEmailProvider().send({
				to,
				from: brand.sender,
				replyTo: brand.supportEmail,
				subject: `[Test] ${template.rendered.subject}`,
				html: template.rendered.html,
				text: template.rendered.text,
			});
			return respond(c, { sentTo: to, sender: brand.sender ?? null });
		} catch (error) {
			return respondError(
				c,
				"DEPENDENCY_UNAVAILABLE",
				error instanceof Error ? error.message : "That could not be sent.",
				502,
			);
		}
	});

	/**
	 * Who did what, and when — this workspace's own record of its own records.
	 *
	 * 🔴 Every financial mutation has written an audit row since the beginning
	 * and NOTHING could read one. The table had a writer, three purpose-built
	 * indexes, and no query anywhere in the product — so "who refunded this
	 * order" was answerable only with psql and the schema memorised. That is the
	 * difference between keeping an audit trail and having evidence.
	 *
	 * ⚠️ `resourceId` narrows to one record, which is the question people
	 * actually arrive with, and `requestId` narrows to one action — a single
	 * click writes several rows and they share it, so following it reconstructs
	 * what happened rather than guessing from timestamps a millisecond apart.
	 */
	app.get("/v1/quickdash/audit", view, async (c) => {
		const before = c.req.query("before");
		const parsed = before ? new Date(before) : undefined;
		return respond(c, {
			items: await listWorkspaceAudit(c.get("authorized").workspaceId, {
				limit: Number(c.req.query("limit") ?? 50),
				resourceType: c.req.query("resourceType") || undefined,
				resourceId: c.req.query("resourceId") || undefined,
				requestId: c.req.query("requestId") || undefined,
				action: c.req.query("action") || undefined,
				// An unparseable cursor must not silently return page one again —
				// dropping it is the safe answer, and the list simply does not advance.
				before: parsed && !Number.isNaN(parsed.getTime()) ? parsed : undefined,
			}),
		});
	});

	app.get("/v1/quickdash/search", view, async (c) => {
		const query = String(c.req.query("q") ?? "").trim();
		if (!query) return respond(c, { items: [] });
		const results = await getSearchProvider().search({
			index: "quickdash",
			query,
			limit: 8,
			// Required by the type now, rather than remembered by the caller.
			workspaceId: c.get("authorized").workspaceId,
		});
		// 🔴 A failed search is a feature backlog written by users. The QUERY is
		// deliberately never recorded — it is customer content and can quote a
		// client's name straight back into telemetry. Only that it failed, and how
		// long it was, which is enough to tell a typo from a missing capability.
		trackProductEvent({
			name: results.length > 0 ? "command.succeeded" : "command.failed",
			surface: "quickdash",
			userId: sessionIdentity(c),
			workspaceId: c.get("authorized").workspaceId,
			properties: { results: results.length, queryLength: query.length },
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
