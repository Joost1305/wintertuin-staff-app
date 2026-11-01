# Wintertuin Team

The team app for Wintertuin: SOPs with daily checklists, menu, links, roster, clocking in and shift swaps.
Same look, structure and login as [Wintertuin Finance](https://joost1305.github.io/wintertuin-finance/).

Live: https://joost1305.github.io/wintertuin-staff-app/

```
Phone / tablet / laptop ──► GitHub Pages (this repo, root) ──► Supabase project "wintertuin-staff-app"
                                                                ├─ Auth      one login, shared with Wintertuin Finance
                                                                ├─ Postgres  profiles, sops, sop_checks, menu_items, resources,
                                                                │            shifts, shift_templates, checkins, shift_swap_requests (RLS on all)
                                                                ├─ Storage   menu-photos (public read, managers upload)
                                                                └─ Edge Function admin-users   create accounts, reset passwords
GitHub Actions: daily keepalive ping
```

## Where things are

| Path | What |
|---|---|
| `index.html`, `css/app.css` | Shell and styles (same base as Wintertuin Finance and WASTE log) |
| `js/config.js` | Supabase URL, public key, build marker (shown in the browser console) |
| `js/app.js` | Router and top bar |
| `js/core.js`, `js/data.js`, `js/i18n.js` | Helpers, Supabase calls, English and Dutch texts |
| `js/pages/` | One file per page: sops, menu, links, roster, checkin, swap, settings, login, set-password |
| `vendor/supabase.js` | supabase-js, vendored (no CDN, no build step) |
| `Wintertuin-Intro.html`, `Wintertuin-Cantonspark-Geschiedenis.html` | Stand-alone content pages ("About" in the menu) |
| `supabase/migrations/` | Database changes made for this version |
| `test/` | Browser smoke test with an in-memory Supabase |

## Start page, PIN and the clock-in tablet

- **Today** is the start page: next shift, clock in or out, today's checklists, who works today, events and swaps.
- **Quick sign-in with a PIN** (`js/pinlock.js`, same file in Finance): the first time on a device you sign in with email and
  password, then choose a 4-digit PIN. After that the app asks only for the PIN when it opens or after 30 minutes without use.
  The PIN is a lock in front of the Supabase session, stored as a PBKDF2 hash on the device. 5 wrong tries sign you out.
- **Clock-in tablet** (`#/kiosk`, managers): tap your name, type your PIN. Needs migration `010_kiosk.sql` in Supabase
  (PINs hashed in `kiosk_pins`, only reachable through security definer functions, 5 wrong tries lock for 5 minutes).
  Until that migration runs, the tablet screen says so and the PIN still works for signing in.
- **Look**: `css/theme.css` (same file in Finance) holds the season colours (winter from the last Sunday of October,
  summer from the last Sunday of March), Young Serif headings (`fonts/`) and the Lucide icons.

## Guests, newsletter and the sample menu

- **Guests** (`#/guests`, managers): everyone from every event plus guests added by hand, with notes, labels and event history.
  The newsletter list holds only guests who said yes: the box on the event (also on the client BEO) or ticked by a manager.
  Export as CSV for Brevo or Mailchimp. Needs migration `011_guests.sql` (until then the list is read-only, straight from the events).
- **Newsletter** (`#/newsletter`): a monthly mail built from the dish of the month, menu highlights and a few short texts;
  downloads as email-safe HTML. The draft is shared by managers.
- **Sample menu**: Settings > Order of the dishes loads a winter lunch and dinner menu (`js/sample-menu.js`) with allergens,
  and registers the lunch, dinner and allergen PDFs in `demo/`. A dish of the month is chosen there too.
- **Database updates**: Actions > Database update runs files from `supabase/migrations` (uses the backup secret).

## Roles

| | Staff | Manager |
|---|---|---|
| SOPs, menu, links | read, tick checklists | plus add, edit, delete |
| Roster | see everyone, own shifts in colour | plus plan by click or drag, fixed shifts |
| Clock in, swap | own | plus approve swaps, see everyone's hours |
| Settings | no | team and accounts, fixed shifts, links, backup and restore |

Only a manager can change someone's role, active status or email (database trigger `profiles_guard_role`).

## One login for both apps

Both apps live on `joost1305.github.io` and use the same Supabase project with the default session key,
so signing in to one signs you in to the other. Signing out in one signs you out of both.
Finance access is separate: it needs a row in `fin_app_users`, set by an admin in the finance app.

## Language

English by default. The EN | NL switch is saved per person in `profiles.language`.

## Development

```bash
python3 -m http.server 8770                                  # open http://localhost:8770 (uses the live Supabase project)
BASE=http://localhost:8770/ node test/ui-test.cjs            # browser smoke test against an in-memory Supabase (needs Playwright)
```

After deploying, check the build marker in the browser console (`Wintertuin Team, build …`).
