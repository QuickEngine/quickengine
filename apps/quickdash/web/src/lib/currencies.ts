/**
 * The currencies a workspace can price in.
 *
 * 🔴 A LIST, not a text box. `defaultCurrency` is validated as three letters,
 * so "USB" saves happily and then fails at the payment provider — a typo you
 * find when somebody tries to pay. Picking from a list makes that impossible
 * and, more usefully, means nobody has to remember that Swiss francs are CHF.
 *
 * ⚠️ Not exhaustive on purpose. These are the ones a small business plausibly
 * prices in; the schema still accepts any three letters, so an unusual currency
 * that arrives from elsewhere is shown rather than silently dropped.
 */
export const CURRENCIES: ReadonlyArray<{
	code: string;
	name: string;
	symbol: string;
}> = [
	{ code: "USD", name: "US dollar", symbol: "$" },
	{ code: "CAD", name: "Canadian dollar", symbol: "$" },
	{ code: "EUR", name: "Euro", symbol: "€" },
	{ code: "GBP", name: "Pound sterling", symbol: "£" },
	{ code: "AUD", name: "Australian dollar", symbol: "$" },
	{ code: "NZD", name: "New Zealand dollar", symbol: "$" },
	{ code: "JPY", name: "Japanese yen", symbol: "¥" },
	{ code: "CHF", name: "Swiss franc", symbol: "Fr" },
	{ code: "SEK", name: "Swedish krona", symbol: "kr" },
	{ code: "NOK", name: "Norwegian krone", symbol: "kr" },
	{ code: "DKK", name: "Danish krone", symbol: "kr" },
	{ code: "PLN", name: "Polish złoty", symbol: "zł" },
	{ code: "CZK", name: "Czech koruna", symbol: "Kč" },
	{ code: "MXN", name: "Mexican peso", symbol: "$" },
	{ code: "BRL", name: "Brazilian real", symbol: "R$" },
	{ code: "ZAR", name: "South African rand", symbol: "R" },
	{ code: "INR", name: "Indian rupee", symbol: "₹" },
	{ code: "SGD", name: "Singapore dollar", symbol: "$" },
	{ code: "HKD", name: "Hong Kong dollar", symbol: "$" },
	{ code: "AED", name: "UAE dirham", symbol: "د.إ" },
	{ code: "ILS", name: "Israeli shekel", symbol: "₪" },
	{ code: "KRW", name: "South Korean won", symbol: "₩" },
	{ code: "TRY", name: "Turkish lira", symbol: "₺" },
	{ code: "PHP", name: "Philippine peso", symbol: "₱" },
	{ code: "THB", name: "Thai baht", symbol: "฿" },
	{ code: "MYR", name: "Malaysian ringgit", symbol: "RM" },
	{ code: "IDR", name: "Indonesian rupiah", symbol: "Rp" },
	{ code: "NGN", name: "Nigerian naira", symbol: "₦" },
];
