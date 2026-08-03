import { testDbClient } from "@quickengine/db/testing";
import { beforeEach, describe, expect, it } from "vitest";
import {
	deleteContentEntry,
	getPublishedContent,
	listAllContent,
	listPublishedContent,
	registerContentManifest,
	setContentPublished,
	upsertContentEntry,
} from "../src";

const ownerId = "content-owner";
const workspaceId = "00000000-0000-4000-8000-0000000009a1";
const otherWorkspaceId = "00000000-0000-4000-8000-0000000009a2";

beforeEach(async () => {
	const sql = testDbClient();
	await sql`insert into quickengine_users (id, name, email, email_verified) values (${ownerId}, 'Content Owner', 'content@example.com', true)`;
	await sql`insert into quickengine_workspaces (id, owner_id, name, business_type) values (${workspaceId}, ${ownerId}, 'Gems', 'custom'), (${otherWorkspaceId}, ${ownerId}, 'Other', 'custom')`;
});

describe("drafts never reach a public page", () => {
	it("hides an unpublished slot from the storefront read", async () => {
		await upsertContentEntry(workspaceId, {
			key: "about.body",
			value: "Half a sentence that is not ready",
		});

		// The public map and the single read both refuse it.
		expect(await listPublishedContent(workspaceId)).toEqual({});
		expect(await getPublishedContent(workspaceId, "about.body")).toBeNull();

		// The operator still sees it, which is the point of a draft.
		const all = await listAllContent(workspaceId);
		expect(all).toHaveLength(1);
		expect(all[0].published).toBe(false);
	});

	it("shows it the moment it is published, without touching the words", async () => {
		await upsertContentEntry(workspaceId, {
			key: "about.body",
			value: "We have sourced gemstones since 2019.",
		});
		const updated = await setContentPublished(
			workspaceId,
			["about.body"],
			true,
		);
		expect(updated).toBe(1);
		expect(await getPublishedContent(workspaceId, "about.body")).toBe(
			"We have sourced gemstones since 2019.",
		);
	});
});

describe("tenancy", () => {
	it("never returns another workspace's content", async () => {
		await upsertContentEntry(otherWorkspaceId, {
			key: "about.body",
			value: "Somebody else's words",
			published: true,
		});
		expect(await listPublishedContent(workspaceId)).toEqual({});
		expect(await getPublishedContent(workspaceId, "about.body")).toBeNull();
	});

	it("lets two workspaces hold the same key independently", async () => {
		await upsertContentEntry(workspaceId, {
			key: "about.body",
			value: "Ours",
			published: true,
		});
		await upsertContentEntry(otherWorkspaceId, {
			key: "about.body",
			value: "Theirs",
			published: true,
		});
		expect(await getPublishedContent(workspaceId, "about.body")).toBe("Ours");
		expect(await getPublishedContent(otherWorkspaceId, "about.body")).toBe(
			"Theirs",
		);
	});

	it("refuses to delete across a workspace boundary", async () => {
		await upsertContentEntry(otherWorkspaceId, {
			key: "legal.returns",
			value: "Theirs",
		});
		expect(await deleteContentEntry(workspaceId, "legal.returns")).toBe(false);
		expect(await listAllContent(otherWorkspaceId)).toHaveLength(1);
	});
});

describe("a manifest declares shape, never content", () => {
	it("does not wipe words an operator already wrote", async () => {
		// 🔴 The failure that makes a slot system infuriating: a site redeploys,
		// re-registers its manifest, and the client's copy vanishes.
		await upsertContentEntry(workspaceId, {
			key: "about.body",
			value: "Words the owner typed",
			published: true,
		});

		await registerContentManifest(workspaceId, [
			{
				key: "about.body",
				type: "richtext",
				label: "About — body",
				group: "About",
			},
		]);

		expect(await getPublishedContent(workspaceId, "about.body")).toBe(
			"Words the owner typed",
		);
		const [entry] = await listAllContent(workspaceId);
		// The declaration still applied — label and type updated.
		expect(entry.label).toBe("About — body");
		expect(entry.type).toBe("richtext");
	});

	it("creates slots that do not exist yet, unpublished", async () => {
		const result = await registerContentManifest(workspaceId, [
			{ key: "home.hero.subtitle", label: "Hero subtitle", group: "Home" },
			{ key: "legal.returns", type: "richtext", group: "Legal" },
		]);
		expect(result.registered).toBe(2);
		// Declared but empty, so nothing appears on the site until somebody writes.
		expect(await listPublishedContent(workspaceId)).toEqual({});
		expect(await listAllContent(workspaceId)).toHaveLength(2);
	});

	it("is idempotent — registering twice makes two slots, not four", async () => {
		const slots = [{ key: "a.one" }, { key: "a.two" }];
		await registerContentManifest(workspaceId, slots);
		await registerContentManifest(workspaceId, slots);
		expect(await listAllContent(workspaceId)).toHaveLength(2);
	});
});

describe("lists", () => {
	it("stores an ordered list in one slot", async () => {
		// FAQ and testimonials are lists, which is why `kind` exists from the
		// start — retrofitting it onto a scalar-only table would be a migration.
		await upsertContentEntry(workspaceId, {
			key: "faq.items",
			kind: "list",
			type: "json",
			published: true,
			value: [
				{ question: "Do you ship to the US?", answer: "Yes." },
				{ question: "Are the gems certified?", answer: "Every one." },
			],
		});
		const value = (await getPublishedContent(workspaceId, "faq.items")) as {
			question: string;
		}[];
		expect(value).toHaveLength(2);
		// Order is the array's order — no sort key, no separate table.
		expect(value[0].question).toBe("Do you ship to the US?");
	});
});

describe("partial updates", () => {
	it("saving a label leaves the copy alone", async () => {
		await upsertContentEntry(workspaceId, {
			key: "about.body",
			value: "Original copy",
			published: true,
		});
		await upsertContentEntry(workspaceId, {
			key: "about.body",
			label: "About — body text",
		});
		expect(await getPublishedContent(workspaceId, "about.body")).toBe(
			"Original copy",
		);
		const [entry] = await listAllContent(workspaceId);
		expect(entry.label).toBe("About — body text");
		// And publishing survived, because it was not supplied.
		expect(entry.published).toBe(true);
	});
});

describe("keys", () => {
	it("rejects a key that would be unsafe or unpredictable in a URL", async () => {
		for (const key of ["About Body", "about/body", "../etc", ""]) {
			await expect(
				upsertContentEntry(workspaceId, { key, value: "x" }),
			).rejects.toThrow();
		}
	});
});
