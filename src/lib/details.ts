/**
 * Record tabs in the patient drawer (next to Activity), mirroring the current CRM's tabs:
 * Patient Info · Insurance & Eligibility · Home Rehab Coordinator · Delivery & Onboarding.
 *
 * POC: fields that already exist on Patient use the real value; everything else is fictional,
 * derived deterministically from the patient ID so it stays stable between renders and reloads.
 * The field list is deliberately the full set from the current CRM — expect to trim it.
 * Sections repeated across tabs in the current CRM (Insurance Plan Details and the estimate box on
 * the HRC tab) appear only once here.
 */
import { primeStatusOf, statusText, substatusOf } from "./orderStatus";
import { addDays, parseISODate, toISODate } from "./dates";
import { DEAL_STATUS_LABELS, dealStatusInfo, estimateLines, firstResultAt, logisticsType, planType, PLAN_TYPES } from "./derive";
import { METHOD_LABELS, PAYMENT_LABELS } from "./copilot/calculator";
import type { FieldDef, FieldSection } from "./fields";
import { LOST_REASON_NAMES, LOST_SUB_REASONS } from "./lostReasons";
import type { Patient } from "./types";

export type DetailValue =
  | { kind: "text"; value: string }
  | { kind: "phone"; value: string }
  | { kind: "email"; value: string }
  | { kind: "check"; value: boolean }
  | { kind: "yesno"; value: boolean }
  /** ISO date (YYYY-MM-DD) or "" */
  | { kind: "date"; value: string }
  /** Amount in cents, or null when there isn't one */
  | { kind: "money"; value: number | null };

export interface DetailField {
  label: string;
  v: DetailValue;
  /** Fixed value list, so filters offer a dropdown */
  options?: string[];
}

export interface DetailSection {
  title: string;
  fields: DetailField[];
  /** Attachments list instead of fields */
  files?: string[];
}

export interface DetailTab {
  key: string;
  label: string;
  sections: DetailSection[];
}

const text = (label: string, value: string | number | null | undefined, options?: string[]): DetailField => ({
  label,
  v: { kind: "text", value: value === null || value === undefined ? "" : String(value) },
  options,
});
const date = (label: string, iso: string): DetailField => ({ label, v: { kind: "date", value: iso } });
const opts = (list: string[]) => [...new Set(list.filter(Boolean))];
const phone = (label: string, value: string): DetailField => ({ label, v: { kind: "phone", value } });
const email = (label: string, value: string): DetailField => ({ label, v: { kind: "email", value } });
const check = (label: string, value: boolean): DetailField => ({ label, v: { kind: "check", value } });
const yesno = (label: string, value: boolean): DetailField => ({ label, v: { kind: "yesno", value } });
const money = (label: string, cents: number | null | undefined): DetailField => ({ label, v: { kind: "money", value: cents ?? null } });

const FORM_SIGNED = { abn: "ABN", prf: "Patient Responsibility Form" } as const;

/**
 * Key data from the Call Co-Pilot result: Open / Won / Lost and what the patient agreed to pay.
 * Comes from the latest WON or LOST result (payment-only results add to Total Collected).
 * Shown on the Home Rehab Coordinator tab and at the bottom of the drawer's left column.
 */
export function callResultSection(p: Patient): DetailSection {
  const status = dealStatusInfo(p);
  const results = p.callResults ?? [];
  const decided = results.filter((r) => r.outcome !== "payment_collected").sort((a, b) => (a.at < b.at ? 1 : -1))[0];
  const won = decided?.outcome === "won" ? decided : undefined;
  // Money, each number meaning something different:
  //   Full Estimate:          the patient portion quoted on the call (before any choice or discount)
  //   Amount Agreed:          what the patient agreed to pay in total (after any hardship discount); none for card on file
  //   Collected at Conversion: money taken on the WON call (including a card hold)
  //   Card Hold:              card on file only
  //   Upfront Collected:      paid in full at WON
  //   Installment Collected:  monthly-plan payments recorded with "Payment collected" (none are counted at WON)
  // A $25 card hold counts as collected at conversion. "Payment only" results saved after the WON count by how they were taken.
  const onFile = won?.paymentOption === "card_on_file";
  const holdCents = onFile ? (won!.holdCents ?? (won!.collectedAs === "card_hold" ? won!.amountCollectedCents : 0)) : null;
  const collectedAtWin = won ? won.amountCollectedCents : null;
  const later = results.filter((r) => r.outcome === "payment_collected" && (!won || r.at > won.at));
  const taken = [...(won ? [won] : []), ...later];
  const sumAs = (as: "upfront" | "installment") => taken.filter((r) => r.collectedAs === as).reduce((s, r) => s + r.amountCollectedCents, 0);
  const upfront = sumAs("upfront");
  const installment = sumAs("installment");
  const onPlan = won?.paymentOption === "plan" || installment > 0;
  const paymentType = won?.paymentOption ? (onFile ? `Card on file${holdCents ? ` (${formatUsd(holdCents)} hold)` : ""}` : PAYMENT_LABELS[won.paymentOption]) : "";
  return {
    title: "HRC Conversion",
    fields: [
      text("Open/Won/Lost Status", DEAL_STATUS_LABELS[status.status], ["Open", "Won", "Lost"]),
      date("Open/Won/Lost Date", (status.at ?? p.createdAt).slice(0, 10)),
      text("Won/Lost By", status.by ?? ""),
      text("Form Signed", won?.formSigned ? FORM_SIGNED[won.formSigned] : "", Object.values(FORM_SIGNED)),
      text("Patient Pays", won?.paymentMethod ? METHOD_LABELS[won.paymentMethod] : "", Object.values(METHOD_LABELS)),
      text("Payment Type", paymentType),
      text("Plan Length", won?.paymentOption === "plan" ? `${won.months} months` : ""),
      text("FHA Discount", won?.fhaPercent ? `${won.fhaPercent}%` : ""),
      // What was quoted vs what was done at the conversion, so it's obvious at a glance
      money("Full Estimate", won?.totalEprCents),
      money("Amount Agreed", won && !onFile ? won.amountAgreedCents : null),
      money("Collected at Conversion", collectedAtWin),
      money("Card Hold", holdCents),
      money("Upfront Collected", upfront || (won?.paymentOption === "upfront" ? 0 : null)),
      money("Installment Collected", onPlan ? installment : null),
      date("First Won Date", firstResultAt(p, "won").slice(0, 10)),
    ],
  };
}

/**
 * Why the patient was lost: reason and sub-reason picked on the lost-reason wheel when LOST is saved.
 * Shown as its own section on the Home Rehab Coordinator tab, under HRC Conversion. Filled only while the
 * latest decided result is LOST.
 */
export function lostSection(p: Patient): DetailSection {
  const decided = (p.callResults ?? []).filter((r) => r.outcome !== "payment_collected").sort((a, b) => (a.at < b.at ? 1 : -1))[0];
  const lostR = decided?.outcome === "lost" ? decided : undefined;
  return {
    title: "Lost",
    fields: [
      text("Lost Reason", lostR?.lostReason ?? "", LOST_REASON_NAMES),
      text("Lost Sub-Reason", lostR?.lostSubReason ?? "", LOST_SUB_REASONS),
      date("First Lost Date", firstResultAt(p, "lost").slice(0, 10)),
    ],
  };
}

const formatUsd = (cents: number) => `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;

const STATE_NAMES: Record<string, { name: string; city: string; zip: string; tz: string; region: string }> = {
  MO: { name: "Missouri", city: "Kansas City", zip: "64111", tz: "Central", region: "Midwest" },
  KS: { name: "Kansas", city: "Overland Park", zip: "66212", tz: "Central", region: "Midwest" },
  NY: { name: "New York", city: "Albany", zip: "12203", tz: "Eastern", region: "Northeast" },
  TN: { name: "Tennessee", city: "Nashville", zip: "37203", tz: "Central", region: "South" },
  CA: { name: "California", city: "Sacramento", zip: "95814", tz: "Pacific", region: "West" },
  GA: { name: "Georgia", city: "Atlanta", zip: "30303", tz: "Eastern", region: "South" },
  TX: { name: "Texas", city: "Austin", zip: "78701", tz: "Central", region: "South" },
  FL: { name: "Florida", city: "Tampa", zip: "33602", tz: "Eastern", region: "South" },
  OH: { name: "Ohio", city: "Columbus", zip: "43215", tz: "Eastern", region: "Midwest" },
  PA: { name: "Pennsylvania", city: "Harrisburg", zip: "17101", tz: "Eastern", region: "Northeast" },
  KY: { name: "Kentucky", city: "Louisville", zip: "40202", tz: "Eastern", region: "South" },
  WI: { name: "Wisconsin", city: "Madison", zip: "53703", tz: "Central", region: "Midwest" },
  AZ: { name: "Arizona", city: "Phoenix", zip: "85004", tz: "Mountain", region: "West" },
};
const STREETS = ["Sunnyside Ave", "Maple St", "Oak Ridge Dr", "Lakeview Rd", "Cedar Ln", "Park Blvd", "Willow Ct", "Highland Ave"];
const MIDDLE = ["", "", "", "A", "J", "M", "R", "L"];
const EC_FIRST = ["Ellen", "Mark", "Susan", "David", "Karen", "Paul", "Linda", "James"];
const RELATIONSHIPS = ["Spouse", "Spouse", "Daughter", "Son", "Sibling", "Friend"];
const ICD10 = ["M17.11", "M17.12", "M17.0", "M16.11", "M16.12", "M75.101"];
const CONTACT_METHODS = ["", "Mobile phone", "Home phone", "Text", "Email"];
const LOGISTIC_STATUS = ["", "Pending", "Order placed", "Shipped", "Delivered"];
const REGIONS = ["Midwest", "Northeast", "South", "West"];
const TIME_ZONES = ["Eastern", "Central", "Mountain", "Pacific"];

/** Small deterministic generator per patient so made-up values don't change between renders. */
function rng(seed: number) {
  let a = seed >>> 0 || 1;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function detailTabs(p: Patient): DetailTab[] {
  const r = rng(Number(p.id) || p.id.length);
  const pick = <T,>(arr: T[]) => arr[Math.floor(r() * arr.length)];
  const digits = (n: number) => Array.from({ length: n }, () => Math.floor(r() * 10)).join("");

  const st = STATE_NAMES[p.state];
  const surgery = parseISODate(p.surgeryDate);
  const dob = p.age === null ? "" : toISODate(new Date(new Date().getFullYear() - p.age, Math.floor(r() * 12), 1 + Math.floor(r() * 28)));
  const lines = estimateLines(p);
  const covered = (k: "dme" | "rtm" | "ot") => lines[k].status === "covered";
  const usd = (n: number | null) => (n === null ? "N/A" : n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }));
  const selfPay = p.wipState.startsWith("15");
  const insured = p.insuranceName && !selfPay;
  const lt = logisticsType(p);
  const ecLast = p.lastName.toUpperCase();
  const lastFirst = `${p.lastName}_${p.firstName}`.replace(/\s+/g, "_");
  const delivered = surgery < new Date();

  return [
    {
      key: "patient",
      label: "Patient Info",
      sections: [
        {
          title: "Patient Info",
          fields: [
            text("First name", p.firstName.toUpperCase()),
            text("Middle name", pick(MIDDLE)),
            text("Last name", p.lastName.toUpperCase()),
            check("Patient Deceased", false),
            date("Date of Birth", dob),
            text("Age", p.age),
            text("Gender", pick(["Male", "Female"]), ["Male", "Female"]),
            check("Patient Breast Cancer IRB", false),
            text("Address", `${10 + Math.floor(r() * 980)} ${pick(STREETS)}`.toUpperCase()),
            text("City", st?.city.toUpperCase() ?? ""),
            text("State", st?.name ?? ""),
            text("Country", "United States"),
            text("ZIP/postal code", st?.zip ?? ""),
            text("Territory", ""),
            text("Region", st?.region ?? "", REGIONS),
            text("Time Zone", st?.tz ?? "", TIME_ZONES),
          ],
        },
        {
          title: "Contact Info",
          fields: [
            phone("Home phone", p.homePhone),
            phone("Mobile phone", p.mobilePhone),
            phone("Secondary phone", p.secondaryPhone),
            email("Email", r() < 0.6 ? `${p.firstName}.${p.lastName}@example.com`.toLowerCase() : ""),
            text("Preferred Contact Method", pick(CONTACT_METHODS), opts(CONTACT_METHODS)),
            check("Patient Consents to Text Messages", r() < 0.5),
            text("Emergency Contact Name", `${pick(EC_FIRST).toUpperCase()}, ${ecLast}`),
            phone("Emergency Contact Phone", `(${pick(["617", "816", "404", "512", "614"])}) ${digits(3)}-${digits(4)}`),
            email("Emergency Contact Email", ""),
            text("Emergency Contact Relationship", pick(RELATIONSHIPS), opts(RELATIONSHIPS)),
          ],
        },
        {
          title: "Miscellaneous",
          fields: [
            text("Order Type", pick(["Provider Direct", "Provider Direct", "Referral"]), ["Provider Direct", "Referral"]),
            text("ICD-10 Code", pick(ICD10), ICD10),
            text("Sent From", "documents@esign.example.com"),
            text("Sent To", "dme@example.com"),
            text("Subject", `${p.physicianName || "Provider"} sent you the order for ${p.firstName} ${p.lastName}`),
          ],
        },
      ],
    },
    {
      key: "insurance",
      label: "Insurance & Eligibility",
      sections: [
        {
          title: "Eligibility",
          fields: [
            text("Insurance Eligibility Notes", ""),
            check("IRB Study Eligible", false),
            check("Single Case Agreement (SCA)", false),
            check("LMN On File", r() < 0.7),
            text("SCA Stage", ""),
            text("SCA Status", ""),
            yesno("Device Covered", covered("dme")),
            yesno("Ortho Therapy Covered", covered("rtm")),
            yesno("Occupational Therapy Covered", covered("ot")),
            text("Occupational Therapy Estimate", usd(lines.ot.amount)),
          ],
        },
        {
          title: "Insurance Plan Details",
          fields: [
            text("Primary Insurance", p.insuranceName),
            text("Primary Insurance ID", insured ? `U${digits(10)}` : ""),
            date("Primary Insurance Start Date", insured ? `${surgery.getFullYear()}-01-01` : ""),
            text("Primary Insurance Group ID", insured ? digits(7) : ""),
            text("Primary Relationship to Patient", insured ? "Self" : ""),
            text("Primary Insurance Type", selfPay ? "Self-pay" : planType(p), [...PLAN_TYPES, "Self-pay"]),
            text("Secondary Insurance", ""),
            text("Secondary Insurance ID", ""),
            date("Secondary Start Date", ""),
            text("Secondary Group ID", ""),
            text("Secondary Relationship to Patient", ""),
            text("Secondary Insurance Type", ""),
            text("Tertiary Insurance", ""),
            text("Tertiary Insurance ID", ""),
            date("Tertiary Start Date", ""),
            text("Tertiary Group ID", ""),
            text("Tertiary Relationship to Patient", ""),
            text("Tertiary Insurance Type", ""),
          ],
        },
        {
          title: "Other Info",
          fields: [
            check("Ortho Therapy Self-pay", lines.rtm.status === "self_pay"),
            text("CPT Code", ""),
            check("Self-pay", selfPay),
            check("Medicare", p.mcr === "YES"),
            text("Self-pay Status", selfPay ? (p.agreedSelfPayAmount ? "Agreed" : "Pending") : "", ["Agreed", "Pending"]),
            check("Veterans Administration (VA)", p.va === "YES"),
          ],
        },
      ],
    },
    {
      key: "hrc",
      label: "Home Rehab Coordinator",
      sections: [
        callResultSection(p),
        lostSection(p),
        {
          title: "Order",
          fields: [
            text("Current Order Status", statusText(primeStatusOf(p), substatusOf(p))),
            text("Patient Sales Team", "Ortho HRC", ["Ortho HRC"]),
            text("Call Stage", p.callStage),
            text("Department", ""),
          ],
        },
        {
          title: "Attachments",
          fields: [],
          files: [
            `Doc_${lastFirst}_Additional_Documentation.pdf`,
            `Doc_${lastFirst}_Clinical_Notes.pdf`,
            `Doc_${lastFirst}_DWO_Durable_Medical_Equipment_Order.pdf`,
            `Doc_${lastFirst}_Letter_of_Medical_Necessity_LMN.pdf`,
          ],
        },
      ],
    },
    {
      key: "delivery",
      label: "Delivery & Onboarding",
      sections: [
        {
          title: "Delivery",
          fields: [
            date("Scheduled Delivery Date", toISODate(addDays(surgery, -2))),
            text("Logistics Id", `R${digits(6)}`),
            date("Actual Delivery Date", delivered ? toISODate(addDays(surgery, -2)) : ""),
            text("Logistic Status", delivered ? "Delivered" : pick(LOGISTIC_STATUS), opts(LOGISTIC_STATUS)),
            text("Delivery Resources", ""),
            text("Logistics Type", lt),
            text("Scheduled Delivery Window End", ""),
            text("Warehouse Location", st ? `${st.name}, ${p.state} - ${lt}` : ""),
          ],
        },
        {
          title: "Onboarding",
          fields: [
            date("Scheduled Onboarding Date", toISODate(addDays(surgery, 1))),
            date("Actual Onboarding Date", ""),
            text("Onboarding Resources", ""),
          ],
        },
        {
          title: "Pickup",
          fields: [
            date("Scheduled Pickup Date", ""),
            date("Actual Pick Up Date", ""),
            text("Pick Up Resources", ""),
          ],
        },
      ],
    },
  ];
}

/* ---------------------------------------------------------------------------
   Registry: every record-tab field as a FieldDef, so list columns, filters and
   sorting can use them like any other field. Fields that only repeat a value
   already in the registry (name, age, phones, insurance, WIP, call stage,
   logistics type) are left out to avoid duplicates in pickers.
   --------------------------------------------------------------------------- */
export const DETAIL_SECTIONS: { section: FieldSection; tab: string; label: string }[] = [
  { section: "tab_patient", tab: "patient", label: "Patient Info tab" },
  { section: "tab_insurance", tab: "insurance", label: "Insurance & Eligibility tab" },
  { section: "tab_hrc", tab: "hrc", label: "Home Rehab Coordinator tab" },
  { section: "tab_delivery", tab: "delivery", label: "Delivery & Onboarding tab" },
];
const ALREADY_REGISTERED = new Set([
  "First name",
  "Last name",
  "Age",
  "Home phone",
  "Mobile phone",
  "Secondary phone",
  "Primary Insurance",
  "Current Order Status",
  "Call Stage",
  "Logistics Type",
  "Open/Won/Lost Status",
]);
/** Tab labels that clash with a core field's label, renamed in the registry only (the tab itself keeps its label). */
const LABEL_IN_PICKERS: Record<string, string> = { State: "State name" };
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
const detailKey = (tab: string, label: string) => `d_${tab}_${slug(label)}`;

/** Values per patient, computed once per patient object (records are replaced, not mutated, on edit). */
const cache = new WeakMap<Patient, Map<string, DetailValue>>();
function detailValues(p: Patient): Map<string, DetailValue> {
  let m = cache.get(p);
  if (!m) {
    m = new Map();
    for (const t of detailTabs(p)) for (const sec of t.sections) for (const f of sec.fields) m.set(detailKey(t.key, f.label), f.v);
    cache.set(p, m);
  }
  return m;
}

/** Placeholder record used only to read the tab layout (labels, kinds, options) at load time. */
const SHAPE: Patient = {
  id: "0", firstName: "", lastName: "", ownerId: null, callStage: "", wipState: "", salesStatus: "", btPatientId: "",
  btOrderId: "", state: "", lengthOfNeed: "", age: 50, classification: "", doctorNotes: "", physicianName: "", iomsOrderId: "",
  mcr: "NO", insuranceName: "", homePhone: "", mobilePhone: "", secondaryPhone: "", selfPayChargeDate: "",
  agreedSelfPayAmount: null, surgeryDate: "2026-01-01", expectedCloseDate: "2026-01-01", financialEstimate: null,
  createdAt: "2026-01-01T00:00:00Z", createdBy: "", nextTask: null, history: [],
};

export const DETAIL_FIELDS: FieldDef[] = detailTabs(SHAPE).flatMap((t) => {
  const section = DETAIL_SECTIONS.find((s) => s.tab === t.key)!.section;
  return t.sections.flatMap((sec) =>
    sec.fields
      .filter((f) => !ALREADY_REGISTERED.has(f.label))
      .map((f): FieldDef => {
        const key = detailKey(t.key, f.label);
        const kind = f.v.kind;
        const boolish = kind === "check" || kind === "yesno";
        return {
          key,
          // Field pickers list every field in one A–Z list, so labels must be unique there
          label: LABEL_IN_PICKERS[f.label] ?? f.label,
          section,
          type: boolish ? "enum" : kind === "date" ? "date" : kind === "phone" ? "phone" : kind === "money" ? "currency" : f.options ? "enum" : "text",
          options: boolish ? ["Yes", "No"] : f.options,
          get: (p) => {
            const v = detailValues(p).get(key);
            if (!v) return "";
            if (v.kind === "money") return v.value === null ? null : v.value / 100;
            return v.kind === "check" || v.kind === "yesno" ? (v.value ? "Yes" : "No") : v.value;
          },
        };
      }),
  );
});
