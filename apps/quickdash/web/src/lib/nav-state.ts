/**
 * Which sidebar groups a person has opened, remembered per workspace.
 *
 * 🔴 Before this, a group's open state came only from the URL — so every reload
 * collapsed everything except the section you happened to be standing in. Work
 * that spans two modules meant re-opening the other one after every refresh.
 *
 * 🔑 Per WORKSPACE, not global. Somebody running a shop and a consultancy uses
 * different parts of each, and carrying one's shape into the other is noise.
 *
 * ⚠️ Deliberately not in the URL. This is a preference about the furniture, not
 * a description of what you are looking at — putting it in the address bar
 * would make every shared link carry one person's sidebar.
 */

const key = (workspaceId: string) => `quickdash:nav-open:${workspaceId}`;

export function readOpenModules(workspaceId: string): Set<string> {
	try {
		const stored = window.localStorage.getItem(key(workspaceId));
		if (!stored) return new Set();
		const parsed: unknown = JSON.parse(stored);
		return new Set(
			Array.isArray(parsed)
				? parsed.filter((id): id is string => typeof id === "string")
				: [],
		);
	} catch {
		// Private browsing, a full quota, or something that is not ours. A
		// forgotten sidebar is not worth an error.
		return new Set();
	}
}

export function writeOpenModules(workspaceId: string, open: Set<string>) {
	try {
		window.localStorage.setItem(key(workspaceId), JSON.stringify([...open]));
	} catch {
		// Same reasoning: this must never break navigation.
	}
}
