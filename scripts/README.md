# Scripts

Automation scripts will live here.

Planned:

- `create-app.ts`: generate `apps/[app-name]/web`, `apps/[app-name]/admin`, env examples, and DB schema shell from `templates/app`.
- `check-scaffold.ts`: verify every app follows the two-app QuickEngine structure.

Keep scripts deterministic and safe by default. They should never delete product code without an explicit flag.
