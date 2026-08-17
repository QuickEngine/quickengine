import { XIcon } from "@phosphor-icons/react";
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import type { NotificationSignal } from "../lib/quickdash-api";

/**
 * Toasts — the corner of the screen that interrupts you.
 *
 * ── When a toast is the right answer, and when it is not ────────────────────
 *
 * 🔴 A toast is the WRONG place for anything the operator might need later. It
 * disappears, it cannot be scrolled back to, and it is invisible in another tab.
 * So the rule this app follows:
 *
 * **A toast is never the only copy of anything.**
 *
 * That splits everything the product wants to say into four, and each one has
 * exactly one home:
 *
 * 1. **Your own action succeeded** → toast, and nothing else. "Rate saved."
 *    Ephemeral by nature: you did it, you watched it happen, and a permanent
 *    record of your own clicking is noise. Never lands in the bell.
 *
 * 2. **Your own action failed** → INLINE, next to the thing that failed. Not a
 *    toast. A form error in the corner of the screen makes the operator hunt
 *    for which field the server hated, and it expires while they are reading it.
 *    (`RequestFailure` and the per-view `failure` state already do this.)
 *
 * 3. **Something happened elsewhere** — an order, a message, a dispute → bell
 *    row ALWAYS, plus a toast if it happened while they were sitting here. The
 *    bell is the record; the toast is the tap on the shoulder. `NotificationToasts`
 *    is what pairs them, and it derives the toast from the bell row, so the two
 *    can never disagree.
 *
 * 4. **Everything else** → the activity feed. A price edit is history, not news.
 *
 * ── Position ────────────────────────────────────────────────────────────────
 *
 * Bottom-right. The two obvious alternatives both collide with something:
 * top-right is where the bell and the account button live, so a toast announcing
 * a notification would cover the very badge it just incremented, and top-centre
 * sits over the page heading. Bottom-left belongs to nothing here, but it is the
 * far corner from the operator's cursor, which spends its time in the content
 * column on the right.
 */

export type Toast = {
	id: string;
	signal: NotificationSignal;
	title: string;
	body?: string | null;
	/** Where clicking it goes. Same window; toasts are not a new-tab affordance. */
	href?: string | null;
};

type ToastInput = Omit<Toast, "id"> & { id?: string };

type ToastContextValue = {
	show: (toast: ToastInput) => string;
	dismiss: (id: string) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

/**
 * How long each class stays.
 *
 * 🔑 Failures do not expire on their own. A payment dispute that vanished while
 * the operator was looking at their phone is a dispute nobody responded to; it
 * costs one click to dismiss and that click is the acknowledgement.
 */
const LIFETIME: Record<NotificationSignal, number | null> = {
	news: 6_000,
	attention: 10_000,
	failure: null,
};

/** Past this, the stack is a wall. Older ones are dropped, and the bell has them. */
const MAX_VISIBLE = 3;

const ACCENT: Record<NotificationSignal, string> = {
	news: "var(--signal-news)",
	attention: "var(--signal-attention)",
	failure: "var(--signal-failure)",
};

export function ToastProvider({ children }: { children: ReactNode }) {
	const [toasts, setToasts] = useState<Toast[]>([]);
	// Ids that were dismissed, so a late timer cannot resurrect a removed toast.
	const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
	// Read by the resume path, which runs outside React's render and would
	// otherwise close over a stale list.
	const liveToasts = useRef<Toast[]>([]);
	liveToasts.current = toasts;

	const dismiss = useCallback((id: string) => {
		const timer = timers.current.get(id);
		if (timer) {
			clearTimeout(timer);
			timers.current.delete(id);
		}
		setToasts((current) => current.filter((toast) => toast.id !== id));
	}, []);

	// Scheduling lives here rather than inline in `show` so hovering can cancel
	// every pending dismissal and re-arm them on the way out.
	const schedule = useCallback(
		(id: string, signal: NotificationSignal) => {
			const lifetime = LIFETIME[signal];
			if (lifetime === null) return;
			const existing = timers.current.get(id);
			if (existing) clearTimeout(existing);
			timers.current.set(
				id,
				setTimeout(() => dismiss(id), lifetime),
			);
		},
		[dismiss],
	);

	/**
	 * 🔑 Nothing expires while the pointer is on the stack. Reaching for a toast
	 * is the clearest possible statement that you are reading it, and having one
	 * vanish from under the cursor mid-sentence is the single most irritating
	 * thing a toast can do.
	 *
	 * Resuming restarts the full lifetime rather than the remainder. You have
	 * just read it; the clock may as well start again.
	 */
	const setPaused = useCallback(
		(paused: boolean) => {
			if (paused) {
				for (const timer of timers.current.values()) clearTimeout(timer);
				timers.current.clear();
				return;
			}
			for (const toast of liveToasts.current) schedule(toast.id, toast.signal);
		},
		[schedule],
	);

	const show = useCallback(
		(input: ToastInput) => {
			const id = input.id ?? crypto.randomUUID();
			setToasts((current) => {
				// Same id twice is a re-announcement, not a second toast. The
				// notification bridge keys on the notification id for exactly this.
				if (current.some((toast) => toast.id === id)) return current;
				const next = [...current, { ...input, id }];
				return next.slice(-MAX_VISIBLE);
			});

			schedule(id, input.signal);
			return id;
		},
		[schedule],
	);

	// Clear every pending timer on unmount rather than letting them fire into a
	// component that is gone.
	useEffect(() => {
		const pending = timers.current;
		return () => {
			for (const timer of pending.values()) clearTimeout(timer);
			pending.clear();
		};
	}, []);

	const value = useMemo(() => ({ show, dismiss }), [show, dismiss]);

	return (
		<ToastContext.Provider value={value}>
			{children}
			<ToastStack toasts={toasts} onDismiss={dismiss} onPause={setPaused} />
		</ToastContext.Provider>
	);
}

/**
 * Raise a toast from anywhere under the provider.
 *
 * Returns a no-op outside one rather than throwing: a component that toasts on
 * success should not crash a test or a storybook that never mounted a provider,
 * and a missing toast is not worth taking the page down for.
 */
export function useToast(): ToastContextValue {
	const context = useContext(ToastContext);
	return useMemo(
		() => context ?? { show: () => "", dismiss: () => {} },
		[context],
	);
}

function ToastStack({
	toasts,
	onDismiss,
	onPause,
}: {
	toasts: Toast[];
	onDismiss: (id: string) => void;
	onPause: (paused: boolean) => void;
}) {
	// Expanded on hover, collapsed otherwise — the sonner behaviour. Collapsed,
	// the stack costs one card of screen no matter how many are waiting; reach
	// for it and they fan out so each can be read and acted on individually.
	const [expanded, setExpanded] = useState(false);
	// Newest nearest the corner, which is where the eye already is.
	const ordered = [...toasts].reverse();

	return (
		<section
			// 🔑 `polite` for the whole region. `assertive` interrupts a screen
			// reader mid-sentence, which is right for "your session ended" and much
			// too aggressive for "you made a sale".
			aria-live="polite"
			aria-relevant="additions"
			aria-label="Notifications"
			onMouseEnter={() => {
				setExpanded(true);
				onPause(true);
			}}
			onMouseLeave={() => {
				setExpanded(false);
				onPause(false);
			}}
			// ⚠️ Keyboard focus expands it too. Collapsed, the cards behind the front
			// one are inert to a mouse but perfectly reachable by Tab, and a control
			// you can focus but cannot see is worse than one that is simply absent.
			onFocus={() => {
				setExpanded(true);
				onPause(true);
			}}
			onBlur={(event) => {
				if (!event.currentTarget.contains(event.relatedTarget as Node)) {
					setExpanded(false);
					onPause(false);
				}
			}}
			className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-[min(22rem,calc(100vw-2rem))] justify-end"
			style={{ height: expanded ? undefined : STACK_HEIGHT }}
		>
			<div
				className={`relative w-full ${expanded ? "flex flex-col-reverse gap-2" : ""}`}
			>
				{ordered.map((toast, index) => (
					<ToastCard
						key={toast.id}
						toast={toast}
						onDismiss={onDismiss}
						depth={index}
						expanded={expanded}
					/>
				))}
			</div>
		</section>
	);
}

/** Enough for one card; the deck peeks out below it. */
const STACK_HEIGHT = "4.5rem";

/** How far each card behind the front one peeks out, and how much it shrinks. */
const PEEK_PX = 8;
const SHRINK = 0.04;

/** Past this the drag is a dismissal rather than a stray movement. */
const DISMISS_PX = 80;

function ToastCard({
	toast,
	onDismiss,
	depth,
	expanded,
}: {
	toast: Toast;
	onDismiss: (id: string) => void;
	depth: number;
	expanded: boolean;
}) {
	const accent = ACCENT[toast.signal];
	const clickable = Boolean(toast.href);
	// Horizontal drag offset while a pointer is down, in pixels.
	const [drag, setDrag] = useState(0);
	const start = useRef<number | null>(null);
	// A drag that moved must not also fire the card's click.
	const dragged = useRef(false);

	function release() {
		if (start.current === null) return;
		start.current = null;
		if (Math.abs(drag) > DISMISS_PX) {
			onDismiss(toast.id);
			return;
		}
		setDrag(0);
	}

	// Collapsed: stacked behind, scaled down and offset. Expanded: a plain column,
	// so the transform has to be neutral or it fights the flex layout.
	const stacked = !expanded && depth > 0;
	const transform = expanded
		? `translateX(${drag}px)`
		: `translateX(${drag}px) translateY(${depth * -PEEK_PX}px) scale(${1 - depth * SHRINK})`;

	return (
		<div
			// Dragging is a pointer gesture, so pointer events rather than mouse:
			// the same handlers cover a trackpad, a touchscreen and a stylus.
			onPointerDown={(event) => {
				start.current = event.clientX;
				dragged.current = false;
				event.currentTarget.setPointerCapture(event.pointerId);
			}}
			onPointerMove={(event) => {
				if (start.current === null) return;
				const delta = event.clientX - start.current;
				if (Math.abs(delta) > 3) dragged.current = true;
				setDrag(delta);
			}}
			onPointerUp={release}
			onPointerCancel={release}
			className={`quickdash-toast pointer-events-auto flex items-start gap-2.5 rounded-lg border border-[var(--console-line-strong)] bg-[var(--console-panel)] py-2.5 pr-2 pl-3 shadow-[0_8px_24px_rgb(0_0_0/0.28)] ${
				stacked ? "absolute right-0 bottom-0 left-0" : ""
			} ${expanded ? "" : "touch-none"}`}
			style={{
				borderLeft: `2px solid ${accent}`,
				transform,
				// Fades as it is dragged clear, so letting go past the threshold looks
				// like a continuation of the gesture rather than a separate event.
				opacity: 1 - Math.min(Math.abs(drag) / (DISMISS_PX * 2.2), 0.75),
				zIndex: 40 - depth,
				// While the pointer is down the card must track the finger exactly;
				// a transition here makes it lag behind and feel broken.
				transition:
					start.current === null ? "transform 180ms, opacity 180ms" : "none",
			}}
		>
			<div className="min-w-0 flex-1">
				{/* The whole body is the target when there is somewhere to go, so the
				    operator does not have to find a small "view" link. */}
				<button
					type="button"
					disabled={!clickable}
					onClick={() => {
						// Swiping a card away must not also navigate.
						if (dragged.current) return;
						if (toast.href) window.location.assign(toast.href);
					}}
					className={`block w-full text-left ${clickable ? "cursor-pointer" : "cursor-default"}`}
				>
					<p className="flex items-center gap-1.5 text-[11.5px] text-[var(--ink-85)] leading-4">
						<span
							className="size-1.5 shrink-0 rounded-full"
							style={{ background: accent }}
						/>
						<span className="min-w-0 truncate">{toast.title}</span>
					</p>
					{toast.body ? (
						<p className="mt-1 line-clamp-2 text-[10.5px] text-[var(--ink-40)] leading-4">
							{toast.body}
						</p>
					) : null}
				</button>
			</div>
			<button
				type="button"
				onClick={() => onDismiss(toast.id)}
				aria-label="Dismiss notification"
				className="flex size-6 shrink-0 items-center justify-center rounded-md text-[var(--ink-25)] transition-colors hover:bg-[rgb(var(--console-ink)/0.055)] hover:text-[var(--ink-75)]"
			>
				<XIcon size={12} />
			</button>
		</div>
	);
}
