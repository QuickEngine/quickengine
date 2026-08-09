# Security policy

QuickEngine welcomes responsible reports about QuickDash, the public API, Quick.js and the
`quick` CLI.

## Report privately

Do not open a public issue for a suspected vulnerability. Email `hello@quickengine.xyz` with
`SECURITY` in the subject. Include the affected surface or package version, reproducible steps,
impact and any safe request IDs. Do not send live credentials, unrelated customer records or
destructive proof.

We will acknowledge receipt and establish severity and next actions based on the evidence. We do
not publish a fixed response or remediation deadline before operational baselines and contractual
commitments exist.

GitHub private vulnerability reporting is not currently enabled. When it is enabled, this policy
will link directly to that confidential channel and it will become the preferred route.

## Scope

Supported web services are the production QuickEngine and QuickDash surfaces. For public npm
packages below 1.0, the latest published minor line receives security fixes. Reports about social
engineering, denial of service through excessive traffic, third-party provider availability, or
the intentionally unshipped desktop/mobile wrappers may be triaged separately.

Good-faith testing must use accounts and workspaces you own, avoid accessing another customer's
data, stop when sensitive information appears and avoid degrading the service.
