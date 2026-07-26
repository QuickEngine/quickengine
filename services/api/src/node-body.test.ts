import type { IncomingMessage } from "node:http";
import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import { readNodeRequestBody } from "./node-body";

const asRequest = (stream: Readable): IncomingMessage =>
	stream as unknown as IncomingMessage;

describe("readNodeRequestBody", () => {
	it("returns the body exactly as it arrived", async () => {
		const raw = '{"b":2,"a":1}';
		const body = await readNodeRequestBody(
			asRequest(Readable.from([Buffer.from(raw)])),
		);
		expect(body && Buffer.from(body).toString()).toBe(raw);
	});

	/**
	 * The property Stripe and Inngest depend on. Both sign the exact bytes they
	 * send, so key order and whitespace must survive untouched — anything that
	 * parses and re-serializes breaks every signature check.
	 */
	it("preserves byte-for-byte content across chunk boundaries", async () => {
		const raw = '{ "z" : 1,\n  "a"  :  2 }';
		const half = Math.floor(raw.length / 2);
		const body = await readNodeRequestBody(
			asRequest(
				Readable.from([
					Buffer.from(raw.slice(0, half)),
					Buffer.from(raw.slice(half)),
				]),
			),
		);
		expect(body && Buffer.from(body).toString()).toBe(raw);
	});

	it("keeps binary payloads intact", async () => {
		const bytes = Buffer.from([0x00, 0xff, 0x10, 0x7f, 0x00]);
		const body = await readNodeRequestBody(asRequest(Readable.from([bytes])));
		expect(body && Buffer.from(body).equals(bytes)).toBe(true);
	});

	it("returns undefined when there is no body", async () => {
		expect(await readNodeRequestBody(asRequest(Readable.from([])))).toBe(
			undefined,
		);
	});

	/**
	 * The regression this file exists for: an already-finished stream must resolve
	 * immediately rather than waiting for an end that will never come. The previous
	 * adapter hung here until the request deadline killed it.
	 */
	it("resolves immediately on an already-consumed stream", async () => {
		const stream = Readable.from([Buffer.from("consumed")]);
		for await (const _ of stream) {
			// drain it first
		}
		const started = Date.now();
		const body = await readNodeRequestBody(asRequest(stream));
		expect(body).toBe(undefined);
		expect(Date.now() - started).toBeLessThan(1000);
	});

	it("accepts string chunks", async () => {
		const body = await readNodeRequestBody(asRequest(Readable.from(["hi"])));
		expect(body && Buffer.from(body).toString()).toBe("hi");
	});
});
