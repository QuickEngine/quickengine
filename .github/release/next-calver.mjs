import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const CALVER_PATTERN = /^(\d{4})\.(\d{1,2})\.(\d+)$/;

export function nextCalver(tags, year, month) {
	if (!Number.isInteger(year) || year < 1) {
		throw new TypeError("year must be a positive integer");
	}
	if (!Number.isInteger(month) || month < 1 || month > 12) {
		throw new TypeError("month must be an integer from 1 through 12");
	}

	let highestCounter = 0;
	for (const tag of tags) {
		const match = CALVER_PATTERN.exec(tag.trim());
		if (!match) {
			continue;
		}

		const [, tagYear, tagMonth, tagCounter] = match;
		if (Number(tagYear) === year && Number(tagMonth) === month) {
			highestCounter = Math.max(highestCounter, Number(tagCounter));
		}
	}

	return `${year}.${month}.${highestCounter + 1}`;
}

function parseArguments(arguments_) {
	let date;
	let tagsFile;

	for (let index = 0; index < arguments_.length; index += 1) {
		const argument = arguments_[index];
		if (argument === "--date") {
			date = arguments_[index + 1];
			index += 1;
		} else if (argument === "--tags-file") {
			tagsFile = arguments_[index + 1];
			index += 1;
		} else {
			throw new Error(`Unknown argument: ${argument}`);
		}
	}

	if (!date || !tagsFile) {
		throw new Error("Usage: next-calver.mjs --date YYYY-MM --tags-file PATH");
	}

	const match = /^(\d{4})-(\d{2})$/.exec(date);
	if (!match) {
		throw new Error("--date must use YYYY-MM");
	}

	return { year: Number(match[1]), month: Number(match[2]), tagsFile };
}

async function main() {
	const { year, month, tagsFile } = parseArguments(process.argv.slice(2));
	const tags = (await readFile(tagsFile, "utf8"))
		.split(/\r?\n/)
		.filter(Boolean);
	process.stdout.write(`${nextCalver(tags, year, month)}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
	main().catch((error) => {
		process.stderr.write(
			`${error instanceof Error ? error.message : String(error)}\n`,
		);
		process.exitCode = 1;
	});
}
