import type { AgentUsage } from "./budget";

export type AgentAuditEvent = {
	runId: string;
	at: Date;
	type:
		| "run.started"
		| "model.completed"
		| "tool.requested"
		| "tool.completed"
		| "approval.required"
		| "run.completed"
		| "run.failed"
		| "run.cancelled"
		| "budget.exceeded";
	details: Record<string, unknown>;
	usage: AgentUsage;
};

export type AgentAuditSink = {
	record(event: AgentAuditEvent): Promise<void>;
};
