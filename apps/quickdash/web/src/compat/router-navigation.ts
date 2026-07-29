import { useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { useCallback, useMemo, useRef } from "react";

export function useRouter() {
	const navigate = useNavigate();
	const navigateRef = useRef(navigate);
	navigateRef.current = navigate;
	const queryClient = useQueryClient();
	const back = useCallback(() => window.history.back(), []);
	const push = useCallback((href: string) => navigateRef.current({ href }), []);
	const replace = useCallback(
		(href: string) => navigateRef.current({ href, replace: true }),
		[],
	);
	const refresh = useCallback(async () => {
		await queryClient.invalidateQueries();
	}, [queryClient]);
	return useMemo(
		() => ({ back, push, refresh, replace }),
		[back, push, refresh, replace],
	);
}

export function usePathname() {
	return useLocation({ select: (location) => location.pathname });
}
