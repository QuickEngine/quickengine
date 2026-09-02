import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useLayoutEffect,
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
	/**
	 * How many page-level takeovers are on screen.
	 *
	 * A count, not a flag: a page can hold more than one `PageState`, and the
	 * last to unmount must not clear a takeover another is still showing.
	 */
	takeovers: number;
	declareTakeover: (active: boolean) => void;
	/**
	 * The element on the breadcrumb row that a list page's controls render into.
	 *
	 * 🔑 An ELEMENT in state, not a ref. A portal needs its target to exist
	 * before it can render into it, and a ref never re-renders the reader when
	 * it fills — so the controls would mount into nothing on the first paint and
	 * never try again.
	 */
	rail: HTMLElement | null;
	setRail: (element: HTMLElement | null) => void;
	/**
	 * The strip inside the table's own frame, holding filter and search.
	 *
	 * 🔑 Separate from `rail` because these two belong to the DATA, not to the
	 * page. Narrowing a list is something you do to the rows in front of you, so
	 * the controls that do it sit on the table; Export, the view toggle and
	 * "add one" act on the page as a whole and stay up on the trail.
	 */
	tableRail: HTMLElement | null;
	setTableRail: (element: HTMLElement | null) => void;
};

const HeaderSlotContext = createContext<Slot | null>(null);

export function HeaderActionProvider({ children }: { children: ReactNode }) {
	const [action, setAction] = useState<ReactNode>(null);
	const [crumb, setCrumb] = useState<string | null>(null);
	const [takeovers, setTakeovers] = useState(0);
	const [rail, setRail] = useState<HTMLElement | null>(null);
	const [tableRail, setTableRail] = useState<HTMLElement | null>(null);
	const declareTakeover = useCallback(
		(active: boolean) => setTakeovers((count) => count + (active ? 1 : -1)),
		[],
	);
	const value = useMemo(
		() => ({
			action,
			setAction,
			crumb,
			setCrumb,
			takeovers,
			declareTakeover,
			rail,
			setRail,
			tableRail,
			setTableRail,
		}),
		[action, crumb, takeovers, declareTakeover, rail, tableRail],
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
	return {
		/**
		 * 🔴 Withheld during a takeover. "New product" above a page that says the
		 * page does not exist offers to create something into a place you cannot
		 * see, and above a 403 it offers an action the API will refuse.
		 */
		action: (slot?.takeovers ?? 0) > 0 ? null : (slot?.action ?? null),
		crumb: slot?.crumb ?? null,
	};
}

/**
 * The breadcrumb row's right-hand rail.
 *
 * `setRail` goes on the breadcrumb's own element; `rail` is what a list page
 * portals its controls into, so Export, Filter, the view toggle and the create
 * action all land on the same line as the trail instead of a row below it.
 */
export function useHeaderRail() {
	const slot = useContext(HeaderSlotContext);
	return { rail: slot?.rail ?? null, setRail: slot?.setRail };
}

/** The strip inside the table frame, where filter and search live. */
export function useTableRail() {
	const slot = useContext(HeaderSlotContext);
	return {
		tableRail: slot?.tableRail ?? null,
		setTableRail: slot?.setTableRail,
	};
}

/** True while a page-level takeover is showing, so page chrome can stand down. */
export function usePageTakenOver() {
	return (useContext(HeaderSlotContext)?.takeovers ?? 0) > 0;
}

/**
 * Announce that this page has nothing to operate on, so its own controls stop
 * offering to operate on it.
 *
 * ⚠️ `useLayoutEffect`, not `useEffect`: the search box and filters render as
 * earlier siblings of the failure, so clearing them a paint later would flash a
 * working toolbar over a page that has already failed.
 */
export function useDeclareTakeover(active: boolean) {
	const declare = useContext(HeaderSlotContext)?.declareTakeover;
	useLayoutEffect(() => {
		if (!active || !declare) return;
		declare(true);
		return () => declare(false);
	}, [active, declare]);
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
				label={busy ? (busyLabel ?? `${label}\u2026`) : label}
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
			/**
			 * 🔴 The WORD, not a plus sign.
			 *
			 * "Add a product" and "add a supplier" are the same icon, so a bare plus
			 * made the one button that creates something the only control on the
			 * page whose effect you had to hover to learn. It is also the primary
			 * action — the thing most people came to do — and a 36px square is a
			 * strange amount of room to give it.
			 *
			 * Same height and radius as every other button on the row, so it reads
			 * as one of the set; the ink fill is what marks it as the primary.
			 */
			className={`${busy ? "shimmer-busy" : ""} flex h-8 shrink-0 items-center justify-center whitespace-nowrap rounded-md bg-[rgb(var(--console-ink))] px-3 font-medium text-[12px] text-[var(--console-pop)] outline-none transition-[box-shadow,opacity] duration-150 hover:opacity-90 active:translate-y-px disabled:opacity-60`}
		>
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
