// Tiny output helpers so commands don't reach into process streams directly.

export function line(text = ""): void {
	process.stdout.write(`${text}\n`);
}

export function errorLine(text: string): void {
	process.stderr.write(`${text}\n`);
}

export function printJson(value: unknown): void {
	process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}
