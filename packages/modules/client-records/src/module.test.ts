import { describe, expect, it } from "vitest";
import { clientRecordsModule, clientRecordsSettingsSchema } from "./module";

// Pure settings/manifest tests (no DB). The DB-backed create/metering path gets a
// DB harness later.
describe("client-records settings", () => {
	it("applies sensible defaults", () => {
		const settings = clientRecordsSettingsSchema.parse({});
		expect(settings.recordLabelSingular).toBe("Customer");
		expect(settings.recordLabelPlural).toBe("Customers");
		expect(settings.fields).toEqual({
			phone: true,
			company: true,
			notes: true,
		});
	});

	it("lets a workspace relabel records + toggle fields", () => {
		const settings = clientRecordsSettingsSchema.parse({
			recordLabelSingular: "Client",
			recordLabelPlural: "Clients",
			fields: { phone: false, company: true, notes: true },
		});
		expect(settings.recordLabelSingular).toBe("Client");
		expect(settings.fields.phone).toBe(false);
	});

	it("rejects an empty label", () => {
		expect(() =>
			clientRecordsSettingsSchema.parse({ recordLabelSingular: "" }),
		).toThrow();
	});
});

describe("client-records manifest", () => {
	it("exposes a stable identity + metered action", () => {
		expect(clientRecordsModule.id).toBe("client-records");
		expect(clientRecordsModule.kind).toBe("shared");
		expect(clientRecordsModule.meteredAction).toBe("client_record.created");
	});
});
