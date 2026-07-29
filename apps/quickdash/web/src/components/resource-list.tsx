import { MagnifyingGlass } from "@phosphor-icons/react";
import { Button } from "@quickengine/ui/components/ui/button";
import { Input } from "@quickengine/ui/components/ui/input";
import { NativeSelect } from "@quickengine/ui/components/ui/native-select";

export type ResourceListState = {
	q: string;
	status: string;
	sort: string;
	page: number;
};

export type ResourceListOption = {
	value: string;
	label: string;
};

export function normalizeResourceListState(
	search: Partial<ResourceListState>,
): ResourceListState {
	return {
		q: search.q?.slice(0, 200) ?? "",
		status: search.status ?? "all",
		sort: search.sort ?? "default",
		page:
			Number.isSafeInteger(search.page) && (search.page ?? 0) > 0
				? (search.page ?? 1)
				: 1,
	};
}

export function buildResourceListPage<T>(input: {
	items: readonly T[];
	state: ResourceListState;
	pageSize?: number;
	matches: (item: T, normalizedQuery: string) => boolean;
	compare?: (left: T, right: T, sort: string) => number;
	inStatus?: (item: T, status: string) => boolean;
}) {
	const pageSize = input.pageSize ?? 20;
	const query = input.state.q.trim().toLowerCase();
	const filtered = input.items.filter(
		(item) =>
			(!query || input.matches(item, query)) &&
			(input.state.status === "all" ||
				(input.inStatus?.(item, input.state.status) ?? true)),
	);
	const compare = input.compare;
	const sorted = compare
		? [...filtered].sort((left, right) =>
				compare(left, right, input.state.sort),
			)
		: filtered;
	const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
	const page = Math.min(input.state.page, pageCount);
	const start = (page - 1) * pageSize;
	return {
		items: sorted.slice(start, start + pageSize),
		filteredCount: sorted.length,
		totalCount: input.items.length,
		page,
		pageCount,
	};
}

export function ResourceListToolbar({
	state,
	onChange,
	searchPlaceholder,
	statuses,
	sorts,
	filteredCount,
	totalCount,
}: {
	state: ResourceListState;
	onChange: (patch: Partial<ResourceListState>) => void;
	searchPlaceholder: string;
	statuses: readonly ResourceListOption[];
	sorts: readonly ResourceListOption[];
	filteredCount: number;
	totalCount: number;
}) {
	const filtered =
		state.q.trim() || state.status !== "all" || state.sort !== "default";
	return (
		<div className="space-y-2">
			<div className="flex flex-col gap-3 sm:flex-row">
				<div className="relative min-w-0 flex-1">
					<MagnifyingGlass className="absolute top-2.5 left-3 size-4 text-muted-foreground" />
					<Input
						aria-label="Search records"
						className="pl-9"
						value={state.q}
						onChange={(event) => onChange({ q: event.target.value, page: 1 })}
						placeholder={searchPlaceholder}
					/>
				</div>
				<NativeSelect
					aria-label="Filter by status"
					className="sm:w-40"
					value={state.status}
					onChange={(event) =>
						onChange({ status: event.target.value, page: 1 })
					}
				>
					{statuses.map((option) => (
						<option key={option.value} value={option.value}>
							{option.label}
						</option>
					))}
				</NativeSelect>
				<NativeSelect
					aria-label="Sort records"
					className="sm:w-44"
					value={state.sort}
					onChange={(event) => onChange({ sort: event.target.value, page: 1 })}
				>
					{sorts.map((option) => (
						<option key={option.value} value={option.value}>
							{option.label}
						</option>
					))}
				</NativeSelect>
			</div>
			<div className="flex min-h-7 items-center justify-between gap-3 text-muted-foreground text-xs">
				<span>
					{filteredCount === totalCount
						? `${totalCount} record${totalCount === 1 ? "" : "s"}`
						: `${filteredCount} of ${totalCount} records`}
				</span>
				{filtered && (
					<Button
						type="button"
						variant="ghost"
						size="sm"
						onClick={() =>
							onChange({ q: "", status: "all", sort: "default", page: 1 })
						}
					>
						Clear filters
					</Button>
				)}
			</div>
		</div>
	);
}

export function ResourceListPagination({
	page,
	pageCount,
	onPageChange,
}: {
	page: number;
	pageCount: number;
	onPageChange: (page: number) => void;
}) {
	if (pageCount <= 1) return null;
	return (
		<nav
			aria-label="Resource list pages"
			className="flex items-center justify-end gap-3"
		>
			<Button
				type="button"
				variant="outline"
				size="sm"
				disabled={page <= 1}
				onClick={() => onPageChange(page - 1)}
			>
				Previous
			</Button>
			<span className="text-muted-foreground text-xs">
				Page {page} of {pageCount}
			</span>
			<Button
				type="button"
				variant="outline"
				size="sm"
				disabled={page >= pageCount}
				onClick={() => onPageChange(page + 1)}
			>
				Next
			</Button>
		</nav>
	);
}
