/**
 * Turning a list on screen into a file, and a file back into rows.
 *
 * 🔑 Export runs entirely in the BROWSER, over the rows the page already
 * fetched. That is deliberate: it means what you download is exactly what you
 * were looking at, filters and all, rather than a second server-side query that
 * quietly disagrees with the screen. It also means every list page gets export
 * with no new endpoint, no new permission and nothing to keep in sync.
 *
 * ⚠️ The limit of that choice: you export the page's loaded rows, not the whole
 * table behind them. A list that pages server-side exports the pages you have
 * loaded. Anything bigger belongs in a real server-side export job, which is a
 * different feature with a different shape.
 */

/** Values a spreadsheet can hold. Everything else is dropped, not stringified. */
function cell(value: unknown): string {
	if (value === null || value === undefined) return "";
	if (value instanceof Date) return value.toISOString();
	if (typeof value === "boolean") return value ? "true" : "false";
	if (typeof value === "number")
		return Number.isFinite(value) ? String(value) : "";
	if (typeof value === "string") return value;
	// 🔴 Objects and arrays are NOT flattened into "[object Object]". A column of
	// that is worse than no column: it looks like data and carries none.
	return "";
}

/**
 * RFC 4180 quoting.
 *
 * ⚠️ A field is quoted when it contains a comma, a quote or a newline — and a
 * literal quote is doubled, not escaped with a backslash. Getting this wrong is
 * how an address with a comma in it silently becomes two columns.
 */
function quote(value: string): string {
	return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

/** Which keys to write, in order: every scalar any row actually carries. */
function headersFor(rows: ReadonlyArray<Record<string, unknown>>): string[] {
	const seen = new Set<string>();
	for (const row of rows) {
		for (const [key, value] of Object.entries(row)) {
			// A key present on every row but always an object is not a column.
			if (value === null || value === undefined) {
				if (!seen.has(key)) seen.add(key);
				continue;
			}
			if (
				typeof value === "object" &&
				!(value instanceof Date) &&
				!Array.isArray(value)
			) {
				continue;
			}
			if (Array.isArray(value)) continue;
			seen.add(key);
		}
	}
	return [...seen];
}

export function toCsv(rows: ReadonlyArray<Record<string, unknown>>): string {
	if (rows.length === 0) return "";
	const headers = headersFor(rows);
	const lines = [headers.map(quote).join(",")];
	for (const row of rows) {
		lines.push(headers.map((key) => quote(cell(row[key]))).join(","));
	}
	// CRLF, because Excel on Windows treats a bare LF file as one long row.
	return `${lines.join("\r\n")}\r\n`;
}

/**
 * Hand the file to the browser.
 *
 * ⚠️ The object URL is revoked on the next frame, not immediately: Safari has
 * not started the download by the time the click handler returns, and revoking
 * synchronously produces a silently empty file.
 */
export function downloadCsv(
	name: string,
	rows: ReadonlyArray<Record<string, unknown>>,
): void {
	const blob = new Blob([toCsv(rows)], { type: "text/csv;charset=utf-8" });
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = `${name}-${new Date().toISOString().slice(0, 10)}.csv`;
	document.body.append(link);
	link.click();
	link.remove();
	requestAnimationFrame(() => URL.revokeObjectURL(url));
}

/**
 * Read a CSV back into rows.
 *
 * 🔴 A hand-written parser rather than `split(",")`, because a quoted field can
 * contain commas AND newlines — so the file cannot even be split into lines
 * before it is parsed. Every importer that starts with `split("\n")` corrupts
 * the first address it meets.
 */
export function parseCsv(text: string): Array<Record<string, string>> {
	const rows: string[][] = [];
	let row: string[] = [];
	let field = "";
	let quoted = false;

	// Strip a UTF-8 BOM, which Excel writes and which would otherwise become
	// part of the first header's name.
	const source = text.replace(/^﻿/, "");

	for (let index = 0; index < source.length; index += 1) {
		const char = source[index];
		if (quoted) {
			if (char === '"') {
				if (source[index + 1] === '"') {
					field += '"';
					index += 1;
				} else {
					quoted = false;
				}
			} else {
				field += char;
			}
			continue;
		}
		if (char === '"') {
			quoted = true;
		} else if (char === ",") {
			row.push(field);
			field = "";
		} else if (char === "\n" || char === "\r") {
			// Consume CRLF as one break.
			if (char === "\r" && source[index + 1] === "\n") index += 1;
			row.push(field);
			rows.push(row);
			row = [];
			field = "";
		} else {
			field += char;
		}
	}
	if (field !== "" || row.length > 0) {
		row.push(field);
		rows.push(row);
	}

	const [headers, ...body] = rows.filter((entry) =>
		entry.some((value) => value.trim() !== ""),
	);
	if (!headers) return [];
	return body.map((entry) =>
		Object.fromEntries(
			headers.map((header, position) => [
				header.trim(),
				(entry[position] ?? "").trim(),
			]),
		),
	);
}
