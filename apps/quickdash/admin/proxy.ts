import { NextResponse } from "next/server";

export function proxy() {
	const response = NextResponse.next();
	response.headers.set("Cache-Control", "no-store, max-age=0, must-revalidate");
	return response;
}

export const config = {
	matcher: ["/((?!_next/static|_next/image|favicon.svg).*)"],
};
