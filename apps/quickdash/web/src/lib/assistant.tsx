import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
} from "react";
import {
	type Conversation,
	readConversations,
	titleFrom,
	writeConversations,
} from "./assistant-store";

/**
 * The assistant's conversations, shared by the two surfaces that show them.
 *
 * 🔴 A provider, because the LIST and the TRANSCRIPT live in different columns.
 * Chats sit in the console's own sidebar, the way Shopify does it, and the
 * conversation is on the right; neither can own the state. Holding it in the
 * panel and mirroring it into the sidebar is how two lists start disagreeing
 * about which chat is open.
 *
 * ⚠️ Reloaded whenever the workspace changes. One browser signs into several
 * businesses and a conversation about one must never surface in another.
 */
type AssistantValue = {
	conversations: readonly Conversation[];
	activeId: string | null;
	active: Conversation | null;
	open: (id: string | null) => void;
	remove: (id: string) => void;
	/** Appends a pair of turns, creating the conversation if this is the first. */
	append: (asked: string, answered: string) => void;
};

const AssistantContext = createContext<AssistantValue | null>(null);

export function AssistantProvider({
	workspaceId,
	children,
}: {
	workspaceId: string;
	children: ReactNode;
}) {
	const [conversations, setConversations] = useState<Conversation[]>([]);
	const [activeId, setActiveId] = useState<string | null>(null);

	useEffect(() => {
		const saved = readConversations(workspaceId);
		setConversations(saved);
		setActiveId(saved[0]?.id ?? null);
	}, [workspaceId]);

	const persist = useCallback(
		(next: Conversation[]) => {
			setConversations(next);
			writeConversations(workspaceId, next);
		},
		[workspaceId],
	);

	const remove = useCallback(
		(id: string) => {
			setConversations((current) => {
				const next = current.filter((entry) => entry.id !== id);
				writeConversations(workspaceId, next);
				setActiveId((open) => (open === id ? (next[0]?.id ?? null) : open));
				return next;
			});
		},
		[workspaceId],
	);

	const append = useCallback(
		(asked: string, answered: string) => {
			const at = Date.now();
			setConversations((current) => {
				const existing = current.find((entry) => entry.id === activeId);
				const base: Conversation = existing ?? {
					id: `chat-${at}`,
					title: titleFrom(asked),
					turns: [],
					updatedAt: at,
				};
				const updated: Conversation = {
					...base,
					// The title comes from the first question and then stays put: a chat
					// that renames itself as it goes cannot be found again in a list.
					title: base.turns.length === 0 ? titleFrom(asked) : base.title,
					turns: [
						...base.turns,
						{ id: `you-${at}`, from: "you", text: asked, at },
						{ id: `assistant-${at}`, from: "assistant", text: answered, at },
					],
					updatedAt: at,
				};
				const next = [
					updated,
					...current.filter((entry) => entry.id !== updated.id),
				];
				writeConversations(workspaceId, next);
				setActiveId(updated.id);
				return next;
			});
		},
		[activeId, workspaceId],
	);

	const value = useMemo<AssistantValue>(
		() => ({
			conversations,
			activeId,
			active: conversations.find((entry) => entry.id === activeId) ?? null,
			open: setActiveId,
			remove,
			append,
		}),
		[conversations, activeId, remove, append],
	);

	// `persist` is the escape hatch for anything that rewrites wholesale later.
	void persist;

	return (
		<AssistantContext.Provider value={value}>
			{children}
		</AssistantContext.Provider>
	);
}

/** Null outside the workspace shell, so a surface can simply not offer it. */
export const useAssistant = () => useContext(AssistantContext);
