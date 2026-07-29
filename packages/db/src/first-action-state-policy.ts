export const FIRST_ACTION_CHECKLIST_VERSION = 1;

export type FirstActionChecklistState = {
	version: number;
	collapsed: boolean;
	dismissedAt: Date | null;
	completedAt: Date | null;
};

export type StoredFirstActionChecklistState = {
	checklistVersion: number;
	collapsed: boolean;
	dismissedAt: Date | null;
	completedAt: Date | null;
};

export function defaultFirstActionChecklistState(
	version = FIRST_ACTION_CHECKLIST_VERSION,
): FirstActionChecklistState {
	if (!Number.isSafeInteger(version) || version < 1) {
		throw new Error("FIRST_ACTION_CHECKLIST_VERSION_INVALID");
	}
	return { version, collapsed: false, dismissedAt: null, completedAt: null };
}

export function resolveFirstActionChecklistState(
	stored: StoredFirstActionChecklistState | undefined,
	version = FIRST_ACTION_CHECKLIST_VERSION,
): FirstActionChecklistState {
	const fallback = defaultFirstActionChecklistState(version);
	if (!stored) return fallback;
	if (stored.checklistVersion !== version) {
		return { ...fallback, completedAt: stored.completedAt };
	}
	return {
		version,
		collapsed: stored.collapsed,
		dismissedAt: stored.dismissedAt,
		completedAt: stored.completedAt,
	};
}
