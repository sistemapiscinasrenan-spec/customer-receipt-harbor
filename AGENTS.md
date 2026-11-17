<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

## Project rules

- Data access goes from the browser through the generated Supabase client with RLS (`has_app_access`); no server functions are needed for CRUD. Why: single-company app, RLS already enforces who can read/write.
- Access model: every signed-in user with a row in `user_roles` sees the whole portfolio; the first account created (while no admin exists) becomes admin via an `auth.users` trigger. Why: no multi-tenant requirement, but signups must not expose financial data.
- Money is computed in integer cents (`src/lib/money.ts`) and stored as `numeric(10,2)`; never use float math on amounts. Why: totals must always close (billed = received + pending).
- `monthly_charges` rows are snapshots: a DB trigger blocks changes to name/amount/due date after generation and manages `paid_at`; status changes always filter on the opposite status so repeated clicks can't double-count. Why: history must never be rewritten by later client edits.
- Monthly charges are only created through `generate_monthly_charges` (ON CONFLICT DO NOTHING on client+month). Why: generation is explicit and idempotent.
- Indicator, grouping and quick-command rules live in pure modules under `src/lib/` with tests in `src/test/`. Why: business rules stay testable without a browser.
