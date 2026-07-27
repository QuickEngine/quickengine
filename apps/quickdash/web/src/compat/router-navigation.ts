import { useQueryClient } from "@tanstack/react-query";
import {
	useLocation,
	useNavigate,
	useRouter as useTanStackRouter,
} from "@tanstack/react-router";

export function useRouter() {
	const navigate = useNavigate();
	const router = useTanStackRouter();
	const queryClient = useQueryClient();
	return {
		back: () => window.history.back(),
		push: (href: string) => navigate({ href }),
		replace: (href: string) => navigate({ href, replace: true }),
		refresh: async () => {
			await queryClient.invalidateQueries();
			await router.invalidate();
		},
	};
}

export function usePathname() {
	return useLocation({ select: (location) => location.pathname });
}
