import {
	CarrierError,
	decimalStringToCents,
	shippoCarrier,
} from "../src/index";

const apiToken = process.env.SHIPPO_TEST_TOKEN;
if (!apiToken) throw new Error("SHIPPO_TEST_TOKEN is required");
const credentials = { apiToken };

let failures = 0;
const check = (label: string, ok: boolean, detail = "") => {
	console.log(
		`${ok ? "ok   " : "FAIL "} ${label}${detail ? ` — ${detail}` : ""}`,
	);
	if (!ok) failures++;
};

// ── the money parsing, which is the part that must not be wrong ──────────────
for (const [input, expected] of [
	["63.94", 6394],
	["9.5", 950],
	["12", 1200],
	["0.07", 7],
	["1234.56", 123456],
	["10.999", 1099], // truncated, never rounded up
] as const) {
	check(
		`decimalStringToCents(${input}) = ${expected}`,
		decimalStringToCents(input) === expected,
		String(decimalStringToCents(input)),
	);
}
try {
	decimalStringToCents("free");
	check("unparseable price throws rather than reading as free", false);
} catch (error) {
	check(
		"unparseable price throws rather than reading as free",
		error instanceof CarrierError,
	);
}

// ── the live account ─────────────────────────────────────────────────────────
try {
	await shippoCarrier.verifyCredentials({ credentials });
	check("verifyCredentials accepts a real token", true);
} catch (error) {
	check("verifyCredentials accepts a real token", false, String(error));
}

try {
	await shippoCarrier.verifyCredentials({
		credentials: { apiToken: "shippo_test_definitelynotarealtoken" },
	});
	check("verifyCredentials rejects a bad token", false, "it accepted one");
} catch (error) {
	check(
		"verifyCredentials rejects a bad token",
		error instanceof CarrierError && error.code === "CARRIER_NOT_CONFIGURED",
		error instanceof CarrierError ? error.code : String(error),
	);
}

// ── a real quote ─────────────────────────────────────────────────────────────
const from = {
	name: "Caffeinate",
	line1: "215 Clayton St NE",
	city: "Atlanta",
	region: "GA",
	postalCode: "30307",
	countryCode: "US",
	phone: "+14035550100",
};
const to = {
	name: "Ada Lovelace",
	line1: "965 Mission St",
	line2: "Ste 480",
	city: "San Francisco",
	region: "CA",
	postalCode: "94103",
	countryCode: "US",
};
const parcels = [
	{ lengthMm: 200, widthMm: 150, heightMm: 100, weightGrams: 500 },
];

try {
	const rates = await shippoCarrier.quote({ credentials, from, to, parcels });
	check(
		"quote returns real carrier rates",
		rates.length > 0,
		`${rates.length} rates`,
	);
	check(
		"every rate has integer cents",
		rates.every((r) => Number.isInteger(r.amountCents) && r.amountCents > 0),
	);
	check(
		"every rate names a carrier and a service",
		rates.every((r) => r.carrier.length > 0 && r.service.length > 0),
	);
	check(
		"every rate carries an id a label could be bought against",
		rates.every((r) => r.carrierRateId.length > 0),
	);
	const cheapest = [...rates].sort((a, b) => a.amountCents - b.amountCents)[0];
	console.log(
		`     cheapest: ${cheapest.carrier} ${cheapest.service} $${(cheapest.amountCents / 100).toFixed(2)} ${cheapest.currency}, ~${cheapest.estimatedDaysMin}d`,
	);
} catch (error) {
	check("quote returns real carrier rates", false, String(error));
}

// ── a destination nobody serves must REFUSE, not return nothing ──────────────
try {
	await shippoCarrier.quote({
		credentials,
		from,
		to: { ...to, postalCode: "00000", city: "Nowhere", region: "ZZ" },
		parcels,
	});
	check(
		"an unservable address refuses rather than quoting free",
		false,
		"it quoted",
	);
} catch (error) {
	check(
		"an unservable address refuses rather than quoting free",
		error instanceof CarrierError,
		error instanceof CarrierError ? error.code : String(error),
	);
}

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
