import { ArrowRight } from "@phosphor-icons/react";
import { Button } from "@quickengine/ui/components/ui/button";
import Link from "../compat/router-link";

export type ConnectedRecord = {
	label: string;
	value: string;
	href: string;
	action: string;
};

export function ConnectedRecords({
	records,
}: {
	records: readonly ConnectedRecord[];
}) {
	if (records.length === 0) return null;
	return (
		<section
			className="space-y-2 border-t pt-4"
			aria-labelledby="related-records"
		>
			<h3 id="related-records" className="font-medium text-sm">
				Related records
			</h3>
			<div className="grid gap-2 sm:grid-cols-2">
				{records.map((record) => (
					<div
						key={`${record.label}:${record.value}`}
						className="flex min-w-0 items-center justify-between gap-3 rounded-lg border p-3"
					>
						<div className="min-w-0">
							<p className="text-muted-foreground text-xs">{record.label}</p>
							<p className="truncate font-medium text-sm">{record.value}</p>
						</div>
						<Button asChild size="sm" variant="ghost">
							<Link href={record.href}>
								{record.action}
								<ArrowRight className="size-3.5" />
							</Link>
						</Button>
					</div>
				))}
			</div>
		</section>
	);
}
