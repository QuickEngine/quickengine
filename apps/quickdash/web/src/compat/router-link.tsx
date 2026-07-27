import { Link as TanStackLink } from "@tanstack/react-router";
import type { ComponentProps } from "react";

type Props = Omit<ComponentProps<"a">, "href"> & { href: string };

export default function Link({ href, children, ...props }: Props) {
	return (
		<TanStackLink to={href} {...props}>
			{children}
		</TanStackLink>
	);
}
