export function normalizeWorkspaceName(value: string): string {
	const name = value.trim();
	if (!name) {
		throw new Error("WORKSPACE_NAME_REQUIRED");
	}
	if (name.length > 120) {
		throw new Error("WORKSPACE_NAME_TOO_LONG");
	}
	return name;
}

export function normalizeBusinessType(value: string): string {
	const businessType = value.trim().toLowerCase();
	if (!businessType) {
		throw new Error("WORKSPACE_BUSINESS_TYPE_REQUIRED");
	}
	if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(businessType)) {
		throw new Error("WORKSPACE_BUSINESS_TYPE_INVALID");
	}
	return businessType;
}
