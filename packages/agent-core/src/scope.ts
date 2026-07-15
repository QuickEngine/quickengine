export type WorkspaceAccess = "read" | "write";

export type WorkspaceGrant = {
	workspaceId: string;
	access: WorkspaceAccess;
};

export type AgentRunScope = {
	actorId: string;
	organizationId: string;
	workspaceGrants: readonly WorkspaceGrant[];
	allowedProducts: readonly string[];
};

export class AgentAuthorizationError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "AgentAuthorizationError";
	}
}

export function assertProductAccess(
	scope: AgentRunScope,
	product: string,
): void {
	if (!scope.allowedProducts.includes(product)) {
		throw new AgentAuthorizationError(`PRODUCT_ACCESS_DENIED:${product}`);
	}
}

export function assertWorkspaceAccess(
	scope: AgentRunScope,
	workspaceId: string,
	required: WorkspaceAccess,
): void {
	const grant = scope.workspaceGrants.find(
		(item) => item.workspaceId === workspaceId,
	);
	if (!grant || (required === "write" && grant.access !== "write")) {
		throw new AgentAuthorizationError(
			`WORKSPACE_${required.toUpperCase()}_DENIED:${workspaceId}`,
		);
	}
}
