import type { ZodTypeAny } from "zod";
import type { FirstActionDescriptor } from "./first-actions";

// The shared shape every module manifest conforms to. Each module exports one of
// these (as a `const … as const`); the catalog types them against this so a
// non-conforming manifest fails typecheck. Keeps the contract honest across modules.
export type ModuleManifest = {
	id: string;
	name: string;
	description: string;
	// "shared" = every workspace can use it; "domain" = specific to a business type.
	kind: "shared" | "domain";
	// Module ids this one composes on (enabling it auto-enables these).
	dependsOn: readonly string[];
	// The metered "action", or null if the module isn't metered (most aren't).
	meteredAction: string | null;
	// Zod schema for the module's per-workspace settings.
	settingsSchema: ZodTypeAny;
	// Parsed defaults, seeded into a workspace's settings on enable.
	defaultSettings: unknown;
	/**
	 * Small, versioned paths to first value owned by this module. The dashboard resolves
	 * these against the workspace's actual enabled-module set; completion is checked by
	 * QuickDash server detectors keyed by action id, never by a clicked checkbox.
	 */
	firstActions?: readonly FirstActionDescriptor[];
};
