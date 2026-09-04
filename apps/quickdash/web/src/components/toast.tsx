import { XIcon } from "@phosphor-icons/react";
import { useNavigate } from "@tanstack/react-router";
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
import { follow } from "../lib/go";
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

/** How long the exit takes. Must match `.quickdash-toast-leaving` in the CSS. */
const EXIT_MS = 160;

/**
 * What a TOAST can say — the stored signals, plus one.
 *
 * 🔑 `success` exists here and nowhere in the database, and that asymmetry is
 * the point. The stored enum describes news: something happened, somewhere
 * else, that you would otherwise miss. "Rate saved" is not that. You pressed
 * Save, you watched it, and a permanent record of your own clicking would bury
 * the one order that actually needed you.
 *
 * So `success` is deliberately unable to reach the bell: the bell reads
 * `NotificationSignal`, and this type is the wider one.
 */
export type ToastSignal = NotificationSignal | "success";

export type Toast = {
	id: string;
	/** Set while it slides back out, just before it is removed. */
	leaving?: boolean;
	signal: ToastSignal;
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
const LIFETIME: Record<ToastSignal, number | null> = {
	// Shortest of the four. You already know it worked — you pressed the button
	// and watched the row change. The toast is a confirmation, not information,
	// and the sooner it is out of the corner the better.
	success: 4_000,
	news: 6_000,
	attention: 10_000,
	failure: null,
};

/** Past this, the stack is a wall. Older ones are dropped, and the bell has them. */
/**
 * ⚠️ Six, not three.
 *
 * Three hid news while it was still arriving, which is the one moment it
 * matters — fire a handful at once and half of them never appeared at all. Six
 * is about what fits above the fold without the corner becoming a panel, and
 * anything that scrolls past is still in the bell.
 */
const MAX_VISIBLE = 6;

/**
 * The four colours, and they are the ordinary ones on purpose.
 *
 * Green worked · blue happened · yellow needs a look · red went wrong. Nobody
 * has to learn this, which is the whole value of not inventing a palette: an
 * operator who has used any other software already knows what red in the corner
 * means. An order arriving is blue rather than green because it is news, not an
 * achievement of yours — and a customer signing up is the same kind of thing.
 */
const ACCENT: Record<ToastSignal, string> = {
	success: "var(--signal-success)",
	news: "var(--signal-news)",
	attention: "var(--signal-attention)",
	failure: "var(--signal-failure)",
};

export function ToastProvider({ children }: { children: ReactNode }) {
	const [toasts, setToasts] = useState<Toast[]>([]);
	// Ids that were dismissed, so a late timer cannot resurrect a removed toast.
	const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
	/** Ids already on their way out, so a second press cannot double-remove. */
	const dismissing = useRef(new Set<string>());
	// Read by the resume path, which runs outside React's render and would
	// otherwise close over a stale list.
	const liveToasts = useRef<Toast[]>([]);
	liveToasts.current = toasts;

	/**
	 * 🔑 Leaves, then goes.
	 *
	 * A toast that vanishes on the frame you press the cross reads as a bug —
	 * you cannot tell whether you dismissed it or it expired. Marking it as
	 * leaving lets it slide back out the way it came in, and the row is removed
	 * once the animation has run. `dismissing` is a ref rather than state so a
	 * second press cannot queue two removals.
	 */
	const dismiss = useCallback((id: string) => {
		const timer = timers.current.get(id);
		if (timer) {
			clearTimeout(timer);
			timers.current.delete(id);
		}
		if (dismissing.current.has(id)) return;
		dismissing.current.add(id);
		setToasts((current) =>
			current.map((toast) =>
				toast.id === id ? { ...toast, leaving: true } : toast,
			),
		);
		window.setTimeout(() => {
			dismissing.current.delete(id);
			setToasts((current) => current.filter((toast) => toast.id !== id));
		}, EXIT_MS);
	}, []);

	// Scheduling lives here rather than inline in `show` so hovering can cancel
	// every pending dismissal and re-arm them on the way out.
	const schedule = useCallback(
		(id: string, signal: ToastSignal) => {
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
	/**
	 * 🔴 A LIST, not a deck.
	 *
	 * The cards used to stack: each one behind the front scaled down and lifted
	 * a few pixels so the deck "peeked". Two things ruined it. Scaling from the
	 * centre made the card behind stick out on BOTH sides, and every card
	 * carries a coloured left edge — so the peek showed a row of bright arcs
	 * down the left of a stack you could not read anyway.
	 *
	 * ⚠️ Capped at three. Beyond that they stop being glanceable and start
	 * being a panel, and the bell is already the place where everything is
	 * kept.
	 */
	/**
	 * ⚠️ All of them, oldest at the top.
	 *
	 * Capping at three hid news while it was still arriving, which is the one
	 * moment it matters. Anything dismissed here is still in the bell, so the
	 * corner is a tap on the shoulder rather than the only copy — see the note
	 * at the top of this file.
	 */
	const visible = toasts;

	return (
		<section
			aria-label="Notifications"
			onMouseEnter={() => onPause(true)}
			onMouseLeave={() => onPause(false)}
			onFocus={() => onPause(true)}
			onBlur={(event) => {
				if (!event.currentTarget.contains(event.relatedTarget as Node)) {
					onPause(false);
				}
			}}
			/**
			 * 🔴 NO `overflow-hidden`. That was the "square shadow".
			 *
			 * The stack clipped to its own box, and a drop shadow is drawn
			 * OUTSIDE the element that casts it — so every toast had its shadow
			 * sliced off flat along the container's edges. It read as a rounded
			 * card sitting on a rectangle, which is exactly what it was.
			 *
			 * Nothing needed the clip: the container is pinned to the bottom
			 * right, so a toast sliding or dragging outward runs into the
			 * viewport edge, which clips it for free.
			 */
			className="pointer-events-none fixed right-4 bottom-4 z-50 flex max-h-[calc(100vh-6rem)] w-[min(24rem,calc(100vw-2rem))] flex-col gap-2"
		>
			{visible.map((toast) => (
				<ToastCard key={toast.id} toast={toast} onDismiss={onDismiss} />
			))}
		</section>
	);
}

/** Past this the drag is a dismissal rather than a stray movement. */
const DISMISS_PX = 80;

function ToastCard({
	toast,
	onDismiss,
}: {
	toast: Toast;
	onDismiss: (id: string) => void;
}) {
	const accent = ACCENT[toast.signal];
	const clickable = Boolean(toast.href);
	// Horizontal drag offset while a pointer is down, in pixels.
	const [drag, setDrag] = useState(0);
	const start = useRef<number | null>(null);
	// A drag that moved must not also fire the card's click.
	const dragged = useRef(false);
	const navigate = useNavigate();

	function release() {
		if (start.current === null) return;
		start.current = null;
		if (drag > DISMISS_PX) {
			onDismiss(toast.id);
			return;
		}
		setDrag(0);
	}

	return (
		<div
			// Dragging is a pointer gesture, so pointer events rather than mouse:
			// the same handlers cover a trackpad, a touchscreen and a stylus.
			/**
			 * 🔴 Not when the pointer went down on a CONTROL.
			 *
			 * Capturing the pointer here meant the close button never received its
			 * click — the card swallowed the whole gesture. Anything that is its
			 * own control keeps its own press.
			 */
			onPointerDown={(event) => {
				/**
				 * 🔴 Only the CLOSE control, not any button.
				 *
				 * The whole body is a `<button>` when the toast has somewhere to go,
				 * so skipping every button meant you could not drag the card at all —
				 * the guard covered almost its entire surface.
				 */
				if ((event.target as HTMLElement).closest("[data-toast-close]")) return;
				start.current = event.clientX;
				dragged.current = false;
				event.currentTarget.setPointerCapture(event.pointerId);
			}}
			onPointerMove={(event) => {
				if (start.current === null) return;
				/**
				 * 🔑 RIGHTWARDS only. The toast lives against the right edge and
				 * leaves through it, so dragging left is pulling it further into the
				 * page — a direction it can never go. Clamping at zero makes the
				 * gesture feel like the card is anchored rather than sticky.
				 */
				const delta = Math.max(0, event.clientX - start.current);
				if (delta > 3) dragged.current = true;
				setDrag(delta);
			}}
			onPointerUp={release}
			onPointerCancel={release}
			/* ⚠️ `items-center` and a small vertical padding, so a toast with no body
			   is a THIN line rather than a card with air above and below a single
			   sentence. One with a body grows to fit it. */
			/* 🔴 A themed shadow, not a hard black one. `0 10px 30px -8px
			   rgb(0 0 0/0.45)` was picked against a near-black console; on a
			   white ground that much black reads as a grey rectangle sitting
			   behind a rounded card, so the corners of the SHADOW show outside
			   the radius. `--lift-card` is the same elevation expressed per
			   theme, and it carries the inset top highlight light mode needs. */
			className={`quickdash-toast pointer-events-auto flex touch-none items-center gap-2.5 rounded-xl bg-[var(--console-pop)] py-1.5 pr-1.5 pl-3 shadow-[var(--lift-card)] ${
				toast.leaving ? "quickdash-toast-leaving" : ""
			}`}
			style={{
				/**
				 * 🔴 The exit CONTINUES the drag; it does not restart it.
				 *
				 * This used to be a CSS keyframe beginning at `translateX(0)`, so a
				 * card you had dragged eighty pixels out snapped back to its resting
				 * place and only then slid away — a visible bounce in the middle of
				 * one gesture. Transitioning the inline transform instead means the
				 * animation starts from wherever your finger left it.
				 */
				transform: toast.leaving ? "translateX(120%)" : `translateX(${drag}px)`,
				// Fades as it is dragged clear, so letting go past the threshold looks
				// like a continuation of the gesture rather than a separate event.
				opacity: toast.leaving
					? 0
					: 1 - Math.min(drag / (DISMISS_PX * 2.2), 0.75),
				// While the pointer is down the card must track the finger exactly;
				// a transition here makes it lag behind and feel broken.
				transition:
					start.current === null
						? "transform 160ms cubic-bezier(0.4, 0, 1, 1), opacity 160ms"
						: "none",
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
						if (toast.href) follow(navigate, toast.href);
					}}
					className={`block w-full text-left ${clickable ? "cursor-pointer" : "cursor-default"}`}
				>
					<p className="flex items-center gap-2 text-[11.5px] text-[var(--ink-85)] leading-4">
						{/* 🔴 A dot, not an icon. Reversed 2026-09-03.
						    The icons were argued for on the grounds that a bell, a
						    triangle and a broken circle still read when colour does
						    not. True — and they also made every toast look like a
						    different component, because three glyphs at three
						    optical weights never sit the same way beside a line of
						    text. The console marks severity with a dot everywhere
						    else: the sidebar, the notification rows, the inline
						    failure line. A fourth language in the corner was the
						    odd one out. */}
						<span
							aria-hidden="true"
							className="size-1.5 shrink-0 rounded-full"
							style={{ background: accent }}
						/>
						<span className="min-w-0 truncate">{toast.title}</span>
					</p>
					{toast.body ? (
						<p className="mt-0.5 line-clamp-2 text-[10.5px] text-[var(--ink-40)] leading-4">
							{toast.body}
						</p>
					) : null}
				</button>
			</div>
			<button
				type="button"
				data-toast-close
				onClick={() => onDismiss(toast.id)}
				aria-label="Dismiss notification"
				data-hint="Dismiss"
				className="flex size-6 shrink-0 items-center justify-center rounded-md text-[var(--ink-25)] transition-colors hover:bg-[rgb(var(--console-ink)/0.055)] hover:text-[var(--ink-75)]"
			>
				<XIcon size={12} />
			</button>
		</div>
	);
}
