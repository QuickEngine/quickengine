import type { ApiCapability } from "@quickengine/auth/api-keys";
import { Hono } from "hono";
import { requestId } from "hono/request-id";
import { describe, expect, it } from "vitest";
import { authorizeWorkspace } from "./authorize";
import type {
	ApiKeyIdentity,
	PlatformDependencies,
	PlatformEnv,
	WorkspaceResolution,
} from "./platform-types";

const workspace: WorkspaceResolution = {
	enabledModuleIds: ["client-records"],
	organizationId: "org_1",
	role: "owner",
	workspace: {
		businessType: "agency",
		id: "11111111-1111-4111-8111-111111111111",
		name: "Acme",
		slug: "acme",
	},
};

const key: ApiKeyIdentity = {
	capabilities: ["catalog:read"],
	id: "key_1",
	type: "secret",
	workspaceId: workspace.workspace.id,
};

function dependencies(
	overrides: Partial<PlatformDependencies> = {},
): PlatformDependencies {
	return {
		getSession: async () => ({ userId: "user_1" }),
		getWorkspaceForKey: async () => workspace,
		getWorkspaceForUser: async () => workspace,
		verifyApiKey: async () => key,
		...overrides,
	};
}

function testApp(
	deps: PlatformDependencies,
	requirement: {
		keyCapability?: ApiCapability;
		module?: string;
		sessionCapability?: "workspace.view" | "billing.manage";
	} = {},
) {
	const app = new Hono<PlatformEnv>();
	app.use("*", requestId());
	app.get(
		"/protected",
		authorizeWorkspace(deps, {
			keyCapability: requirement.keyCapability ?? "catalog:read",
			module: requirement.module ?? "client-records",
			sessionCapability: requirement.sessionCapability ?? "workspace.view",
		}),
		(c) => c.json(c.get("authorized")),
	);
	return app;
}

describe("authorizeWorkspace", () => {
	it("resolves a session principal, workspace, role, and audit actor", async () => {
		const response = await testApp(dependencies()).request("/protected", {
			headers: { "QuickEngine-Workspace": workspace.workspace.id },
		});
		const body = await response.json();

		expect(response.status).toBe(200);
		expect(body).toMatchObject({
			auditActor: { id: "user_1", type: "user" },
			principal: { kind: "session", role: "owner", userId: "user_1" },
			workspaceId: workspace.workspace.id,
		});
	});

	it("resolves a scoped key and its audit actor without trusting a workspace override", async () => {
		const app = testApp(dependencies());
		const allowed = await app.request("/protected", {
			headers: { Authorization: "Bearer qsk_valid" },
		});
		const mismatch = await app.request("/protected", {
			headers: {
				Authorization: "Bearer qsk_valid",
				"QuickEngine-Workspace": "22222222-2222-4222-8222-222222222222",
			},
		});

		expect(await allowed.json()).toMatchObject({
			auditActor: { id: "key_1", type: "api_key" },
			principal: { keyId: "key_1", kind: "key", type: "secret" },
		});
		expect(mismatch.status).toBe(403);
		expect((await mismatch.json()).error.code).toBe("WORKSPACE_MISMATCH");
	});

	it("rejects invalid keys, wrong channels, and missing key capabilities", async () => {
		const invalid = await testApp(
			dependencies({ verifyApiKey: async () => null }),
		).request("/protected", { headers: { Authorization: "Bearer invalid" } });
		const wrongChannel = await testApp(dependencies()).request("/protected", {
			headers: { "QuickEngine-Publishable-Key": "qsk_valid" },
		});
		const denied = await testApp(
			dependencies({
				verifyApiKey: async () => ({ ...key, capabilities: [] }),
			}),
		).request("/protected", { headers: { Authorization: "Bearer qsk_valid" } });

		expect((await invalid.json()).error.code).toBe("INVALID_API_KEY");
		expect((await wrongChannel.json()).error.code).toBe(
			"CREDENTIAL_CHANNEL_MISMATCH",
		);
		expect((await denied.json()).error.code).toBe("CAPABILITY_DENIED");
	});

	it("does not reveal whether an inaccessible session workspace exists", async () => {
		const response = await testApp(
			dependencies({ getWorkspaceForUser: async () => null }),
		).request("/protected", {
			headers: { "QuickEngine-Workspace": workspace.workspace.id },
		});

		expect(response.status).toBe(404);
		expect((await response.json()).error.code).toBe("WORKSPACE_NOT_FOUND");
	});

	it("enforces session capabilities and enabled modules", async () => {
		const memberWorkspace = { ...workspace, role: "member" as const };
		const capabilityDenied = await testApp(
			dependencies({ getWorkspaceForUser: async () => memberWorkspace }),
			{ sessionCapability: "billing.manage" },
		).request("/protected", {
			headers: { "QuickEngine-Workspace": workspace.workspace.id },
		});
		const moduleDenied = await testApp(
			dependencies({
				getWorkspaceForUser: async () => ({
					...workspace,
					enabledModuleIds: [],
				}),
			}),
		).request("/protected", {
			headers: { "QuickEngine-Workspace": workspace.workspace.id },
		});

		expect((await capabilityDenied.json()).error.code).toBe(
			"CAPABILITY_DENIED",
		);
		expect((await moduleDenied.json()).error.code).toBe("MODULE_DISABLED");
	});

	it("requires both a workspace and an authenticated session", async () => {
		const app = testApp(dependencies({ getSession: async () => null }));
		const noWorkspace = await app.request("/protected");
		const noSession = await app.request("/protected", {
			headers: { "QuickEngine-Workspace": workspace.workspace.id },
		});

		expect((await noWorkspace.json()).error.code).toBe("WORKSPACE_REQUIRED");
		expect((await noSession.json()).error.code).toBe("AUTHENTICATION_REQUIRED");
	});
});
