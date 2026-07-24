const REDACTED = "[REDACTED]";
const SENSITIVE_KEYS = new Set([
	"apikey",
	"authorization",
	"cookie",
	"idempotencykey",
	"password",
	"secret",
	"set-cookie",
	"token",
]);

export type LogLevel = "debug" | "info" | "warn" | "error";
export type LogFields = Record<string, unknown>;

export type ApiLogger = {
	debug(message: string, fields?: LogFields): void;
	info(message: string, fields?: LogFields): void;
	warn(message: string, fields?: LogFields): void;
	error(message: string, fields?: LogFields): void;
};

type LogSink = (line: string) => void;

const LEVEL_WEIGHT: Record<LogLevel, number> = {
	debug: 10,
	info: 20,
	warn: 30,
	error: 40,
};

function shouldRedact(key: string): boolean {
	const normalized = key.toLowerCase().replaceAll(/[-_]/g, "");
	return [...SENSITIVE_KEYS].some((sensitive) =>
		normalized.includes(sensitive.replace("-", "")),
	);
}

export function redact(
	value: unknown,
	key = "",
	seen = new WeakSet<object>(),
): unknown {
	if (shouldRedact(key)) return REDACTED;
	if (value === null || typeof value !== "object") return value;
	if (value instanceof Error) {
		return { message: value.message, name: value.name };
	}
	if (seen.has(value)) return "[CIRCULAR]";
	seen.add(value);

	if (Array.isArray(value)) {
		return value.map((item) => redact(item, key, seen));
	}

	return Object.fromEntries(
		Object.entries(value).map(([childKey, childValue]) => [
			childKey,
			redact(childValue, childKey, seen),
		]),
	);
}

export function createJsonLogger(options: {
	level: LogLevel;
	service: string;
	sink?: LogSink;
}): ApiLogger {
	const sink = options.sink ?? ((line) => console.log(line));

	function write(level: LogLevel, message: string, fields: LogFields = {}) {
		if (LEVEL_WEIGHT[level] < LEVEL_WEIGHT[options.level]) return;
		sink(
			JSON.stringify({
				timestamp: new Date().toISOString(),
				level,
				service: options.service,
				message,
				...(redact(fields) as LogFields),
			}),
		);
	}

	return {
		debug: (message, fields) => write("debug", message, fields),
		info: (message, fields) => write("info", message, fields),
		warn: (message, fields) => write("warn", message, fields),
		error: (message, fields) => write("error", message, fields),
	};
}

export const noopLogger: ApiLogger = {
	debug() {},
	info() {},
	warn() {},
	error() {},
};
