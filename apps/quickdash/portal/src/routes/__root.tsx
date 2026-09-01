import { MobileNotice } from "@quickengine/ui";
import { createRootRoute, Outlet } from "@tanstack/react-router";

export const Route = createRootRoute({
	component: () => (
		<>
			<Outlet />
			{/* Every surface was designed at desktop width first, and the small
			    screen passes have not been done. Saying so is the difference between
			    a product that is under construction and one that looks broken. */}
			<MobileNotice />
		</>
	),
});
