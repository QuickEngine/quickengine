/**
 * Where the assistant's conversations live until the API can keep them.
 *
 * 🔴 `localStorage`, and that is a KNOWN limitation rather than the design.
 * Conversations belong on the server: they should survive a new browser, be
 * readable from another machine, and be deletable by somebody exercising a data
 * request. None of that is true here. What this does buy is that the surface
 * can be built, used and argued about now, and the day the endpoint lands the
 * only thing that changes is which of these four functions is called.
 *
 * ⚠️ Keyed BY WORKSPACE. One browser signs into several workspaces and a
 * conversation about Caffeinate's orders must not surface while somebody is
 * looking at another business's console. Same rule the rest of the console
 * follows; storage is not an excuse to drop it.
 *
 * ⚠️ Every read and write is wrapped. Storage throws rather than returning null
 * in a private window and in some embedded contexts, and a chat panel that
 * white-screens because a preference could not be saved is a worse bug than
 * losing the history.
 */

export type AssistantTurn = {
	id: string;
	from: "you" | "assistant";
	text: string;
	at: number;
};

export type Conversation = {
	id: string;
	/** Taken from the first thing asked, because nobody titles a chat. */
	title: string;
	turns: AssistantTurn[];
	updatedAt: number;
};

const key = (workspaceId: string) => `quickdash.assistant.${workspaceId}`;

/** Cap kept low on purpose: this is a browser store, not an archive. */
const KEEP = 30;

export function readConversations(workspaceId: string): Conversation[] {
	try {
		const raw = localStorage.getItem(key(workspaceId));
		if (!raw) return [];
		const parsed: unknown = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];
		// Anything malformed is dropped rather than trusted. This is parsed from
		// a store a person can edit by hand.
		return parsed.filter(
			(entry): entry is Conversation =>
				!!entry &&
				typeof entry === "object" &&
				typeof (entry as Conversation).id === "string" &&
				Array.isArray((entry as Conversation).turns),
		);
	} catch {
		return [];
	}
}

export function writeConversations(
	workspaceId: string,
	conversations: readonly Conversation[],
): void {
	try {
		const trimmed = [...conversations]
			.sort((a, b) => b.updatedAt - a.updatedAt)
			.slice(0, KEEP);
		localStorage.setItem(key(workspaceId), JSON.stringify(trimmed));
	} catch {
		// Out of quota, or storage is refused. The conversation still works for
		// this session; losing it later beats failing now.
	}
}

/** A title from the first thing asked, short enough to sit in a menu row. */
export function titleFrom(text: string): string {
	const clean = text.trim().replace(/\s+/g, " ");
	if (clean.length <= 48) return clean || "New chat";
	return `${clean.slice(0, 48).trimEnd()}…`;
}
