/**
 * How long removed things are kept before a sweep collects them.
 *
 * 🔴 Its own module, with NO imports, and that is the point. This used to live
 * beside the queries in `workspace-assets.ts`, which imports the database
 * client, which reads `DATABASE_URL` at import time. A test that only wanted
 * the number dragged a live connection into its module graph and failed in CI
 * where no database is configured, while passing locally where one is.
 *
 * Anything a test might want to assert about policy belongs here rather than
 * next to the code that acts on it.
 */

/**
 * How long a removed media file is kept before the sweep collects it.
 *
 * 🔴 24 HOURS, not weeks. Undo is offered in the screen where the removal
 * happened and disappears when somebody leaves it, so leaving a product page is
 * itself the confirmation. A window measured in weeks would only mean carrying
 * bytes we pay for against a recovery nobody can still ask for.
 *
 * ⚠️ The day is a buffer for the tab closed by accident, not a policy anybody
 * is told about. If undo ever becomes something findable later, this has to
 * grow to match it.
 *
 * ⚠️ Independent of how often the SWEEP runs. The sweep only collects things
 * already past this cutoff, so running it every five minutes deletes nothing
 * early; it just keeps the bucket tidy.
 */
export const PURGE_AFTER_HOURS = 24;
