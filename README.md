# ROMCRM — Deals Pipeline (POC)

Proof of concept for **BRD — Homegrown Deals Pipeline (Pipedrive Replacement)** (`../BRD - Pipedrive Replacement (Deals Pipeline).md`).
It's a clickable front end with fictional data and no backend, meant as a reference design for the production build.

```bash
npm install
npm run dev        # http://localhost:3000
```

Next.js 15 (App Router) · React 19 · TypeScript · Tailwind v4 · dnd-kit (tab reordering) · lucide-react (icons).

## What's in it

| Screen | Route | BRD |
| --- | --- | --- |
| Patient Pipeline · Ortho (board / list + detail panel) | `/deals` | D-01 – D-15, F-01 – F-09 |
| Patient Pipeline · Cardiac (columns by enrollment call) | `/deals/cardiac` | Notion 3.2 |
| Lead Stream · Ortho / · Cardiac | `/lead-assignment/ortho`, `/lead-assignment/cardiac` (manager, admin) | A-01 – A-06 |
| Standard views (assign to users/teams) | `/admin/views` (admin) | F-03 |
| All Orders (ten statuses, substatuses, list) | `/orders?status=…&sub=…` | Notion: Other Data on Orders Display |
| Conversions table (every WON / LOST row, totals) | `/conversions` | Notion data req. 6 |
| Requirement coverage + assumptions | `/poc-notes` | — |

Use the avatar menu in the top bar to switch between coordinators, a manager and an admin. `?as=<userId>` in the URL does the same
(e.g. `/lead-assignment?as=u_admin`). The reset icon restores the seed data.

## Code map

Domain logic is UI-free and is the part most worth porting to the backend:

- `src/lib/types.ts` — data model: patient record (all 22 PCSP fields + new fields), filters, view assignments, assignment rules.
- `src/lib/stages.ts` — surgery-date stage rules and time-in-stage calculation.
- `src/lib/pipelines.ts` — board columns per line: Ortho by days to surgery, Cardiac by enrollment call (calls logged).
- `src/lib/orderStatus.ts` — iOMS order status: prime statuses in order, their substatuses (copied exactly from iOMS
  `orders.js` `STATUSES`) and the HRC hand-in point, Patient Sales · Ready for Conversion.
- `src/lib/fields.ts` — **single field registry** used by cards, list columns, filter builder and detail panel. Add a field here once and
  it shows up everywhere. Also holds the payer-type rule (card colour and lead type).
- `src/lib/filters.ts` — filter evaluation (ALL/ANY groups, operators), the four standard views, tab ordering.
  `@me` in a condition resolves to the coordinator whose board is being viewed, so one view definition serves every coordinator.
- `src/lib/assignment.ts` — Lead Stream engine. An HRC works one line (`User.line`), so each HRC has one rule, on their line's page: weight, daily lead cap, order types
  (payer, VA, logistics), exclusions, overflow; plus the migration from percentage rules. Tests: `npm run test:lead-stream`.
- `src/lib/conversions.ts` — conversions table: a row per WON / LOST call result (never edited; deleting the result voids it),
  current outcome = newest live row, and totals. Tests: `npm run test:conversions`.
- `src/lib/store.tsx` — client-side store persisted to `localStorage`. Each action corresponds to a future API call.
- `src/lib/mock-data.ts` — deterministic, fictional seed data.

UI lives in `src/components/` (`deals/`, `filters/`, `shell/`, `ui.tsx`).

The ROM CRM shell (`src/components/shell/Sidebar.tsx`, `Navbar.tsx`) and the colour theme (`src/app/globals.css`) match the
Payer Intelligence Hub, so the module reads as part of the CRM. **HRC** is this module's sidebar section; every other section is
presentational and inert. The top-bar search finds any patient and opens them on the board (`/deals?open=<id>`). The avatar menu
switches demo users; the settings gear holds POC Notes and Reset demo data.

## Behaviour notes for production

- **Every record is an iOMS order** with a prime status and substatus (`setOrderStatus` rejects a substatus that doesn't belong to
  the prime status and writes history). The HRC board only shows orders in **Patient Sales**: every board view carries that scope
  (with the board owner) and the Filters drawer keeps it out of sight. A won order stays on the board until its status moves on.
- **Stages are derived, not stored.** A patient's column is computed from surgery date vs. today, so nothing needs a nightly job.
- **Standard views are code-defined** (`STANDARD_VIEWS`), always first and in fixed order. Admin-assigned views come next, then the
  user's pinned filters in drag order. Pin order is a per-user setting, so nobody needs to number filter names.
- **Card fields and sort are per-user preferences** (`UserPrefs`).
- **Assignment happens on status:** an order gets an HRC when it enters Patient Sales · Ready for Conversion with no owner
  (`setOrderStatus`, and intake). An order that comes back with an owner keeps it. Each line (Ortho, Cardiac) has its own page and rules.
- **Assignment algorithm:** among eligible HRCs on the order's line under their daily lead cap, the order goes to whoever has the lowest
  `assignedToday / weight` (ties alphabetical by last name). If every eligible HRC is at their cap, it goes to the first eligible HRC
  by last name (A-06). If no one takes the order type, it is left unassigned and logged.
- Every change made through the panel or assignment writes a history entry with who/when.

## Assumptions standing in for BRD open questions

- The card date is **Expected close date** (mocked as surgery date − 3 days). Users can change card fields.
- The Pipedrive green circle icon isn't reproduced; a days-to-surgery chip sits there instead.
- **Navigator** fields are unknown, so that section is a placeholder.
- Call Stage / WIP State / Sales Status pick-lists are only partly known; extra values are invented.
- A fourth payer colour (grey, "Other / unverified") covers WIP states that are neither 13 nor 15.
- Notes / Activity / Call / Email / Files / Documents / Invoice tabs and Won / Lost are out of scope.
- No auth: the role switcher stands in for real permissions.
