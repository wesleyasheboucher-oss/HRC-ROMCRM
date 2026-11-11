"use client";

import { Suspense, type ReactNode } from "react";
import { Navbar } from "./shell/Navbar";
import { Sidebar } from "./shell/Sidebar";

/** ROM CRM shell (sidebar + top bar), matching the Payer Intelligence Hub. */
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900 selection:bg-brand-500 selection:text-white">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Navbar />
        <main className="min-h-0 flex-1">
          <Suspense>{children}</Suspense>
        </main>
      </div>
    </div>
  );
}
