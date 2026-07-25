import {
	cancel,
	intro,
	isCancel,
	log,
	note,
	outro,
	select,
	text,
} from "@clack/prompts";
import type { Command, Option } from "commander";

/**
 * The guided runner: `quick` with no arguments.
 *
 * The surface is 19 command groups and still growing, and nobody memorises that.
 * This walks group → command → arguments instead.
 *
 * **It reads the real command tree** rather than a parallel list of what the CLI
 * can do. A hand-maintained menu drifts the first time someone adds a command and
 * forgets to update it — and a menu that omits a command is worse than no menu,
 * because it implies the command does not exist.
 */

type Answer<T> = T | symbol;

function ensure<T>(value: Answer<T>): T {
	if (isCancel(value)) {
		cancel("Cancelled.");
		process.exit(0);
	}
	return value as T;
}

/** Commander marks help/version as hidden; those are not user destinations. */
const selectable = (command: Command): Command[] =>
	command.commands.filter(
		(child) => !(child as Command & { _hidden?: boolean })._hidden,
	);

/**
 * Whether an option takes a value.
 *
 * `Option.required` means "if you pass this flag, it needs a value" — *not* that
 * the flag itself is mandatory. Treating it as mandatory would make the runner
 * demand input the command never required.
 */
const takesValue = (option: Option): boolean =>
	option.flags.includes("<") || option.flags.includes("[");

/** Quote only when needed, so the printed command is copy-pasteable as-is. */
const quote = (value: string): string =>
	/[\s"'$`\\]/.test(value) ? `'${value.replace(/'/g, "'\\''")}'` : value;

async function collectArguments(command: Command): Promise<string[]> {
	const parts: string[] = [];

	for (const argument of command.registeredArguments) {
		const value = ensure(
			await text({
				message: `${argument.name()}${argument.required ? "" : " (optional)"}`,
				placeholder: argument.description || undefined,
				validate: (input) =>
					argument.required && !(input ?? "").trim() ? "Required." : undefined,
			}),
		);
		if (value.trim()) parts.push(quote(value.trim()));
	}

	const options = command.options.filter((option) => option.long !== "--help");
	for (const option of options) {
		if (!takesValue(option)) {
			// A boolean flag: offer it, do not demand it.
			const enable = ensure(
				await select({
					message: `${option.long}${option.description ? ` — ${option.description}` : ""}`,
					options: [
						{ value: false, label: "no" },
						{ value: true, label: "yes" },
					],
					initialValue: false,
				}),
			);
			if (enable) parts.push(option.long as string);
			continue;
		}

		const value = ensure(
			await text({
				message: `${option.long} (optional)`,
				placeholder: option.description || undefined,
			}),
		);
		if (value.trim()) parts.push(`${option.long} ${quote(value.trim())}`);
	}

	return parts;
}

/**
 * Walk the tree and run what the user picked.
 *
 * The chosen command is printed before running so the next invocation can be
 * typed directly — the runner should make itself unnecessary, not become the only
 * way in.
 */
export async function runGuided(program: Command): Promise<void> {
	intro("QuickEngine CLI");

	const groups = selectable(program);
	if (groups.length === 0) {
		outro("No commands are registered.");
		return;
	}

	const group = ensure(
		await select({
			message: "What do you want to work with?",
			options: groups.map((command) => ({
				value: command,
				label: command.name(),
				hint: command.description() || undefined,
			})),
		}),
	);

	// A group with no subcommands is itself the action.
	const children = selectable(group);
	const command = children.length
		? ensure(
				await select({
					message: `${group.name()} — which action?`,
					options: children.map((child) => ({
						value: child,
						label: child.name(),
						hint: child.description() || undefined,
					})),
				}),
			)
		: group;

	const parts = await collectArguments(command);
	const path =
		command === group ? [group.name()] : [group.name(), command.name()];
	const line = ["quick", ...path, ...parts].join(" ");

	note(line, "Running");

	try {
		await program.parseAsync([...path, ...parts], { from: "user" });
		outro("Done.");
	} catch (error) {
		log.error(error instanceof Error ? error.message : String(error));
		outro("That command failed.");
		process.exitCode = 1;
	}
}
