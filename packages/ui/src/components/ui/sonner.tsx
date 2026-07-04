"use client";

import {
	CircleCheckIcon,
	InfoIcon,
	Loader2Icon,
	OctagonXIcon,
	TriangleAlertIcon,
} from "lucide-react";
import { useTheme } from "next-themes";
import { Toaster as Sonner, type ToasterProps } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => {
	const { theme = "system" } = useTheme();

	return (
		<Sonner
			theme={theme as ToasterProps["theme"]}
			position="top-center"
			className="toaster group"
			gap={4}
			icons={{
				success: <CircleCheckIcon className="size-3.5" />,
				info: <InfoIcon className="size-3.5" />,
				warning: <TriangleAlertIcon className="size-3.5" />,
				error: <OctagonXIcon className="size-3.5" />,
				loading: <Loader2Icon className="size-3.5 animate-spin" />,
			}}
			toastOptions={{
				className: "!py-2 !px-3 text-xs",
			}}
			style={
				{
					"--normal-bg": "var(--popover)",
					"--normal-text": "var(--popover-foreground)",
					"--normal-border": "var(--border)",
					"--border-radius": "var(--radius)",
				} as React.CSSProperties
			}
			{...props}
		/>
	);
};

export { Toaster };
