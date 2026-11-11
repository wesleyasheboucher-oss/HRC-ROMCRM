"use client";

import { DealsPage } from "@/components/deals/DealsPage";
import { useStore } from "@/lib/store";

export default function Page() {
  const { currentUser } = useStore();
  // Re-mount per signed-in user so view state resets like a fresh login.
  return <DealsPage key={currentUser.id} />;
}
