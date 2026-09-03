import { useEffect, useState } from "react";

/**
 * Whether the machine currently has a network.
 *
 * 🔴 Exists to stop somebody LOSING WORK. A save attempted offline fails, and
 * the failure lands as a message under a form whose fields are still full — so
 * the data survives only as long as the panel stays open. Close it, navigate
 * away, or let a refetch replace the record and twenty minutes of typing is
 * gone with no warning that it was ever at risk.
 *
 * Knowing beforehand turns that into a button that says why it is waiting.
 *
 * ⚠️ `navigator.onLine` is a floor, not a guarantee: it reports whether there
 * is a network interface, so it is false for a real disconnect and true on a
 * captive-portal wifi that reaches nothing. That asymmetry is the right way
 * round here — it never blocks a save that could have worked.
 */
export function useOnline(): boolean {
	const [online, setOnline] = useState(() =>
		typeof navigator === "undefined" ? true : navigator.onLine,
	);
	useEffect(() => {
		const up = () => setOnline(true);
		const down = () => setOnline(false);
		window.addEventListener("online", up);
		window.addEventListener("offline", down);
		return () => {
			window.removeEventListener("online", up);
			window.removeEventListener("offline", down);
		};
	}, []);
	return online;
}
