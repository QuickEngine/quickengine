import { Navbar } from "./_components/navbar";

export default function Page() {
	return (
		<>
			<Navbar />
			{/* pt-16 clears the fixed header. Hero content goes here. */}
			<main className="min-h-dvh pt-16" />
		</>
	);
}
