import { redirect } from "next/navigation";

// The auth app is a pure identity provider — no marketing front page. Anyone
// landing on the root goes straight to sign-in.
export default function Page() {
	redirect("/signin");
}
