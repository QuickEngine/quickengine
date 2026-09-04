import { createContext, type ReactNode, useContext } from "react";

/**
 * Who may open the developer console.
 *
 * 🔴 The console itself does NOT move. It is a docked strip across the bottom
 * because a log is the one thing you watch out of the corner of your eye while
 * working on something else, and that reasoning did not change. What moved is
 * the way in: it had a permanent icon in the console header, next to controls
 * every operator uses, and it is a developer tool that most workspaces will
 * never open. Now it is opened from the Developers page, where somebody looking
 * for it already is.
 *
 * ⚠️ A context rather than a prop, because the button lives in a routed child
 * and the open state has to stay with the shell that renders the strip.
 */
const DevConsoleContext = createContext<{
	open: boolean;
	setOpen: (open: boolean) => void;
} | null>(null);

export function DevConsoleProvider({
	open,
	setOpen,
	children,
}: {
	open: boolean;
	setOpen: (open: boolean) => void;
	children: ReactNode;
}) {
	return (
		<DevConsoleContext.Provider value={{ open, setOpen }}>
			{children}
		</DevConsoleContext.Provider>
	);
}

/** Null outside the workspace shell, so a page can simply not offer it. */
export const useDevConsole = () => useContext(DevConsoleContext);
