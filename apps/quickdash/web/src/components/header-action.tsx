import { PlusIcon } from "@phosphor-icons/react";
import {
	createContext,
	type ReactNode,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";

/**
 * How a page puts its action, and the record it has open, into the header.
 *
 * 🔑 The header lives in the LAYOUT while both of these belong to the PAGE, so
 * something has to carry them upwards. A context does that without every page
 * being routed through the layout's props, and without the layout needing to
 * know what each page can do or show.
 *
 * ⚠️ Exactly one action, deliberately. A header that accumulates buttons stops
 * being a fixed landmark and becomes a second toolbar — and the whole value of
 * a persistent bar is that the thing you reach for is always in the same place.
 * A page with two things to offer keeps the second on the page.
 */

type Slot = {
	action: ReactNode;
	setAction: (node: ReactNode) => void;
	/** The open record's name, shown after the page name. */
	crumb: string | null;
	setCrumb: (crumb: string | null) => void;
};

const HeaderSlotContext = createContext<Slot | null>(null);

export function HeaderActionProvider({ children }: { children: ReactNode }) {
	const [action, setAction] = useState<ReactNode>(null);
	const [crumb, setCrumb] = useState<string | null>(null);
	const value = useMemo(
		() => ({ action, setAction, crumb, setCrumb }),
		[action, crumb],
	);
	return (
		<HeaderSlotContext.Provider value={value}>
			{children}
		</HeaderSlotContext.Provider>
	);
}

/** What the layout renders in the header. */
export function useHeaderSlots() {
	const slot = useContext(HeaderSlotContext);
	return { action: slot?.action ?? null, crumb: slot?.crumb ?? null };
}

/**
 * Publish this page's action while it is on screen.
 *
 * 🔑 Takes a DESCRIPTION rather than a rendered button. A JSX node is a new
 * object on every render, so publishing one would either loop or need a
 * dependency array the linter cannot verify. Label and busy state are plain
 * values; the handler is held in a ref so the latest one is always called
 * without being a dependency.
 *
 * 🔴 Cleared on unmount. Without that, leaving Products for Orders would leave
 * "New product" sitting in the header — a button that creates the wrong thing
 * on the wrong page is worse than no button at all.
 */
export function useHeaderAction({
	label,
	onClick,
	busyLabel,
	busy = false,
}: {
	label: string;
	onClick: () => void;
	busyLabel?: string;
	busy?: boolean;
}) {
	const slot = useContext(HeaderSlotContext);
	const handler = useRef(onClick);
	handler.current = onClick;
	const set = slot?.setAction;

	useEffect(() => {
		set?.(
			<HeaderAction
				label={busy ? (busyLabel ?? label) : label}
				busy={busy}
				onClick={() => handler.current()}
			/>,
		);
		return () => set?.(null);
	}, [label, busyLabel, busy, set]);
}

/** The header's one action, so pages cannot each invent a button. */
function HeaderAction({
	label,
	onClick,
	busy,
}: {
	label: string;
	onClick: () => void;
	busy: boolean;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			disabled={busy}
			className={`${busy ? "shimmer-busy" : ""} flex h-9 shrink-0 items-center gap-2 rounded-full bg-[rgb(var(--console-ink))] px-3.5 text-[12.5px] text-[var(--console-pop)] outline-none transition-opacity hover:opacity-85 disabled:opacity-60`}
		>
			<PlusIcon size={14} />
			{label}
		</button>
	);
}

/**
 * Name the record this page currently has open, for the trail.
 *
 * Pass null when nothing is open. Cleared on unmount for the same reason the
 * action is: a stale name in the header claims you are somewhere you are not.
 */
export function useHeaderCrumb(crumb: string | null) {
	const slot = useContext(HeaderSlotContext);
	useEffect(() => {
		slot?.setCrumb(crumb);
		return () => slot?.setCrumb(null);
	}, [crumb, slot?.setCrumb]);
}
