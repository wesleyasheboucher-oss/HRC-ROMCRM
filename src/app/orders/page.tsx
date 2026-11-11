"use client";

import { Suspense } from "react";
import { OrdersPage } from "@/components/orders/OrdersPage";
import { useStore } from "@/lib/store";

/** All Orders: every order across the ten statuses. Every role can open it. */
export default function Page() {
  const { currentUser } = useStore();
  // Re-mount per signed-in user so filters reset like a fresh login. Suspense: the selected status is read from the URL.
  return (
    <Suspense>
      <OrdersPage key={currentUser.id} />
    </Suspense>
  );
}
