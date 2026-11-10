# Wintertuin Team app: working notes

- The handbook lives in `js/handbook.js` (shown at `#/help`, Settings > Handleiding, and the ? icon).
  **Every change to a feature, in this app or in Wintertuin Finance, updates the matching chapter there and the `UPDATED` date.**
  The ? icon maps a page to a chapter via `routes` in `js/handbook.js`; a new page needs a chapter or a route entry.
- Replies to Joost in Dutch, plain and short, never an em dash.
- Cache busting: `node tools/version.cjs . <version>`, and bump `app.css?v=` / `theme.css?v=` in `index.html` when CSS changes.
- `css/theme.css` is shared with the Finance repo: change both.
- Database changes: a numbered file in `supabase/migrations/`, run with the `db-update.yml` workflow.
- Tests: `test/ui-test.cjs` with the mock in `test/mock-supabase.js`.
