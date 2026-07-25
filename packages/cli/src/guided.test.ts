import { Command } from "commander";
import { describe, expect, it } from "vitest";

/**
 * The guided runner reads the live command tree rather than a parallel list.
 * These pin the introspection it depends on — if Commander changes shape, the
 * runner silently offers the wrong things, so the assumptions are asserted here.
 */
function fixture(): Command {
	const program = new Command();
	const clients = program
		.command("clients")
		.description("Manage client records");
	clients
		.command("create <name>")
		.description("Create a client")
		.option("--email <email>", "Email address")
		.option("--json", "Output JSON")
		.action(() => {});
	clients
		.command("list")
		.description("List clients")
		.action(() => {});
	return program;
}

describe("command introspection", () => {
	it("walks groups and their actions", () => {
		const program = fixture();
		expect(program.commands.map((c) => c.name())).toEqual(["clients"]);
		expect(program.commands[0].commands.map((c) => c.name())).toEqual([
			"create",
			"list",
		]);
	});

	it("reports which positional arguments are required", () => {
		const create = fixture().commands[0].commands[0];
		const args = create.registeredArguments.map((a) => [a.name(), a.required]);
		expect(args).toEqual([["name", true]]);
	});

	it("distinguishes value-taking options from boolean flags", () => {
		const create = fixture().commands[0].commands[0];
		const byFlag = Object.fromEntries(
			create.options.map((o) => [o.long, o.flags.includes("<")]),
		);
		// The trap: Commander's `option.required` means "the value is required IF
		// the flag is used", not that the flag itself is mandatory. Reading it as
		// mandatory would make the runner demand an email on every create.
		expect(byFlag["--email"]).toBe(true);
		expect(byFlag["--json"]).toBe(false);
		const email = create.options.find((o) => o.long === "--email");
		expect(email?.required).toBe(true);
	});

	it("carries descriptions for every level, so the menu can explain itself", () => {
		const program = fixture();
		expect(program.commands[0].description()).toBe("Manage client records");
		expect(program.commands[0].commands[0].description()).toBe(
			"Create a client",
		);
	});

	it("re-parses a chosen command from its own argument list", async () => {
		let received: string[] = [];
		const program = new Command();
		program
			.command("clients")
			.command("create <name>")
			.option("--email <email>", "Email")
			.action((name: string, options: { email?: string }) => {
				received = [name, options.email ?? ""];
			});

		// This is how the runner executes a selection — the same path a typed
		// command takes, so guided and manual invocation cannot diverge.
		await program.parseAsync(["clients", "create", "Ada", "--email", "a@b.c"], {
			from: "user",
		});
		expect(received).toEqual(["Ada", "a@b.c"]);
	});
});
