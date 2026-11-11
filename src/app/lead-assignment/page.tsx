"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** The Lead Stream is split by line; the old address opens the Ortho stream. */
export default function LeadAssignmentPage() {
  const router = useRouter();
  useEffect(() => router.replace("/lead-assignment/ortho"), [router]);
  return null;
}
