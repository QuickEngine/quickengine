import { DEFAULT_ACCENT, type EmailBrand, escapeHtml } from "./brand";

/**
 * The shared shell every transactional email renders inside.
 *
 * Written for MAIL CLIENTS, not browsers, which is why it looks two decades
 * out of date:
 *
 * · **Tables for layout.** Outlook renders through Word's HTML engine, which
 *   has no meaningful flexbox or grid support.
 * · **Inline styles, and a `<style>` block only as a bonus.** Gmail strips
 *   `<head>` styles on forwarded mail and several clients drop them outright.
 * · **No custom properties, no `oklch()`.** The app's theme tokens cannot cross
 *   into email at all; colours are solid hex or nothing.
 * · **600px.** Still the safe measure — narrower than every desktop preview
 *   pane, and it scales down cleanly on phones.
 *
 * The preheader is the grey line a client shows beside the subject. Left unset
 * it fills with whatever text comes first, which is usually "View this email
 * in your browser" or a bare logo alt.
 */
export function renderEmail({
	brand,
	preheader,
	body,
}: {
	brand: EmailBrand;
	preheader: string;
	body: string;
}): string {
	const accent = brand.accentColor ?? DEFAULT_ACCENT;
	const name = escapeHtml(brand.name);

	const header = brand.logoUrl
		? `<img src="${escapeHtml(brand.logoUrl)}" alt="${name}" height="32" style="display:block;border:0;max-height:32px;">`
		: `<span style="font-size:20px;font-weight:600;color:#111111;letter-spacing:-0.01em;">${name}</span>`;

	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<title>${name}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;font-size:1px;line-height:1px;color:#f4f4f5;">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;">
<tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;background:#ffffff;border-radius:10px;overflow:hidden;">

<tr><td style="padding:28px 32px 20px;border-bottom:1px solid #ececee;">
${header}
${brand.tagline ? `<div style="margin-top:6px;font-size:13px;color:#71717a;">${escapeHtml(brand.tagline)}</div>` : ""}
</td></tr>

<tr><td style="padding:32px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#27272a;">
${body}
</td></tr>

<tr><td style="padding:20px 32px 28px;border-top:1px solid #ececee;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:12px;line-height:1.6;color:#71717a;">
<div style="color:#3f3f46;font-weight:600;">${name}</div>
<div style="margin-top:4px;">Questions? <a href="mailto:${escapeHtml(brand.supportEmail)}" style="color:${accent};">${escapeHtml(brand.supportEmail)}</a></div>
${brand.websiteUrl ? `<div style="margin-top:4px;"><a href="${escapeHtml(brand.websiteUrl)}" style="color:${accent};">${escapeHtml(brand.websiteUrl.replace(/^https?:\/\//, ""))}</a></div>` : ""}
</td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

/** A call to action. Table-wrapped, because Outlook ignores padding on an `<a>`. */
export function button(label: string, href: string, accent: string): string {
	return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">
<tr><td style="background:${accent};border-radius:6px;">
<a href="${escapeHtml(href)}" style="display:inline-block;padding:12px 22px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;">${escapeHtml(label)}</a>
</td></tr></table>`;
}

export function heading(text: string): string {
	return `<h1 style="margin:0 0 12px;font-size:20px;font-weight:600;color:#111111;letter-spacing:-0.01em;">${escapeHtml(text)}</h1>`;
}

export function paragraph(html: string): string {
	return `<p style="margin:0 0 14px;">${html}</p>`;
}

/** Key/value rows — order totals, booking details, invoice lines. */
export function detailRows(
	rows: readonly { label: string; value: string; strong?: boolean }[],
): string {
	return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:20px 0;font-size:14px;">
${rows
	.map(
		(row) => `<tr>
<td style="padding:8px 0;border-bottom:1px solid #f1f1f3;color:#71717a;">${escapeHtml(row.label)}</td>
<td align="right" style="padding:8px 0;border-bottom:1px solid #f1f1f3;color:#27272a;${row.strong ? "font-weight:600;" : ""}">${escapeHtml(row.value)}</td>
</tr>`,
	)
	.join("\n")}
</table>`;
}
