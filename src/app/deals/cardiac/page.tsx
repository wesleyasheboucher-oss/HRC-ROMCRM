"use client";

import { DealsPage } from "@/components/deals/DealsPage";
import { useStore } from "@/lib/store";

/** Cardiac Patient Pipeline: columns by enrollment call (Preliminary Call → 6th Enrollment Call). */
export default function CardiacPipelinePage() {
  const { currentUser } = useStore();
  // Re-mount per signed-in user so view state resets like a fresh login.
  return <DealsPage key={currentUser.id} line="cardiac" />;
}
