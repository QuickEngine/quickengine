import { useEffect } from "react";
import { TRANSIENT_TOAST } from "../lib/transient-toast";
import { useToast } from "./toast";

/**
 * Losing the network, and getting it back.
 *
 * ── Why a toast and not a wall, a banner, or a bar ───────────────────────────
 *
 * 🔴 This took the WHOLE console once. Going offline for four seconds on a
 * train wiped the page somebody was reading, and coming back put them at the
 * top of a list they had scrolled halfway down. Nothing was broken — the
 * network blinked — and the console reacted as though the product had failed.
 *
 * 🔑 Then it was a bespoke floating pill, which was the right SHAPE and the
 * wrong thing to build: a small notice that appears in a corner, says one
 * sentence and takes itself away is a toast, and this console already has
 * toasts. A second component doing a toast's job is a second thing to restyle
 * every time the toasts change.
 *
 * Connectivity is a property of the WINDOW, not of the page you are on, so it
 * says so once, globally. The page you are looking at reports it separately as
 * one inline line — see `FailureStatusLine` — because that explains why THIS
 * list is stale, which is a different sentence.
 *
 * ⚠️ `navigator.onLine` is a floor, not a guarantee. It reports whether the
 * machine has a network interface, so it goes false for a real disconnect and
 * stays true on a captive-portal wifi that reaches nothing. That is fine here:
 * this is for the case it CAN detect, and a request that fails anyway still
 * reports itself on the page.
 */
export function ConnectionBanner() {
	const toast = useToast();

	useEffect(() => {
		/**
		 * 🔑 A fixed id, so a flapping connection replaces its own notice instead
		 * of stacking six of them. Somebody on bad wifi must not end up reading a
		 * column of identical toasts.
		 */
		const OFFLINE_ID = TRANSIENT_TOAST.offline;

		const goOffline = () => {
			toast.show({
				id: OFFLINE_ID,
				// 🔑 Amber, not red and not blue. Nothing is broken, so not red;
				// but anything typed now will not save, so it is not merely news
				// either. Coming back is the green one.
				signal: "attention",
				title: "You’re offline",
				body: "Changes won’t save until you reconnect.",
			});
		};

		const goOnline = () => {
			// Take the warning away the moment it stops being true, rather than
			// leaving it to time out under a "Back online" saying the opposite.
			toast.dismiss(OFFLINE_ID);
			toast.show({ signal: "success", title: "Back online" });
		};

		// Read on MOUNT as well as on the event, so a tab opened while already
		// offline says so instead of waiting for an event that has been and gone.
		if (!navigator.onLine) goOffline();

		window.addEventListener("offline", goOffline);
		window.addEventListener("online", goOnline);
		return () => {
			window.removeEventListener("offline", goOffline);
			window.removeEventListener("online", goOnline);
		};
	}, [toast]);

	return null;
}
