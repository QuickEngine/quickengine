import { redirect } from "next/navigation";

// /billing → the plans page (the billing home).
export default function Page() {
	redirect("/billing/plans");
}
