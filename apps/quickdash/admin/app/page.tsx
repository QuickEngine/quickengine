import { getSession } from "@quickengine/auth/server";
import { and, db, eq, isNull } from "@quickengine/db";
import { quickengineWorkspaces } from "@quickengine/db/schema/quickengine";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

const ACCOUNT_URL =
	process.env.NEXT_PUBLIC_QUICKENGINE_ACCOUNT_URL ?? "http://localhost:3001";

export default async function Page() {
	const session = await getSession(await headers());
	if (!session) {
		return null;
	}
	const [workspace] = await db
		.select({ id: quickengineWorkspaces.id })
		.from(quickengineWorkspaces)
		.where(
			and(
				eq(quickengineWorkspaces.ownerId, session.user.id),
				isNull(quickengineWorkspaces.archivedAt),
			),
		)
		.orderBy(quickengineWorkspaces.createdAt)
		.limit(1);

	if (workspace) {
		redirect(`/${workspace.id}`);
	}
	redirect(`${ACCOUNT_URL}/workspaces/new`);
}
