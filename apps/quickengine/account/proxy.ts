import { NextResponse } from "next/server";

// The dashboard is authenticated-only, so nothing here should ever be cached or
// stored in the browser's back/forward cache — otherwise hitting "back" after
// sign-out could flash account content. `no-store` prevents that.
//
// Uses Next 16's `proxy` convention (the successor to the now-deprecated
// `middleware` file).
export function proxy() {
	const res = NextResponse.next();
	res.headers.set("Cache-Control", "no-store, max-age=0, must-revalidate");
	return res;
}

export const config = {
	// Everything except Next's static assets and the favicon.
	matcher: ["/((?!_next/static|_next/image|favicon.svg).*)"],
};
