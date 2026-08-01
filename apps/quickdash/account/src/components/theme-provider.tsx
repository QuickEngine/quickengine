/**
 * Re-export of the shared provider.
 *
 * Account had its own copy with the same storage key. Two implementations of one
 * behaviour drift — this keeps the import path Account already uses while the
 * logic lives in one place.
 */
export { type Theme, ThemeProvider, useTheme } from "@quickengine/ui";
