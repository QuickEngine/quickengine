#!/usr/bin/env node
import { QuickApiError } from "@quickengine/quick";
import { Command } from "commander";
import { registerBookingCommands } from "./commands/bookings";
import { registerCatalogCommands } from "./commands/catalog";
import { registerClientCommands } from "./commands/clients";
import { registerConfigCommands } from "./commands/config";
import { registerContractCommands } from "./commands/contracts";
import { registerDoctorCommand } from "./commands/doctor";
import { registerFileCommands } from "./commands/files";
import { registerFulfillmentCommands } from "./commands/fulfillments";
import { registerInventoryCommands } from "./commands/inventory";
import { registerInvoiceCommands } from "./commands/invoices";
import { registerOrderCommands } from "./commands/orders";
import { registerPaymentCommands } from "./commands/payments";
import { registerProjectCommands } from "./commands/projects";
import { registerQuoteCommands } from "./commands/quotes";
import { registerReportCommands } from "./commands/reports";
import { registerShipmentCommands } from "./commands/shipments";
import { registerTimeCommands } from "./commands/time";
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
registerQuoteCommands(program);
registerInvoiceCommands(program);
registerPaymentCommands(program);
registerOrderCommands(program);
registerFulfillmentCommands(program);
registerInventoryCommands(program);
registerShipmentCommands(program);
registerProjectCommands(program);
registerBookingCommands(program);
registerTimeCommands(program);
registerContractCommands(program);
registerFileCommands(program);
registerReportCommands(program);
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
