import { getSession } from "@quickengine/auth/server";
import { getPusherServer, parseWorkspaceChannel } from "@quickengine/realtime";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { requireWorkspaceAccess } from "../../../_lib/workspace-access";

// Pusher calls this to authorize a browser's subscription to a private channel. This
// is the security gate: only a member of the channel's workspace may subscribe, so
// nobody can listen to another workspace's event stream.
export const runtime = "nodejs";

export async function POST(request: Request) {
	const pusher = getPusherServer();
	if (!pusher) {
		return new NextResponse("Realtime is not configured", { status: 503 });
	}

	const form = await request.formData();
	const socketId = String(form.get("socket_id") ?? "");
	const channel = String(form.get("channel_name") ?? "");
	const workspaceId = parseWorkspaceChannel(channel);
	if (!socketId || !workspaceId) {
		return new NextResponse("Bad request", { status: 400 });
	}

	const session = await getSession(await headers());
	if (!session) {
		return new NextResponse("Unauthorized", { status: 401 });
	}

	const access = await requireWorkspaceAccess(session.user.id, workspaceId);
	if (!access) {
		return new NextResponse("Forbidden", { status: 403 });
	}

	const auth = pusher.authorizeChannel(socketId, channel);
	return NextResponse.json(auth);
}
