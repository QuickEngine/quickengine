import { eventDispatchFunctions } from "@quickengine/event-dispatch";
import { inngest, inngestFunctions } from "@quickengine/jobs";
import { serve } from "inngest/next";

// Inngest calls back this endpoint to run our durable functions. The signing key
// (INNGEST_SIGNING_KEY) is read from the environment by the SDK to verify requests.
//
// This is a transport shell only: the functions themselves live in packages, so
// the endpoint moves to the Hono API service without rewriting any of them.
export const runtime = "nodejs";

export const { GET, POST, PUT } = serve({
	client: inngest,
	functions: [...inngestFunctions, ...eventDispatchFunctions],
});
