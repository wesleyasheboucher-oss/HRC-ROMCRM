import { Badge } from "@/components/ui";

type Status = "Built" | "Partial" | "Placeholder";

const REQS: { id: string; text: string; status: Status; where: string }[] = [
  { id: "D-01", text: "Pipeline (board) view by default", status: "Built", where: "Patient Pipeline" },
  { id: "D-02", text: "List view of the same patients", status: "Built", where: "Patient Pipeline → list icon" },
  { id: "D-03", text: "Six surgery-date stages, recalculated daily", status: "Built", where: "lib/stages.ts" },
  { id: "D-04", text: "Patient count per column (replaces Covered Lives)", status: "Built", where: "Column headers" },
  { id: "D-05", text: "Total count for current view", status: "Built", where: "Toolbar" },
  { id: "D-06", text: "Default card content", status: "Built", where: "lib/fields.ts DEFAULT_CARD_FIELDS" },
  { id: "D-07", text: "Payer colour (blue / green / red), shown as a coloured payer tag instead of a bar at reviewer request", status: "Built", where: "Card top right; grey = other" },
  { id: "D-08", text: "Sort the board", status: "Built", where: "Toolbar sort, saved per user" },
  { id: "D-09", text: "Detail panel beside the board", status: "Built", where: "Click any card" },
  { id: "D-10", text: "Owner shown in panel header. Time-in-stage bar replaced by a calls-made tracker (blue = not called, then calls 1–6 from green → yellow → orange → red) with a Log call button, at reviewer request", status: "Built", where: "Panel header" },
  { id: "D-11", text: "All 22 PCSP fields", status: "Built", where: "Panel → PCSP" },
  { id: "D-12", text: "Next task (plus any scheduled call / email / text / note)", status: "Built", where: "Panel → Upcoming" },
  { id: "D-13", text: "Record history, merged with logged activities", status: "Built", where: "Panel → Activity" },
  { id: "D-14", text: "Up / down between patients", status: "Built", where: "Panel arrows or ↑ ↓ keys" },
  { id: "D-15", text: "Per-user card fields (any field, incl. financial estimate)", status: "Built", where: "Card fields button" },
  { id: "F-01", text: "Four standard views for every coordinator, zero setup", status: "Built", where: "Tabs" },
  { id: "F-02", text: "Fixed tab order without numbered names", status: "Built", where: "Tabs; pinned tabs drag to reorder" },
  { id: "F-03", text: "Admins create and assign views to users / teams", status: "Built", where: "Standard Views (admin)" },
  { id: "F-04", text: "Filter builder with ALL / ANY groups on any field", status: "Built", where: "Filters → Add new filter" },
  { id: "F-05", text: "Operators: is, starts with (plus more)", status: "Built", where: "lib/filters.ts" },
  { id: "F-06", text: "Name, Private/Shared, Preview before save", status: "Built", where: "Filter editor" },
  { id: "F-07", text: "Pin saved filters as tabs", status: "Built", where: "Filters menu pin icon" },
  { id: "F-08", text: "Manager/admin can view any coordinator's patients", status: "Built", where: "Board owner selector" },
  { id: "F-09", text: "Stages stay in place under any filter", status: "Built", where: "Board" },
  { id: "A-01", text: "Lead assignment maintenance screen", status: "Built", where: "Lead Stream" },
  { id: "A-02", text: "Assign each incoming patient an owner", status: "Built", where: "lib/assignment.ts" },
  { id: "A-03", text: "Percentage share per member", status: "Built", where: "Share of leads" },
  { id: "A-04", text: "Daily max per member", status: "Built", where: "Daily max" },
  { id: "A-05", text: "Lead types (incl. VA on/off, added at reviewer request) + exclusions per member", status: "Built", where: "Lead types, Exclusions" },
  { id: "A-06", text: "Overflow to first by last name", status: "Built", where: "lib/assignment.ts" },
];

const PLACEHOLDERS = [
  "Card date shows Expected close date (BRD asks what the Pipedrive card date is). Users can swap it via Card fields.",
  "Expected close date is mocked as surgery date − 3 days.",
  "Plan type under the payer name (Commercial, Medicare, Medicare Advantage, Worker's Comp, VA) is derived by placeholder rules from the payer name and VA flag until intake sends it. Demo VA patients use 'VA COMMUNITY CARE'; a few use Worker's Comp payers. Card colours still follow WIP State + MCR.",
  "Estimate box (reviewer request): Total estimate = DME + RTM + OT. Demo lines split Financial Estimate ~60/25/15 with made-up Covered / Self pay / Pending auth statuses. DME, RTM, OT tooltips assume Durable medical equipment, Remote therapeutic monitoring, Occupational therapy.",
  "The green circle icon on Pipedrive cards is not reproduced; a days-to-surgery chip sits in that spot instead.",
  "Detail panel shows one flat field list (no PCSP / New in ROMCRM grouping). The Navigator section is omitted; its fields are unknown.",
  "Call Stage, WIP State and Sales Status pick-lists are partly invented beyond the values seen in the videos.",
  "Payer type 'Other / unverified' (grey) covers WIP states that are neither 13 nor 15, pending the fourth-colour decision.",
  "Activity composer (tick any mix of Call, Text, Email on one entry, or a Note on its own; blue Complete logs it now, green Schedule prompts for a date) added at reviewer request. It records activities only; it does not dial, send email or send texts. Files, Documents, Invoice tabs and Won / Lost are out of scope.",
  "No field is edited inline in the panel: Call Stage follows the calls tracker (Complete a call, or click a tracker block to correct the count). WIP State and VA YES/NO are read-only. Sales Status is hidden from the detail panel at reviewer request, to show history tracking. VA YES/NO is a new field added at reviewer request (not in the BRD PCSP list); it does not affect payer type.",
  "Roles are switched from the avatar menu in the top bar; there is no real authentication.",
];

/** Open questions from the "HRCs in ROMCRM" build (order statuses, Lead Stream, conversions, All Orders). Not solved in code. */
const ORDER_QUESTIONS = [
  "Naming (decided by reviewer): \"Order Status\" is the iOMS prime status, with \"Substatus\" beside it. The Brightree field is \"WIP State\" again. The HRC tab's \"Current Order Status\" now shows the iOMS status, not WIP.",
  "Line and Classification both say Ortho / Cardiac. The seed keeps them in step, and Line falls back to Classification on older records. Are they the same field, and which wins if they differ?",
  "Prime statuses and substatuses are copied from iOMS (orders.js STATUSES). In production, does ROMCRM read the list from iOMS, and who keeps the two in step?",
  "HRC board scope: every view on the board (the standard views, the seeded views and any view saved from the board) shows only orders in Patient Sales. Should a saved view be able to reach outside Patient Sales on the board, or is that only for All Orders?",
  "Who changes order status? In the demo, managers and admins can set it from the detail panel header and coordinators see it read-only. In production is it only ever set by iOMS?",
  "The seed doesn't tie status to Call Stage, Sales Status or WIP State, so an order in Billing can still read \"New Not Called\". Is there a required relationship between them?",
  "The top-bar search finds every order, including ones outside Patient Sales. They open in the detail panel but aren't on the board behind it.",
  "Lead Stream is two pages, Ortho and Cardiac, and an HRC works only one line (reviewer decisions). Each page lists only its own HRCs, and reassigning only offers HRCs on the order's line. The brief's Line checkboxes (Ortho / Cardiac) under Order types are left out, since the HRC's line decides it.",
  "An HRC's line is set on the user (demo: Riley, Jordan, Taylor and Marcus are Ortho; Priya and Sam are Cardiac). Where is it set in production, and what happens to an HRC's open orders if they move line?",
  "Only orders assigned by weight count toward the cap. Kept owners and manager reassignments don't, so reassigning an order away doesn't give the first HRC room for another. Should reassignment move the count?",
  "An order that nobody is eligible for is left unassigned and shows as Unassigned (with the reason) in Incoming orders. Who picks those up: does a manager always reassign them by hand?",
  "Payer type for Lead Stream still comes from WIP State + MCR YES/NO (the board colour rule), not from the iOMS order.",
  "Patient Pipeline is one board per line (reviewer request). Ortho keeps the days-to-surgery columns; Cardiac has Preliminary Call, then 1st to 6th Enrollment Call. A cardiac order sits in the column for the number of calls logged on it (Calls made), so logging a call moves it one column right; 6 or more calls stay in the last column. What happens after the 6th enrollment call with no answer?",
  "The Cardiac columns count every logged call, including ones made before the order reached Patient Sales. Should only enrollment calls made in Patient Sales count?",
  "Conversions totals count orders, not rows (reviewer decision): each order counts once, by its current outcome and dated by that decision. An order lost and later won counts once, as won; superseded and voided rows stay in the table but aren't counted.",
  "Installment collected: the Notion field is read as the plan's total at the time of the win. Should it instead be the sum of instalments actually collected so far (from later \"payment collected\" results)?",
  "Coordinators see only the conversions they won or lost; managers and admins can pick any HRC. Should HRCs see the whole team's conversions?",
  "The seed has every order past Patient Sales won about a day before its status moved on, plus some won orders still in Patient Sales and a few lost-then-won orders.",
  "All Orders: \"My orders\" stands in for the board's \"All Patients\" tab there (the two would be the same view). Views saved on the board work here too: their owner part applies, their Patient Sales part doesn't, since this page shows every status.",
  "All Orders: with \"All HRCs\", an HRC's \"me\" views show their own orders and a manager's show everyone's; picking an HRC shows that HRC's orders in any view. HRCs can pick any HRC (Notion: viewable by HRCs, filtered down to the individual HRC). Should HRCs see other HRCs' orders?",
  "All Orders keeps its own list columns (Order Status, Substatus and Status Changed first), set with the same Columns picker.",
  "Weight migration: weight = old percentage ÷ smallest active percentage, rounded (so 25% ÷ 10% = 2.5 becomes 3). Ortho: Riley 25 → 3, Jordan 20 → 2, Marcus 15 → 2, Taylor 10 → 1. Priya and Sam are cardiac HRCs and are seeded on the Cardiac page (Priya 2, Sam 1).",
];

/** Conversions table: how each Notion field is filled from the saved call result, for the business to check. */
const CONVERSION_MAPPING: [string, string][] = [
  ["Conversion ID (unique key)", "CNV- plus a running number (CNV-000123), given when the row is written"],
  ["Outcome: won / lost", "The call result's outcome. \"Payment collected\" results don't create a row"],
  ["WON / LOST date", "When the result was saved"],
  ["HRC WON (HRC name)", "The HRC who saved the result (their user ID is kept too)"],
  ["EPR / estimate", "The patient portion on the call (totalEprCents), the same number the calculator showed"],
  ["Payment type", "From how the patient pays: paid upfront → Paid in full upfront; monthly plan → Payment plan; card on file → Card on file; nothing collected (lost, VA, Medicaid secondary) → None"],
  ["Amount collected (upfront)", "What was collected on the call when paid in full upfront, or the $25 card-on-file hold (the hold counts as collected upfront: confirmed by reviewer). 0 on a payment plan"],
  ["Installment collected", "The total of the payment plan (what the patient agreed to pay over the months), with the number of months. 0 unless on a plan. Instalments collected later are recorded as \"payment collected\" results, not here"],
  ["Lost reason / sub-reason", "From the lost-reason wheel, lost rows only"],
  ["Voided", "When the call result is deleted, its row is marked voided with who and when. It stays in the table, struck through, and doesn't count as the current outcome or in totals"],
];

const DEMO = [
  "All Orders: click Billing to see its substatuses and orders, then a substatus to narrow further; the address bar keeps the selection, so the view can be linked. Pick one HRC to see where all of their orders sit.",
  "Conversions: as Dana Whitfield (manager), open Conversions and pick one HRC and a date range; totals update. Open an order, delete its WON result on the Call Co-Pilot tab: its row is voided (struck through) and the order's current outcome falls back.",
  "Cardiac Pipeline: switch to Priya Natarajan, open an order in Preliminary Call and Complete a call: it moves to 1st Enrollment Call.",
  "Signed in as Riley Abbott (HRC): the four standard tabs are already there, plus one personal pinned filter.",
  "Click a card to open the detail panel; use ↑ / ↓ to move through patients. Change Call Stage and watch History update.",
  "Card fields → add Financial Estimate, Mobile Phone and State; the board updates for Riley only.",
  "Filters → Add new filter → build a filter, Preview, Save. It pins as a tab; drag tabs to reorder.",
  "Switch to Taylor Nguyen (new hire): same four tabs, zero setup.",
  "Switch to Priya Natarajan, a cardiac HRC: her book is cardiac orders, and she sees the admin-assigned 'Cardiac' tab.",
  "Switch to Wes Boucher (Admin): pick any coordinator from the board owner selector; open Standard Views to assign views.",
  "Lead Stream · Ortho (or · Cardiac) → Simulate 25 orders and read Incoming orders and the log. Lower someone's daily lead cap to see overflow kick in; untick an order type to see it skip them.",
  "As a manager, open an order, set Owner to Unassigned, move it out of Patient Sales and back to Patient Sales · Ready for Conversion: the Lead Stream assigns it and it appears in Incoming orders. Move it out and back again: it keeps its HRC.",
  "As Wes Boucher (Admin), open a patient and change Order status in the header: History logs the change, and moving the order out of Patient Sales takes it off the board.",
];

const STATUS_STYLE: Record<Status, string> = {
  Built: "bg-green-100 text-green-800",
  Partial: "bg-amber-100 text-amber-800",
  Placeholder: "bg-surface-2 text-muted",
};

export default function PocNotesPage() {
  return (
    <div className="scroll-thin h-full overflow-y-auto">
      <div className="mx-auto max-w-5xl px-6 py-6">
        <h1 className="text-xl font-semibold">POC notes</h1>
        <p className="mt-1 text-sm text-muted">
          Proof of concept for the BRD &ldquo;Homegrown Deals Pipeline (Pipedrive Replacement)&rdquo;. All data is fictional and stored in this
          browser only.
        </p>

        <h2 className="mb-2 mt-6 text-base font-semibold">Demo walkthrough</h2>
        <ol className="list-decimal space-y-1 pl-5 text-sm">
          {DEMO.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ol>

        <h2 className="mb-2 mt-8 text-base font-semibold">Requirement coverage</h2>
        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          <table className="w-full text-sm">
            <tbody>
              {REQS.map((r) => (
                <tr key={r.id} className="border-t border-border first:border-t-0">
                  <td className="w-16 px-4 py-2 font-mono text-xs text-muted">{r.id}</td>
                  <td className="px-3 py-2">{r.text}</td>
                  <td className="px-3 py-2 text-xs text-muted">{r.where}</td>
                  <td className="px-4 py-2 text-right">
                    <Badge className={STATUS_STYLE[r.status]}>{r.status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h2 className="mb-2 mt-8 text-base font-semibold">Open questions: HRCs in ROMCRM</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {ORDER_QUESTIONS.map((q) => (
            <li key={q}>{q}</li>
          ))}
        </ul>

        <h2 className="mb-2 mt-8 text-base font-semibold">Conversions table: field mapping</h2>
        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          <table className="w-full text-sm">
            <tbody>
              {CONVERSION_MAPPING.map(([field, how]) => (
                <tr key={field} className="border-t border-border first:border-t-0">
                  <td className="w-56 px-4 py-2 align-top font-medium">{field}</td>
                  <td className="px-3 py-2 text-muted">{how}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <h2 className="mb-2 mt-8 text-base font-semibold">Assumptions standing in for open questions</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm">
          {PLACEHOLDERS.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
