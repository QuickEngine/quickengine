import { inngest, inngestFunctions } from "@quickengine/jobs";
import { serve } from "inngest/next";

// Inngest calls back this endpoint to run our durable functions. The signing key
// (INNGEST_SIGNING_KEY) is read from the environment by the SDK to verify requests.
export const runtime = "nodejs";

export const { GET, POST, PUT } = serve({
	client: inngest,
	functions: inngestFunctions,
});
