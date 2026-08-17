import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import { createBodyLimit } from "./body-limit";

/**
 * 🔴 The 1 MiB JSON limit rejected every real product photograph.
 *
 * The image route validates against 10 MB and says so to the operator, but this
 * middleware runs first and refused at 1 MiB — so "Images must be 10 MB or
 * smaller" was a promise the server could not keep, and uploading any picture
 * off a phone failed with no useful explanation.
 */
describe("body limit", () => {
	const app = new Hono();
	app.use("*", createBodyLimit(1024 * 1024));
	app.post("*", async (c) => {
		const form = await c.req.formData().catch(() => null);
		const file = form?.get("file");
		return c.json({ size: file instanceof File ? file.size : 0 });
	});

	const upload = (path: string, bytes: number) => {
		const form = new FormData();
		form.set(
			"file",
			new File([new Uint8Array(bytes)], "photo.png", {
				type: "image/png",
			}),
		);
		return app.request(path, { method: "POST", body: form });
	};

	const IMAGES =
		"/v1/quickdash/catalog/00000000-0000-4000-8000-000000000001/images";

	it("accepts a photograph far larger than the JSON limit", async () => {
		const response = await upload(IMAGES, 4 * 1024 * 1024);
		expect(response.status).toBe(200);
		expect((await response.json()).size).toBe(4 * 1024 * 1024);
	});

	it("still refuses a body beyond even the upload allowance", async () => {
		expect((await upload(IMAGES, 13 * 1024 * 1024)).status).toBe(413);
	});

	it("keeps every other route on the small limit", async () => {
		expect((await upload("/v1/catalog", 4 * 1024 * 1024)).status).toBe(413);
	});
});
