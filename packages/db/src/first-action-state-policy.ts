export const FIRST_ACTION_CHECKLIST_VERSION = 1;

export type FirstActionChecklistState = {
	version: number;
	collapsed: boolean;
	dismissedAt: Date | null;
};

export type StoredFirstActionChecklistState = {
	checklistVersion: number;
	collapsed: boolean;
	dismissedAt: Date | null;
};

export function defaultFirstActionChecklistState(
	version = FIRST_ACTION_CHECKLIST_VERSION,
): FirstActionChecklistState {
	if (!Number.isSafeInteger(version) || version < 1) {
		throw new Error("FIRST_ACTION_CHECKLIST_VERSION_INVALID");
	}
	return { version, collapsed: false, dismissedAt: null };
}

export function resolveFirstActionChecklistState(
	stored: StoredFirstActionChecklistState | undefined,
	version = FIRST_ACTION_CHECKLIST_VERSION,
): FirstActionChecklistState {
	const fallback = defaultFirstActionChecklistState(version);
	if (!stored || stored.checklistVersion !== version) return fallback;
	return {
		version,
		collapsed: stored.collapsed,
		dismissedAt: stored.dismissedAt,
	};
}
