"use client";

import { ConversionsPage } from "@/components/conversions/ConversionsPage";
import { useStore } from "@/lib/store";

export default function Page() {
  const { currentUser } = useStore();
  // Re-mount per signed-in user so filters reset like a fresh login.
  return <ConversionsPage key={currentUser.id} />;
}
