/**
 * Lost reasons and their subcategories (Creation Patient Lost Reason → Recommended Sub), as in the
 * reason sheet. "Prefers Alternative Rehabilitation" appears twice under Patient Declined there; it's listed once.
 */
export const LOST_REASONS: { reason: string; subs: string[] }[] = [
  { reason: "Cancelled", subs: ["DME/Office Cancelled Order", "Surgery Cancelled"] },
  { reason: "DME", subs: ["DME Performance"] },
  {
    reason: "Ineligible",
    subs: ["WiFi/Cellular Requirements Not Met", "Program Criteria Not Met", "Outside Delivery Territory", "Clinically Ineligible"],
  },
  { reason: "Other", subs: ["Duplicate Sales Order", "Patient Discharged to SNF"] },
  { reason: "Patient Deceased", subs: ["Deceased"] },
  {
    reason: "Patient Declined",
    subs: [
      "Not Interested",
      "Financial",
      "Post-Delivery (Pre-Enrollment (Cardiac)/Clearance (Ortho))",
      "Prefers Alternative Rehabilitation",
      "Medical",
      "Physician Advised Against",
    ],
  },
  { reason: "Refused Device Delivery", subs: ["Insufficient Space in Home", "Did Not Understand Program"] },
  {
    reason: "Timing/Window",
    subs: ["Medicare Window Missed (MCW)", "Ortho - Order Received < 5 Business Days (MCW)", "Patient starts HBCR Immediately"],
  },
  { reason: "Unreachable", subs: ["6 Call Cadence Completed", "Logistics", "Phone Number Disconnected"] },
  { reason: "No SP", subs: ["VA", "MCD", "W/Comp"] },
];

export const LOST_REASON_NAMES = LOST_REASONS.map((r) => r.reason);
export const LOST_SUB_REASONS = [...new Set(LOST_REASONS.flatMap((r) => r.subs))];

export interface LostReason {
  reason: string;
  sub: string;
}
