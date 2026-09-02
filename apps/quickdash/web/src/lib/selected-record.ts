import { useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";

/**
 * Which record a page has open, seeded from the address.
 *
 * 🔑 This is what lets search open a RECORD rather than the page it lives on.
 * Finding "NEO-0047" and landing on a list of forty-seven orders is a search
 * that told you where to look rather than showing you the thing.
 *
 * ⚠️ It stays LOCAL state, mirrored from the URL, rather than being read
 * straight from the address on every render. A detail panel opened by clicking
 * a row must not put a parameter in the URL — that would make every glance at a
 * record a history entry, and Back would walk through them one at a time
 * instead of leaving the page.
 *
 * 🔴 The parameter is cleared once it has been consumed. Without that,
 * dismissing the panel and pressing reload would open it again, which reads as
 * a panel that cannot be closed.
 */
export function useSelectedRecord(): [
	string | null,
	(id: string | null) => void,
] {
	const navigate = useNavigate();
	// `strict: false` because this hook is called from view components, which
	// sit under several different routes and share no search schema.
	const search = useSearch({ strict: false }) as { record?: string };
	const wanted = search.record ?? null;
	const [selected, setSelected] = useState<string | null>(wanted);

	useEffect(() => {
		if (!wanted) return;
		setSelected(wanted);
		/**
		 * ⚠️ Cast, because this hook is route-agnostic on purpose. Each route
		 * declares its own search schema and none of them know about `record` —
		 * the whole point is that one hook serves twelve views under four
		 * different routes.
		 */
		void navigate({
			to: ".",
			search: ((current: Record<string, unknown>) => ({
				...current,
				record: undefined,
			})) as never,
			replace: true,
		});
	}, [wanted, navigate]);

	return [selected, setSelected];
}
