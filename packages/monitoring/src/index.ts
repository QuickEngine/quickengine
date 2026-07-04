export type MonitoringContext = {
	userId?: string;
	appId?: string;
	tags?: Record<string, string>;
	extra?: Record<string, unknown>;
};

export type MonitoringProvider = {
	captureError(error: unknown, context?: MonitoringContext): Promise<void>;
	captureMessage(message: string, context?: MonitoringContext): Promise<void>;
};

export const createConsoleMonitoringProvider = (): MonitoringProvider => ({
	async captureError(error, context) {
		console.error(error, context);
	},
	async captureMessage(message, context) {
		console.info(message, context);
	},
});
