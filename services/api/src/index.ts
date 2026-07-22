import { createApp } from "./app";
import { loadApiConfig } from "./config";

const app = createApp(loadApiConfig());

export default app;
export { createApp } from "./app";
export { loadApiConfig } from "./config";
