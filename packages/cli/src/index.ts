#!/usr/bin/env node
import { QuickApiError } from "@quickengine/quick";
import { Command } from "commander";
import { registerCatalogCommands } from "./commands/catalog";
import { registerClientCommands } from "./commands/clients";
import { registerConfigCommands } from "./commands/config";
import { registerDoctorCommand } from "./commands/doctor";
import { errorLine } from "./output";

const program = new Command();

program
	.name("quick")
	.description(
		"The QuickEngine command-line tool. Configure a workspace credential and read product APIs.",
	)
	.version("0.1.0");

registerConfigCommands(program);
registerClientCommands(program);
registerCatalogCommands(program);
registerDoctorCommand(program);

async function main(): Promise<void> {
	try {
		await program.parseAsync(process.argv);
	} catch (error) {
		if (error instanceof QuickApiError) {
			errorLine(`Error: ${error.message} (${error.code})`);
			if (error.requestId) errorLine(`Request id: ${error.requestId}`);
		} else if (error instanceof Error) {
			errorLine(`Error: ${error.message}`);
		} else {
			errorLine("An unknown error occurred.");
		}
		process.exitCode = 1;
	}
}

void main();
