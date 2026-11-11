/**
 * Call script content, ported from the Base44 "HRC Convo Co-Pilot" Script table export (Nov 2026).
 *
 * Only the live rows were kept: one per scenario key the picker can return, plus Introduction,
 * Patient Education and the delivery scripts. Dropped: legacy rows with no section, duplicate
 * pilot / non-pilot copies, the `*_fallback` and `dme_oot_ot_denied*` drafts (their text is already
 * inside the main scripts) and `insuranceOutcome_partial_*` (never returned by the picker).
 *
 * Wording is the business's and is unchanged, except:
 *  - placeholders are normalised (see render.ts; case, hyphens and spaces don't matter)
 *  - hardcoded figures became placeholders: VA "$1,479.77" → [TOTAL_SELF_PAY_AMOUNT],
 *    Medicare Covered "30-day program" → [PLAN_DAYS]-day, delivery "2027" → [NEXT_YEAR],
 *    FS/DME "[Date]" → [SURGERY_DATE]
 *  - "[DME_SELF_PAY_AMOUNT] + [RTM_EPR]" (read out literally as two figures) → [DME_SELF_PAY_PLUS_RTM_EPR]
 *  - Missed Medicare Window quotes the full-program self-pay total, not the DME price alone
 *  - "---" added before the Fallback blocks in the two commercial partial scripts, so they fold like the rest
 *
 * In these scripts "OT" / "RTM" mean the therapy portion. ROMCRM bills RTM and OT separately,
 * so the RTM_* placeholders are RTM + OT combined (see calculator.ts).
 *
 * Format (render.ts): a line in quotes is spoken; (…) is a stage direction; a bracketed line on its own
 * is a heading; "---" starts a sub-section whose first line is its title; a line starting with
 * "CONDITIONAL IF TP GOES INTO [NEXT_YEAR]:" only shows when the treatment plan crosses 1 January.
 */
import type { ScenarioKey } from "./scenario";

export interface Script {
  title: string;
  content: string;
}

const FORM_3A = `---
3A. Patient Financial Responsibility Form

"Perfect — we're almost done here."

"The last thing I need is a quick Financial Responsibility form. This just confirms the insurance and billing information we reviewed together today, including your estimated patient responsibility and any potential coverage changes once the claim is processed."

"I'm sending that over now — just let me know once it comes through and I'll help you complete it."`;

const MA_3B = `---
3B. Medicare Advantage 48-Hour Window

"Ok great! Now that we've got everything set up, I did just want to quickly go over one important requirement with your Medicare Advantage plan."

"In order for us to be able to submit the claim, Medicare Advantage requires that you begin using the device within the first 48 hours after surgery and complete at least one rehab session."

"This typically is not an issue — our patients generally do well getting started on time, especially since the device is already there and ready to go once you get home."

"Does that make sense?"`;

const GAP_EXCEPTION_BODY = (timing: string, worstCase: string) => `"As it stands today, because we're not currently in network with your insurance plan, this program would fall under our discounted self-pay option which would come out to [TOTAL_SELF_PAY_AMOUNT]"

"However, rather than simply asking you to pay out of pocket right now, our team is working directly with your insurance to request a special exception that would allow your treatment to be covered through your insurance benefits."

"${timing}"

"If your insurance approves the exception, we'll process everything through your insurance. Based on the information we've received so far, your estimated patient responsibility would be approximately [TOTAL_EPR]."

"Now, that's only an estimate. Your insurance will make the final determination once they review and process the claim."

"Does that make sense?"

"${worstCase}"

"If your insurance isn't able to approve the exception, the program would remain available under our discounted self-pay rate I mentioned earlier which would be [TOTAL_SELF_PAY_AMOUNT] for the full program."

"Does that make sense?"

"Our goal is absolutely to get this covered through your insurance, and we'll continue working on that while you recover."

"The only thing I need to confirm is that if your insurance isn't able to approve the exception, you're comfortable moving forward at the discounted self-pay rate so your rehabilitation isn't delayed."

"Is that something you're comfortable with?"

(If yes)

"Perfect."

"The next step is to reserve your device so it's ready for you after surgery. We'll simply keep a card on file while we continue working with your insurance."

"We won't charge your card today."

"If your insurance approves the exception, we'll process everything through your insurance. If they don't, we'll contact you before we process the self-pay amount."

"Let's go ahead and get your device reserved."

"What card would you like to use?"`;

const COVERED_BODY = `"Let's go over how your insurance works for the device."

"Based on your plan, your estimated patient responsibility, if covered, would be about [PATIENT_RESPONSIBILITY]."

"Now, this is an estimate from your insurance — it doesn't guarantee coverage. The final amount can change once the claim is submitted and reviewed."

"What we do is move forward based on that estimated amount today, and then once your treatment is complete, we bill your insurance and go through the full review and appeal process."

"In the event that your insurance does end up not covering the device, it would move to a discounted self-pay rate of [DME_SELF_PAY_AMOUNT], and anything you've paid today would go toward that total."

"Our goal is always to get this covered through insurance — and the discounted self-pay rate protects you from a surprise paper bill on the back end and also guarantees we can reserve a unit for you right now."

"Does that make sense?"

"So your total today comes out to [PATIENT_RESPONSIBILITY]."

"How would you like to take care of that?"

"Between those two options, which works better for you?"

"Perfect—let's go ahead and get that set up."

---
Fallback #1 — $25 Card Hold
(If they resist EPR)

"I understand."

"In some cases, what we can do is place a small $25 deposit today, which goes toward your final balance."

"That allows us to move forward with your program and reserve your device while we wait for your insurance to process."

"Once we hear back, we'll go over your final responsibility and set up a payment plan at that point, but in order to do that I just need to get my manager's approval. If I can get that approved would you be comfortable moving forward with that?"`;

const PARTIAL_THERAPY_DENIED_BODY = `"Our team has been working with your insurance, and we've confirmed that part of your treatment is eligible to go through insurance, while another portion is not covered under your plan. Let me explain how this works."

"For the portion we are submitting to go through insurance, your estimated patient responsibility, if covered, would be about [DME_EPR]."

"Now, this is an estimate from your insurance — it doesn't guarantee coverage. The final amount can change once the claim is submitted and reviewed."

"What we do is move forward based on that estimated amount today, and then once your treatment is complete, we bill your insurance and go through the full review and appeal process."

"In the event that your insurance ends up not covering this portion, it would move to a discounted self-pay rate of [DME_SELF_PAY_AMOUNT], and anything you've paid today would go toward that total."

"Does that make sense?"

"Now, there is a portion of the program that is not going through insurance, and that portion would be handled under our discounted self-pay rate of [RTM_SELF_PAY_AMOUNT]."

"So, to get everything set up and make sure there's no delay with your rehab, your total today comes out to [TOTAL_EPR]."

"How would you like to take care of that?"

"Between those two options, which works better for you?"

"Perfect — let's go ahead and get that set up."

"What's the best card you'd like to use?"`;

const PARTIAL_THERAPY_DENIED_FALLBACK = `---
Fallback — Self-Pay Portion Only (Manager Approval Required)

"I understand."

"In some cases, we may be able to move forward today with just the self-pay portion of [RTM_SELF_PAY_AMOUNT] for the service that isn't going through insurance, and then wait for the final insurance processing on the remaining portion."

"That option would require manager approval."

"If I'm able to get that approved for you, would you feel comfortable moving forward today so there's no delay with your rehab?"

"Perfect — let's go ahead and get that set up."`;

const PARTIAL_DME_DENIED_BODY = `"Our team has been working with your insurance plan, and we've confirmed that they will cover part of your treatment."

"For the portion that is covered, based on your plan, your estimated patient responsibility would be about [RTM_EPR]."

"That amount is still an estimate from your insurance, so the final amount can change once the claim is fully processed after treatment."

"The portion that is not going through insurance would be handled under our discounted self-pay rate, which comes to [DME_SELF_PAY_AMOUNT]."

"So today, your total comes out to [TOTAL_EPR]."

"Most patients prefer to take care of that upfront, but we can also break that into monthly payments up to 12 months if needed."

"Between those two options, which works better for you?"

"Perfect — let's go ahead and get that set up."

---
Fallback — Self-Pay Portion Only (Manager Approval Required)
(If patient hesitates on full amount)

"I understand."

"In some cases, we may be able to move forward today with just the self-pay portion of [DME_SELF_PAY_AMOUNT] for the service that isn't going through insurance, and then wait for the final insurance processing on the remaining portion."

"That option would require manager approval."

"If I'm able to get that approved for you, would you feel comfortable moving forward today so there's no delay with your rehab?"

"Perfect — let's go ahead and get that set up."`;

const PENDING_INTRO = `"Right now, your insurance authorization is still pending, and because your surgery is coming up soon, we may not have a final determination before your surgery date."`;

const PENDING_MIDDLE = `"So what we do is move forward based on that estimated amount today so we can reserve your device and make sure there's no delay in starting your rehab."

"Once your treatment is complete, we bill your insurance and go through the full review and appeal process."

"If your insurance approves the claim, then everything is already taken care of."`;

const PENDING_REASSURE = `"Our goal is always to get this covered through insurance — we're just making sure everything is clear upfront and that you're protected from a surprise bill on the back end while also guaranteeing we can reserve a unit for you now."

"Does that make sense?"`;

const REDUCED_DEPOSIT_FALLBACK = `---
Fallback — Reduced Deposit (Manager Approval Required)
(If patient hesitates on full deposit)

"I understand."

"In some cases, we may be able to move forward with a reduced deposit today of just [RTM_SELF_PAY_AMOUNT] and then review the remaining balance once we receive the final insurance determination."

"That option would require manager approval."

"If I'm able to get that approved for you, would you feel comfortable moving forward today so there's no delay with your rehab?"`;

const OON_PARTIAL_FALLBACK = (portion: string) => `---
Fallback — Partial Self-Pay (Manager Approval Required)
(If patient hesitates on full balance / EPR collection)

"I understand."

"In some cases, what we may be able to do is take the portion of the program that falls under your out-of-network benefits and instead handle that under our discounted self-pay option."

"That can sometimes help reduce the upfront cost and keep the billing more straightforward and predictable."

"That option would require manager approval."

"If I'm able to get that approved for you, would you feel comfortable moving forward today so there's no delay with your rehab?"

"Perfect — under that option, that portion of the program would move to the discounted self-pay rate of [${portion}]."

"And for that amount, most patients prefer to take care of it upfront, but we can also break that into monthly payments if needed."

"Between those two options, which works better for you?"

"Perfect — let's go ahead and get that set up."`;

const MEDICARE_WINDOW = `"One important requirement with Medicare is that you'll need to start the program within 48 hours after surgery and complete at least one session for coverage to apply."

"This should not be an issue at all. Our patients typically don't have any trouble getting started on time."

"If for any reason you aren't able to start within that timeframe, we'll file an appeal with Medicare on your behalf. And even if coverage ultimately isn't approved, we are able to offer a discounted self-pay rate of [DME_SELF_PAY_AMOUNT] for the full program."

"Medicare also requires an ABN form for this program. This simply confirms that we've reviewed coverage and any potential financial responsibility with you."

"I'm going to send that over now. Just let me know when you receive it, and I'll walk you through it."`;

const join = (...parts: string[]) => parts.join("\n\n");

export const OUTCOME_SCRIPTS: Record<ScenarioKey, Script> = {
  va_pending: {
    title: "VA Pending",
    content: `"Right now, your request is still pending with the VA. We're waiting for them to come back with their final decision, but because your surgery is coming up, we don't want to wait on that decision before getting everything else ready for you."

"The VA can sometimes take a little while to get back to us, so we can actually move forward with getting your program set up today while that review is still taking place."

"If the VA approves the program, they will take care of the cost and you will have no out-of-pocket responsibility."

"If they end up denying the request, we do have a self-pay option of [TOTAL_SELF_PAY_AMOUNT], but nothing is being collected from you today for that amount. If we receive a denial, we'll reach back out to you, explain the next steps, and go over payment options with you at that time."

"Our goal is really just to keep your recovery on schedule rather than have you waiting on the VA's turnaround time and delaying your recovery."

"So, let's go ahead and get everything taken care of on our end today, and we'll continue working with the VA in the meantime."`,
  },

  gap_exception: {
    title: "Single Case / Gap Exception (Card on File Only)",
    content: GAP_EXCEPTION_BODY(
      "Because your surgery is coming up soon, we likely won't have a final decision before it's time for you to begin your rehabilitation.",
      "Since we won't have that final answer before your surgery, I do want to review the worst-case scenario so there aren't any surprises.",
    ),
  },

  gap_exception_60_plus: {
    title: "Single Case / Gap Exception (Surgery 60+ Days Out)",
    content: GAP_EXCEPTION_BODY(
      "Since your surgery is more than 60 days away, we do have time to work with your insurance to try to get a decision before it's time for you to begin your rehabilitation.",
      "Since we have some time before your surgery, I do want to review the worst-case scenario so there aren't any surprises.",
    ),
  },

  oon_both: {
    title: "High OOP — Both Out of Network",
    content: join(
      `"Based on your plan, your coverage would fall under your out-of-network benefits, and right now your estimated patient responsibility through insurance would be about [PATIENT_RESPONSIBILITY]."

"So before we decide the best route for you, let me ask — do you typically use out-of-network providers or hit your out-of-network deductible during the year?"

"Do you expect to have any other large out-of-network medical expenses this year?"

"Got it."

"In situations like this, a lot of patients choose to compare the out-of-network route against our discounted self-pay rate. Which for the full program comes to [TOTAL_SELF_PAY_AMOUNT], and that fully covers the treatment without needing to go through insurance."

"So really, your two options would be:"

"Move forward through your out-of-network insurance benefits at an estimated responsibility of about [PATIENT_RESPONSIBILITY] or use the discounted self-pay option at [TOTAL_SELF_PAY_AMOUNT]."

"Between those two options, which one makes the most sense for you?"

---
If They Choose Self-Pay:
"How would you like to take care of that?"
"Between those two options, which works better for you?"

---
If They Choose OON Insurance Route:
"So to move forward through your out-of-network benefits, we would collect the estimated patient responsibility of [PATIENT_RESPONSIBILITY] today."
"Most patients prefer to take care of that upfront, but we can also break that into monthly payments if needed."
"Between those two options, which works better for you?"

---
Fallback — $25 Card Hold (Manager Approval Required)
(If patient resists EPR or upfront collection)

"I understand."

"In some cases, what we can do is place a small $25 deposit today, which would go toward your final balance."

"That allows us to move forward with your program and reserve your device while we wait for the final insurance determination."

"If your insurance processes the claim as expected, we would simply refund that $25 back to you."

"If the claim ends up not being covered, that $25 would go toward the discounted self-pay amount."

"To move forward under that option, I would just need to get manager approval."

"If I'm able to get that approved, would you feel comfortable moving forward so we can keep your rehab on track?"

"Perfect — let's go ahead and get that set up."

"What's the best card you'd like to use?"`,
      FORM_3A,
      MA_3B,
    ),
  },

  oon_dme_denied_ot: {
    title: "DME Out of Network / Therapy Denied",
    content: `"Our team has been working with your insurance plan, and we've determined that a portion of your treatment would fall under your out-of-network benefits, while the other portion is not covered by your insurance."

"The portion that is not going through insurance would be handled under our discounted self-pay rate, which comes to [RTM_SELF_PAY_AMOUNT]."

"Now, for the portion of your program, that would process under your out-of-network benefits. Based on the information we received from your insurance, your estimated patient responsibility for that portion would be [DME_EPR]."

"Because this falls under your out-of-network benefits, we also offer a discounted self-pay option that does not go through insurance, which comes to [DME_SELF_PAY_AMOUNT]."

"So, for this can either move forward through your out-of-network insurance benefits or use the discounted self-pay option. Which one makes the most sense for you?"

"Perfect. So your total today comes out to [TOTAL_SELF_PAY_AMOUNT]."

"Most patients prefer to take care of that upfront, but we can also break that into monthly payments, including up to 12 months if needed. Between those two options, which works better for you?"

"Perfect — let's go ahead and get that set up."

---
Fallback — Self-Pay (Manager Approval Required)

"I understand."

"In some cases, we may be able to move forward today with just the self-pay portion of [RTM_SELF_PAY_AMOUNT] for the service that isn't going through insurance, and then wait for the final insurance processing on the remaining portion."

"That option would require manager approval."

"If I'm able to get that approved for you, would you feel comfortable moving forward today so there's no delay with your rehab?"

"Perfect — let's go ahead and get that set up."`,
  },

  oon_ot_denied_dme: {
    title: "DME Denied / Therapy Out of Network",
    content: `"Our team has been working with your insurance plan, and we've determined that a portion of your treatment would fall under your out-of-network benefits, while the other portion is not covered by your insurance."

"Now, for the portion of your program that would process under your out-of-network benefits, your estimated patient responsibility for that portion would be approximately [RTM_EPR]."

"Because this falls under your out-of-network benefits, we offer all patients a discounted self-pay option that does not go through insurance, which comes to [RTM_SELF_PAY_AMOUNT]."

"So, for the portion, we can either move forward through your out-of-network insurance benefits or use the discounted self-pay option. Which one makes the most sense for you?"

"Perfect! Now, for the portion that we've confirmed that your insurance will not be covering, that will also move to our discounted self-pay rate which comes to [DME_SELF_PAY_AMOUNT]."

"So that means your total for today is [TOTAL_SELF_PAY_AMOUNT]."

"Most patients prefer to take care of that upfront, but we can also break that into monthly payments, including up to 12 months if needed. Between those two options, which works better for you?"

"Perfect — let's go ahead and get that set up."

---
Fallback — Move Self-Pay (Manager Approval Required)

"I understand."

"In some cases, we may be able to move forward today with just the self-pay portion of [RTM_SELF_PAY_AMOUNT] for the service that isn't going through insurance, and then wait for the final insurance processing on the remaining portion."

"That option would require manager approval."

"If I'm able to get that approved for you, would you feel comfortable moving forward today so there's no delay with your rehab?"

"Perfect — let's go ahead and get that set up."`,
  },

  oon_dme_only: {
    title: "High OOP — DME Out of Network, Therapy In Network",
    content: join(
      `"Our team has been working with your insurance plan, and we've confirmed that they will cover part of your treatment."

"For the portion that is covered, based on your plan, your estimated patient responsibility would be about [RTM_EPR]."

"That amount is still an estimate from your insurance, so the final amount can change once the claim is fully processed after treatment."

"The other portion falls under your out-of-network benefits which comes to [DME_EPR]. Now because this falls under your out-of-network benefits, we do offer all patients a discounted self-pay rate that does not run through insurance which comes to [DME_SELF_PAY_AMOUNT]."

"So, for this portion we can move forward through your out-of-network insurance benefits or use the discounted self-pay option."

"Which one makes the most sense for you?"

"Perfect, so today, your total comes out to [DME_SELF_PAY_PLUS_RTM_EPR]."

"Most patients prefer to take care of that upfront, but we can also break that into monthly payments up to 12 months if needed."

"Between those two options, which works better for you?"

"Perfect — let's go ahead and get that set up."`,
      OON_PARTIAL_FALLBACK("DME_SELF_PAY_AMOUNT"),
      FORM_3A,
      MA_3B,
    ),
  },

  oon_rtm_only: {
    title: "High OOP — Therapy Out of Network, DME In Network",
    content: join(
      `"Part of your treatment is eligible to process through your insurance benefits, while another portion would fall under your out-of-network coverage."

"For the portion we are submitting to go through insurance, your estimated patient responsibility, if covered, would be about [DME_EPR_PLUS_RTM_SELF_PAY]."

"Now, this is an estimate from your insurance — it doesn't guarantee coverage. The final amount can change once the claim is submitted and reviewed."

"What we do is move forward based on that estimated amount today, and then once your treatment is complete, we bill your insurance and go through the full review and appeal process."

"In the event that your insurance ends up not covering this portion, it would move to a discounted self-pay rate of [DME_SELF_PAY_AMOUNT], and anything you've paid today would go toward that total."

"Does that make sense?"

"Now, for the portion of the program that falls under your out-of-network coverage, that estimated patient responsibility comes out to [RTM_EPR]. Because this falls under your out-of-network benefits, we do offer all patients a discounted self-pay rate that does not run through insurance which comes to [RTM_SELF_PAY_AMOUNT]."

"So, for this portion we can move forward through your out-of-network insurance benefits or use the discounted self-pay option."

"Which one makes the most sense for you?"

"Perfect, so then your total today comes out to [TOTAL_EPR]."

"How would you like to take care of that?"

"Between those two options, which works better for you?"

"Perfect — let's go ahead and get that set up."`,
      OON_PARTIAL_FALLBACK("RTM_SELF_PAY_AMOUNT"),
      FORM_3A,
      MA_3B,
    ),
  },

  pending_inn: {
    title: "Pending Auth — DME Pending, Therapy In Network",
    content: join(
      PENDING_INTRO,
      `"Based on your plan, if approved, your estimated patient responsibility would be about [PATIENT_RESPONSIBILITY]."`,
      PENDING_MIDDLE,
      `"In the event your insurance does not cover the device, it would move to our discounted self-pay rate of [DME_SELF_PAY_PLUS_RTM_EPR], and anything you've paid today would go toward that total."`,
      PENDING_REASSURE,
      `"So your total today comes out to [PATIENT_RESPONSIBILITY]."

"How would you like to take care of that?"

"Between those two options, which works better for you?"

"Perfect — let's go ahead and get that set up."

---
Fallback #1 — $25 Card Hold (If patient resists EPR collection)

"I understand."

"In some cases, what we can do is place a small $25 deposit today, which would go toward your final balance."

"That allows us to move forward with your program and reserve your device while we wait for the final insurance determination."

"If your insurance approves the device, we would simply refund that $25 back to you."

"If the device ends up not being covered, that $25 would go toward the discounted self-pay amount."

"To move forward under that option, I would just need to get manager approval."

"If I'm able to get that approved for you, would you feel comfortable moving forward so we can keep your rehab on track?"

"Perfect — let's go ahead and get that set up."`,
      FORM_3A,
      MA_3B,
    ),
  },

  pending_oon: {
    title: "Pending Auth — DME Pending, Therapy Out of Network",
    content: join(
      PENDING_INTRO,
      `"Based on your plan, if approved, your estimated patient responsibility would be about [DME_EPR_PLUS_RTM_SELF_PAY]."`,
      PENDING_MIDDLE,
      `"In the event your insurance does not cover the device, it would move to our discounted self-pay rate of [DME_SELF_PAY_PLUS_RTM_EPR], and anything you've paid today would go toward that total."`,
      PENDING_REASSURE,
      `"So your total today comes out to [DME_EPR_PLUS_RTM_SELF_PAY]."

"Most patients prefer to take care of that upfront, but we can also break that into monthly payments, up to 12 months if that's easier."

"Between those two options, which works better for you?"

"Perfect — let's go ahead and get that set up."`,
      REDUCED_DEPOSIT_FALLBACK,
      FORM_3A,
      MA_3B,
    ),
  },

  pending_denied: {
    title: "Pending Auth — DME Pending, Therapy Denied",
    content: join(
      PENDING_INTRO,
      `"Based on your plan, if approved, your estimated patient responsibility would be about [TOTAL_EPR]."`,
      PENDING_MIDDLE,
      `"In the event your insurance does not cover the device, it would move to our discounted self-pay rate of [TOTAL_SELF_PAY_AMOUNT], and anything you've paid today would go toward that total."`,
      PENDING_REASSURE,
      `"So your total today comes out to [TOTAL_EPR]."

"Most patients prefer to take care of that upfront, but we can also break that into monthly payments, up to 12 months if that's easier."

"Between those two options, which works better for you?"

"Perfect — let's go ahead and get that set up."`,
      REDUCED_DEPOSIT_FALLBACK,
      FORM_3A,
      MA_3B,
    ),
  },

  medicare_missed_window: {
    title: "Medicare — Missed 48-Hour Window",
    content: `"Let's go over how your insurance works for the program."

"With Medicare, there is a requirement that patients begin using the device within the first 48 hours after surgery in order for the treatment to qualify for coverage."

"Unfortunately, we received your prescription without enough time to get you started in that window, which means Medicare would not cover the program at this point."

"The good news is we can still move forward under our discounted self-pay option so you can still have access to the full rehabilitation program and continue your recovery without interruption."

"That discounted self-pay rate comes to [TOTAL_SELF_PAY_AMOUNT] for the full program."

"How would you like to take care of that?"

"Between those two options, which works better for you?"

"Perfect — let's go ahead and get that set up."`,
  },

  medicare_hip: {
    title: "Medicare — DME Denied (Hip)",
    content: `"We checked your Medicare coverage, and for hip replacement procedures, Medicare does not cover the use of this device. But the good news is, we do offer all patients a discounted self-pay option so you can still move forward with the rehabilitation program your surgeon prescribed."

"That discounted self-pay rate comes to [TOTAL_EPR] for the full program."

"Most patients prefer to take care of that upfront, but we can also break that into monthly payments from 3 to 6 months if needed."

"Between those two options, which works better for you?"

(If they are not able to do 6 months)
"Ok, we sometimes are able to extend to 12 months interest free but that will require manager approval. If I am able to get that approved for you, can we move forward now?"

(Conditional — Hardship Process)
"We do have a hardship option for patients who qualify. It's a short application where we review household income and financial circumstances. Approval isn't guaranteed."`,
  },

  medicare_medicaid: {
    title: "Traditional Medicare — Medicaid Secondary",
    content: `"Based on the work our team has done with Medicare and your secondary being Medicaid, your program is expected to be covered."

"Your estimated patient responsibility is $0, so there is nothing due from you today."

"One important requirement with Medicare is that you'll need to start the program within 48 hours after surgery and complete at least one session during that time."

"This should not be an issue — our patients typically don't have any trouble getting started on time."

"If for some reason you aren't able to start within that window, just let us know and we'll work with you and file an appeal with Medicare on your behalf."

"As long as you complete that first session within the first two days after surgery, everything should stay right on track."

"Does that make sense?"`,
  },

  medicare_zero_epr: {
    title: "Traditional Medicare — $0 Estimate",
    content: join(
      `"Based on the work our team has done with Medicare, your program is expected to be covered."`,
      MEDICARE_WINDOW,
      `"At this time, your estimated responsibility is $0, so there is nothing due today."

"We do ask that you keep a card on file for your account. The card would only be used if Medicare ultimately denies coverage and all appeal options have been exhausted. Otherwise, your coverage would process through Medicare as expected."

"So let's go ahead and get a card on file and then we'll have everything ready for your program."`,
    ),
  },

  medicare_covered: {
    title: "Traditional Medicare — Covered",
    content: join(
      `"Based on the work our team has done with Medicare, your program is expected to be covered."`,
      MEDICARE_WINDOW,
      `"In addition, we'll keep a card on file for your account. The card would only be used if Medicare ultimately denies coverage and all appeal options have been exhausted. Otherwise, your coverage would process through Medicare as expected."

"For the full [PLAN_DAYS]-day program your doctor prescribed, your estimated responsibility comes out to [PATIENT_RESPONSIBILITY]."

"Most patients prefer to take care of that upfront, but we can also break that into monthly payments, including up to 12 months if needed."

"Between those two options, which works better for you?"

"Perfect—let's go ahead and get that set up."`,
    ),
  },

  zero_epr: {
    title: "Medicare Advantage / Commercial — $0 Estimate",
    content: join(
      `"Let's go over how your insurance works for the device."

"Based on your plan, your estimated patient responsibility, if covered, would be $0."

"Now, this is an estimate from your insurance — it doesn't guarantee coverage. The final amount can change once the claim is submitted and reviewed."

"Once your treatment is complete, we bill your insurance and go through the full review and appeal process."

"If your insurance approves the claim, then everything is fully taken care of."

"In the event that your insurance does not cover the device, it would move to a discounted self-pay rate of [DME_SELF_PAY_AMOUNT]."

"Does that make sense?"

"So what we do today is place a card on file and run a small $25 hold to keep everything moving and reserve your device."

"If your insurance approves the claim, that $25 is refunded back to you."

"If the device ends up not being covered, that $25 would simply go toward the discounted self-pay amount."

"Let's go ahead and get that set up. What's the best card you'd like to use?"`,
      FORM_3A,
      MA_3B,
    ),
  },

  medadv_covered: {
    title: "Medicare Advantage — Covered",
    content: join(COVERED_BODY, FORM_3A, MA_3B),
  },

  medadv_partial_rtm_denied: {
    title: "Medicare Advantage — Partial Self-Pay (Therapy Denied, DME Covered)",
    content: join(
      PARTIAL_THERAPY_DENIED_BODY,
      `---
Fallback — Self-Pay Portion Only (Manager Approval Required)

"I understand."

"In some cases, we may be able to move forward today with just the self-pay portion of [RTM_SELF_PAY_AMOUNT] for the service that isn't going through insurance, and then wait for the final insurance processing on the remaining portion."

"That option would require manager approval."

"If I'm able to get that approved for you, would you feel comfortable moving forward today so there's no delay with your rehab?"

"Perfect — under that option, that portion of the program would move to the discounted self-pay rate of [RTM_SELF_PAY_AMOUNT]."

"And for that amount, most patients prefer to take care of it upfront, but we can also break that into monthly payments if needed."

"Between those two options, which works better for you?"

"Perfect — let's go ahead and get that set up."`,
      FORM_3A,
      MA_3B,
    ),
  },

  medadv_partial_dme_denied: {
    title: "Medicare Advantage — Partial Self-Pay (Therapy Covered, DME Denied)",
    content: join(PARTIAL_DME_DENIED_BODY, FORM_3A, MA_3B),
  },

  commercial_covered: {
    title: "Commercial — Covered",
    content: join(COVERED_BODY, FORM_3A),
  },

  commercial_partial_rtm_denied: {
    title: "Commercial — Partial Self-Pay (Therapy Denied, DME Covered)",
    content: join(PARTIAL_THERAPY_DENIED_BODY, PARTIAL_THERAPY_DENIED_FALLBACK),
  },

  commercial_partial_dme_denied: {
    title: "Commercial — Partial Self-Pay (Therapy Covered, DME Denied)",
    content: PARTIAL_DME_DENIED_BODY,
  },

  not_covered: {
    title: "Not Covered — Self-Pay",
    content: join(
      `"I reviewed your insurance and they will not be covering the treatment. However, I have good news, we offer all patients a standard self-pay rate, which is discounted to [TOTAL_SELF_PAY_AMOUNT] for the full length of your program."

"Most patients prefer to take care of that upfront, but we can also break that into monthly payments if needed."

"Between those two options, which works better for you?"

(Conditional — Hardship Process)
"We do have a hardship option for patients who qualify. It's a short application where we review household income and financial circumstances. Approval isn't guaranteed."`,
      FORM_3A,
    ),
  },
};

export const INTRODUCTION: Script = {
  title: "Introduction",
  content: `[HRC Opening]

"Hi, this is [HRC_NAME] from ROMTherapy. Am I speaking with [PATIENT_NAME]?"

"Hi [PATIENT_FIRST_NAME], how are you doing today?"

(Pause and let the patient answer.)

"I'm really happy to hear that, and I'm glad I was able to reach you today. I appreciate you taking the time to speak with me."

"Just so I can confirm I have the right patient, can I please have you confirm your date of birth?"

(Patient verifies DOB.)

"Perfect, thank you."

"We have your prescription from Dr. [PHYSICIAN_NAME] for the ROMTech PortableConnect, and I'm calling to walk you through the program and help get you started with your rehabilitation."

"Did Dr. [PHYSICIAN_NAME] have a chance to go over the PortableConnect with you, or have you heard anything about it yet?"

(If YES — patient has heard about the program)

"Perfect. I'll just fill in anything they may not have had time to go over with you and make sure you understand what to expect from the program."

(If NO — patient has not heard about the program)

"No problem at all. I'll give you a quick overview of the PortableConnect, how the program works, and what you can expect throughout your recovery."`,
};

export const PATIENT_EDUCATION: Script = {
  title: "Patient Education",
  content: `"Starting immediately after surgery, you'll begin with passive motion, where the device gently moves your leg for you. This helps reduce stiffness and manage pain early on, before you're ready to actively participate."

"As you progress, you'll move into active pedaling, where you begin doing the work yourself to improve range of motion, mobility, and extension. Toward the later stages of recovery, we gradually introduce light resistance to help rebuild strength in a safe, controlled way."

"You'll complete short sessions multiple times a day. This frequent, guided movement is important because recovery is built on consistency — not pushing too hard all at once."

"Throughout your program, our clinical team remotely monitors your progress, including usage, range of motion, and any symptoms you report. If pain levels increase, progress slows, or something looks off, the team reaches out to support you and adjust your treatment plan if needed."

"Your progress data is also shared with your surgeon's office so they can stay informed between visits and ensure your recovery is on track."

"Overall, this is a personalized, structured rehabilitation program designed to help you regain mobility, strength, and confidence following surgery — with support built in, not just instructions."`,
};

const NEXT_YEAR_CHECK = `CONDITIONAL IF TP GOES INTO [NEXT_YEAR]: "Before we schedule your delivery, I just need to confirm, do you know if you are keeping your same insurance for [NEXT_YEAR]?" (If they are changing insurance, get what their provider will be in [NEXT_YEAR] and add that to your note.)`;

/** Delivery script by ROMCRM logistics type: DME → FS/DME, BTX → 3PL, AIT → self-training (from Base44 AitScript.jsx). */
export const DELIVERY_SCRIPTS: Record<"DME" | "BTX" | "AIT", Script> = {
  DME: {
    title: "Delivery & Next Steps — FS / DME",
    content: `${NEXT_YEAR_CHECK}

"I see that your surgery is scheduled for [SURGERY_DATE]. Is that correct?"

"Perfect. Our delivery team will be reaching out shortly to set up the exact day and time for your delivery and device tutorial. You'll see a call come through from ROMTech, so please be sure to answer when they call."

"Can you please confirm the address where you'll be recovering and completing your rehabilitation?"

"Is the phone number we're using now the best number to reach you?"

"Do you have a secondary phone number, or a family member or caregiver's number, that we can use if needed?"

"And last question, are you okay receiving text message updates from us?"

"Ok, great! That is everything I had to go over, any questions before we hop off?"`,
  },
  BTX: {
    title: "Delivery & Next Steps — 3PL",
    content: `${NEXT_YEAR_CHECK}

"Alright, the last step on my end is to get you connected with our scheduling team, who will take care of the delivery of the PortableConnect."

"Once your PortableConnect arrives, please take a few minutes to complete the mandatory device tutorial. That way you're all set to start rehab right after surgery."

"It's important to note that this onboarding session does not count toward Medicare's 48-hour requirement. You will still need to begin at least one pedaling session within 48 hours after surgery to meet that requirement. Does that make sense?"

"I'm going to transfer you directly into their queue now so they can schedule those for you."

"If for any reason you get disconnected, keep an eye on your phone — they'll be reaching out to you to schedule delivery."

"And last question, are you okay receiving text message updates from us?"

"Do you have a few minutes to stay on the line while I transfer you?"

(Once patient agrees)

"Great — I'm going to transfer you now."`,
  },
  AIT: {
    title: "Delivery Scheduling & Self-Training — AIT",
    content: `${NEXT_YEAR_CHECK}

[1. Confirm Patient Information]

"Perfect! Now I'm going to confirm a few details and schedule your device delivery."

"I have your delivery address as [read full address]. Is that correct?"

(If incorrect, update the address.)

"How tall are you?"

"Are there any steps or stairs our delivery team may need to go up or down when delivering your device?"

"Do you have any pets our delivery team should be aware of?"

[2. Confirm Chair Requirements]

"Before we schedule your delivery, I want to make sure you have a safe, stable chair to use with your device. You'll need a chair with a back and four legs, such as a kitchen or dining room chair. It must be placed against a wall or secured so it cannot move, and it cannot have wheels."

(If the patient only has a couch or recliner)

"You'll need a chair that allows you to sit upright without rocking, rolling, reclining, or sinking into the seat. Do you have a chair that would work for you?"

[3. Schedule Delivery]

"With your surgery scheduled for [SURGERY_DATE], we want to make sure your device arrives before your surgery."

"We can schedule your delivery for [delivery date]. Does that work for you?"

[4. Review Self-Training Requirements]

"Now that we have your delivery scheduled, I want to briefly explain your Self-Training."

"Your device will come with a tablet that walks you through the training process. When your device is delivered, please have your Wi-Fi network name and password available so our delivery team can connect the tablet to your Wi-Fi."

"Once connected, you can access your Self-Training and complete it right away or in the days leading up to your surgery."

MEDICARE ONLY: "It's important that you complete your Self-Training before surgery and within the 48-hour window required by your insurance."

"The tablet will guide you through each step with on-screen instructions. If you need assistance, you can contact Customer Service at 888-457-6430."

[5. Recap & Close]

"Just to recap, your device delivery is scheduled for [delivery date], and our delivery team will call you the evening before to confirm your delivery timeframe. Remember to have your Wi-Fi information ready and complete your Self-Training within the required timeframe."

"Do you have any other questions I can help you with today?"

"Great! Thank you for your time today. If you need to reschedule your delivery or have any scheduling questions, you can reach our scheduling team at 888-676-4808."

"Enjoy the rest of your day!"`,
  },
};

export type RebuttalTag = "insurance" | "self_pay" | "oon" | "exception" | "surgery_far";

export interface Rebuttal {
  id: string;
  label: string;
  /** When this rebuttal is most likely to come up; used to suggest it first. Untagged rebuttals apply to anyone. */
  tags: RebuttalTag[];
  paragraphs: string[];
}

/** From Base44 RebuttalsPanel.jsx. "$___ per month" and "$1,479.77" are now filled from the calculator. */
export const REBUTTALS: Rebuttal[] = [
  {
    id: "mandatory",
    label: "Is it mandatory?",
    tags: [],
    paragraphs: ["It is not mandatory. However, your surgeon ordered this device to be used in conjunction with your physical therapy to help optimize your recovery."],
  },
  {
    id: "physical_therapy",
    label: "Already doing physical therapy",
    tags: [],
    paragraphs: [
      "Actually this works best in conjunction with your physical therapy. Your in-person PT sessions are where your therapist is working directly with you on your recovery, and the PortableConnect helps you continue that progress at home between those visits.",
      "Recovery doesn't just happen during the few hours a week you're with your physical therapist. The PortableConnect gives you additional opportunities to work on your range of motion, mobility, strength, and endurance at home, while following a structured treatment plan.",
      "So think of your physical therapy and the PortableConnect as working together, your PT sessions help guide your recovery, and the PortableConnect helps you stay consistent and continue making progress between those appointments.",
    ],
  },
  {
    id: "cannot_afford_ins",
    label: "Can't afford (insurance estimate)",
    tags: ["insurance"],
    paragraphs: [
      "I completely understand. Just so I can make sure I'm helping you with the right option, is it mainly the amount itself that's a concern, or are you still unsure about the program and how it can help with your recovery?",
      "(If the patient brings up any concerns regarding the program, review those with the patient. If no concerns with the program and it is just a financial objection, continue.)",
      "Okay, so let me explain one thing that may help. The amount we're discussing is based on where your insurance benefits stand today. So this is an estimate based on the benefits we have available to us right now.",
      "As you go through your surgery, physical therapy, and the other medical care you're receiving, those expenses can be applied toward your deductible and out-of-pocket maximum. That means by the time this is actually billed to your insurance, your responsibility could be lower than the amount we're estimating today.",
      "What we can do is set you up on a payment plan based on the current estimate, and once the claim is processed and we know your actual responsibility, we can adjust the payment plan accordingly. And if you've reached your out-of-pocket maximum by that point and your actual responsibility is lower, we can adjust or refund the difference.",
      "So rather than having you come up with the entire amount today, would setting up the payment plan based on the current estimate make that more manageable for you?",
    ],
  },
  {
    id: "cannot_afford_sp",
    label: "Can't afford (self-pay)",
    tags: ["self_pay"],
    paragraphs: [
      "I completely understand. Just so I can make sure I'm helping you with the right option, is it mainly the amount itself that's a concern, or are you still unsure about the program and how it can help with your recovery?",
      "(If the patient brings up any concerns regarding the program, review those with the patient. If no concerns with the program and it is just a financial objection, continue.)",
      "Okay, so let's see what we can do to make the payment more manageable for you. We have two options we can look at. We can set you up on a 12-month payment plan, which would bring your payment down to about [TWELVE_MONTH_PAYMENT] per month. We also have a financial hardship program that may allow us to reduce that amount even further. Would you like to see what you may qualify for through the financial hardship program, or would [TWELVE_MONTH_PAYMENT] per month be comfortable for you?",
    ],
  },
  {
    id: "rental",
    label: "It's just a rental",
    tags: [],
    paragraphs: [
      "The cost isn't just for the equipment itself. The rental includes the PortableConnect program and the clinical support that comes with it. Your treatment plan is structured around your recovery, the device progresses with you from passive movement through active motion and eventually resistance, and our physical therapy team monitors your progress throughout the program.",
      "So you're not simply renting a bike and sending it back. You're receiving a structured rehabilitation program that's designed to work alongside your physical therapy and continue your recovery between those visits.",
    ],
  },
  {
    id: "surgery_far_not_paying",
    label: "Surgery is far off, won't pay yet",
    tags: ["surgery_far"],
    paragraphs: [
      "I completely understand. Normally, we collect the payment during setup so everything is confirmed and ready for your surgery date but let me see if I can get manager approval to make an exception and delay the payment until we're closer to your surgery.",
      "If we're able to get that approved, we can complete your paperwork and get you on the schedule for delivery now and schedule a time to reach back out and take care of the payment closer to your surgery date. Would that work for you?",
      "(Once approved: get EPR forms signed and schedule a day to call them back to collect the payment. Create a calendar reminder for you and add your team lead to it.)",
    ],
  },
  {
    id: "already_have_bike",
    label: "Already has a bike",
    tags: [],
    paragraphs: [
      "Yeah, I actually hear that from patients all the time, and it's great that you already have one. There is an important difference between this device and a standard stationary bike, though. Let me explain.",
      "A standard stationary bike doesn't have a passive motion setting, so you're always doing the work of pedaling, even before your leg is ready for that. It also has a fixed range of motion, which can force your knee into positions that may be uncomfortable early in your recovery.",
      "Our device can switch between passive and active motion, so you can start with the device doing the work for you and gradually progress to doing more yourself. It also allows the range of motion to be adjusted throughout your recovery based on what you're currently comfortable with.",
      "So your bike is actually going to be great to have. We typically look at this program as the bridge that helps you progress to the point where you can get back on that bike comfortably and confidently.",
    ],
  },
  {
    id: "why_prescribed_oon",
    label: "Why prescribed if out of network?",
    tags: ["oon"],
    paragraphs: ["Your doctor prescribes based on what's best for you, and your insurance company just decides on what they are going to cover based on your plan."],
  },
  {
    id: "ins_inn_now_oon",
    label: "Was in network, now out of network",
    tags: ["oon"],
    paragraphs: [
      "We've recently made some updates to how our billing is processed to align with changes in insurance requirements. As a result, some plans that previously processed us as in-network are now processing us as out-of-network. So while your coverage may have looked different a few months ago, the way your plan is processing the program has since changed.",
    ],
  },
  {
    id: "why_agree_if_pending",
    label: "Why agree while still pending?",
    tags: ["exception"],
    paragraphs: [
      "I completely understand. The reason we're asking you to make that decision now is because the insurance exception can take weeks or even months, and we don't want that to delay getting your PortableConnect to you after surgery.",
      "There are really two possible outcomes: if the exception is approved, we process everything through your insurance. If it isn't, the discounted self-pay rate of [TOTAL_SELF_PAY_AMOUNT] would apply.",
      "And if we do end up in that second scenario, we have interest-free payment plans and financial hardship programs available, so we can work with you to make the cost manageable. We'd reach out to you and go over those options with you at that point.",
      "So, with everything we've gone over, are you comfortable moving forward with us today so we can get your PortableConnect reserved and ready for your surgery?",
    ],
  },
  {
    id: "did_not_have_1st_sx",
    label: "Didn't have it for first surgery",
    tags: [],
    paragraphs: [
      "Absolutely, and that's great to hear. Everyone's recovery can be a little different, though, and the goal with the PortableConnect isn't to say you can't recover without it. It's there to give you an additional tool during those first few weeks when getting consistent motion and exercise can be difficult. Your surgeon prescribed it because they believe it can help support your recovery this time around, with controlled motion, gradually increasing your range of motion, and guidance from our clinical team throughout the program.",
    ],
  },
];
