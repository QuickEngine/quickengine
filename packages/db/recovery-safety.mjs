import {
	closeSync,
	openSync,
	realpathSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";

export function formatProviderError(provider, method, path, status) {
	return `${provider} ${method} ${path} failed with status ${status}`;
}

export function assertPrivateOutputPath(file, repositoryRoot) {
	if (!file) throw new Error("An output path is required.");

	const root = realpathSync(repositoryRoot);
	const parent = realpathSync(dirname(resolve(file)));
	const destination = resolve(parent, file.split(sep).at(-1));
	const fromRoot = relative(root, destination);

	if (
		fromRoot === "" ||
		(!fromRoot.startsWith(`..${sep}`) && fromRoot !== "..")
	) {
		throw new Error(
			"Recovery artifacts contain customer data and must be written outside the repository.",
		);
	}

	return destination;
}

export function writePrivateJson(file, value, repositoryRoot) {
	const destination = assertPrivateOutputPath(file, repositoryRoot);
	let descriptor;
	try {
		descriptor = openSync(destination, "wx", 0o600);
		writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`, "utf8");
		closeSync(descriptor);
		descriptor = undefined;
		return destination;
	} catch (error) {
		if (descriptor !== undefined) closeSync(descriptor);
		try {
			unlinkSync(destination);
		} catch {}
		throw error;
	}
}
