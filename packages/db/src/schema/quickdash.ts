/**
 * Reserved for QuickDash-specific platform tables.
 *
 * `quickdash_workspaces` lived here and was dropped on 2026-08-01 — it had zero
 * rows in production and zero references in application code. A workspace is
 * `quickengine_workspaces`; this was a second, empty definition of the same idea
 * that nothing ever adopted.
 */
export {};
