"use client";

import { lineOf } from "@/lib/orderStatus";
import { columnLabel, PIPELINE_PATH } from "@/lib/pipelines";
import { Check, Moon, NotebookText, RotateCcw, Search, Settings, Sun } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { startOfToday, toISODate } from "@/lib/dates";
import { coverageBar, userDisplayName } from "@/lib/fields";
import { canViewAllCoordinators, useStore } from "@/lib/store";
import type { Role, User } from "@/lib/types";
import { cx } from "../ui";

const ROLE_LABEL: Record<Role, string> = { coordinator: "HRC", manager: "Manager", admin: "Admin" };
const ROLE_COLOR: Record<Role, string> = { admin: "bg-brand-900", manager: "bg-brand-600", coordinator: "bg-teal-700" };

const initials = (u: User) => `${u.firstName.charAt(0)}${u.lastName.charAt(0)}`.toUpperCase();

/** Closes a popover on outside click or Escape. */
function usePopover() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return { open, setOpen, ref };
}

/** ROM CRM top bar, matching the Payer Intelligence Hub: global search left, summary + account + settings right. */
export function Navbar() {
  const router = useRouter();
  const { patients, currentUser, users, setCurrentUser, resetDemo } = useStore();
  const account = usePopover();
  const settings = usePopover();

  const scope = canViewAllCoordinators(currentUser) ? patients : patients.filter((p) => p.ownerId === currentUser.id);
  const today = toISODate(startOfToday());
  const dueToday = scope.filter((p) => p.nextTask && !p.nextTask.done && p.nextTask.due <= today).length;

  return (
    <header className="sticky top-0 z-40 bg-slate-50/95 backdrop-blur-md">
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between gap-4">
          {/* Opens the order on its own line's board (Ortho or Cardiac) */}
          <PatientSearch
            onOpen={(id) => {
              const p = patients.find((x) => x.id === id);
              router.push(`${PIPELINE_PATH[p ? lineOf(p) : "ortho"]}?open=${encodeURIComponent(id)}`);
            }}
          />

          <div className="flex shrink-0 items-center gap-3">
            <div className="hidden items-center gap-3 text-[13px] text-slate-600 lg:flex">
              <span title={canViewAllCoordinators(currentUser) ? "All patients" : "Patients you own"}>
                <span className="font-semibold tabular-nums text-slate-900">{scope.length}</span> patients
              </span>
              <span className="h-4 w-px bg-slate-200" />
              <span title="Open tasks due today or overdue">
                <span className="font-semibold tabular-nums text-slate-900">{dueToday}</span> tasks due
              </span>
            </div>

            <div className="flex items-center gap-1">
              {/* Account: demo stand-in for sign-in; pick who you're signed in as */}
              <div className="relative" ref={account.ref}>
                <button
                  onClick={() => account.setOpen((o) => !o)}
                  title={`${userDisplayName(currentUser)} - ${ROLE_LABEL[currentUser.role]}. Click to switch account.`}
                  className={cx(
                    "flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-[11px] font-semibold tracking-tight text-white transition hover:opacity-85",
                    ROLE_COLOR[currentUser.role],
                  )}
                >
                  {initials(currentUser)}
                </button>
                {account.open && (
                  <Menu className="w-72">
                    <p className="px-2.5 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                      Signed in as (demo)
                    </p>
                    {users.map((u) => (
                      <button
                        key={u.id}
                        role="menuitemradio"
                        aria-checked={u.id === currentUser.id}
                        onClick={() => {
                          setCurrentUser(u.id);
                          account.setOpen(false);
                        }}
                        className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left text-xs text-slate-700 transition hover:bg-slate-100"
                      >
                        <span className={cx("flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white", ROLE_COLOR[u.role])}>
                          {initials(u)}
                        </span>
                        <span className="flex-1 font-semibold">{userDisplayName(u)}</span>
                        <span className="text-[11px] text-slate-500">{ROLE_LABEL[u.role]}</span>
                        <Check className={cx("h-3.5 w-3.5 text-brand-600", u.id !== currentUser.id && "invisible")} />
                      </button>
                    ))}
                  </Menu>
                )}
              </div>

              <ThemeToggle />

              <div className="relative" ref={settings.ref}>
                <button
                  onClick={() => settings.setOpen((o) => !o)}
                  title="Settings"
                  aria-haspopup="menu"
                  aria-expanded={settings.open}
                  className={cx(
                    "cursor-pointer rounded-lg border p-2 transition",
                    settings.open
                      ? "border-slate-200 bg-slate-200 text-slate-900"
                      : "border-transparent text-slate-500 hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900",
                  )}
                >
                  <Settings className={cx("h-4 w-4 transition-transform", settings.open && "rotate-45")} />
                </button>
                {settings.open && (
                  <Menu className="w-60">
                    <MenuItem
                      icon={<NotebookText className="h-4 w-4 shrink-0 text-brand-600" />}
                      onClick={() => {
                        settings.setOpen(false);
                        router.push("/poc-notes");
                      }}
                    >
                      POC Notes
                    </MenuItem>
                    <div className="mx-1 my-1 h-px bg-slate-200" />
                    <MenuItem
                      icon={<RotateCcw className="h-4 w-4 shrink-0 text-rose-500" />}
                      danger
                      onClick={() => {
                        settings.setOpen(false);
                        if (confirm("Reset all demo data, filters and settings?")) resetDemo();
                      }}
                    >
                      Reset demo data
                    </MenuItem>
                    <p className="px-2.5 pb-1 pt-1.5 text-[11px] text-slate-500">Demo data · stored in this browser only</p>
                  </Menu>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}

function Menu({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div role="menu" className={cx("absolute right-0 z-50 mt-2 origin-top-right rounded-lg border border-slate-200 bg-surface p-1.5 shadow-lg", className)}>
      {children}
    </div>
  );
}

function MenuItem({ icon, onClick, danger, children }: { icon: ReactNode; onClick: () => void; danger?: boolean; children: ReactNode }) {
  return (
    <button
      role="menuitem"
      onClick={onClick}
      className={cx(
        "flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-semibold text-slate-700 transition",
        danger ? "hover:bg-rose-50 hover:text-rose-700" : "hover:bg-slate-100 hover:text-slate-900",
      )}
    >
      {icon}
      <span className="flex-1 text-left">{children}</span>
    </button>
  );
}

const MAX_RESULTS = 8;

/** Global patient search: name, record IDs, insurance, phone. Choosing a result opens it on the Patient Pipeline board. */
function PatientSearch({ onOpen }: { onOpen: (id: string) => void }) {
  const { patients, usersById } = useStore();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const pop = usePopover();
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return patients
      .filter((p) =>
        [`${p.firstName} ${p.lastName}`, p.id, p.btPatientId, p.btOrderId, p.iomsOrderId, p.insuranceName, p.mobilePhone].some((v) =>
          v.toLowerCase().includes(q),
        ),
      )
      .slice(0, MAX_RESULTS);
  }, [query, patients]);

  const choose = (i: number) => {
    const p = results[i];
    if (!p) return;
    onOpen(p.id);
    setQuery("");
    pop.setOpen(false);
    inputRef.current?.blur();
  };

  return (
    <div ref={pop.ref} className="relative max-w-3xl flex-1">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
      <input
        ref={inputRef}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          pop.setOpen(true);
        }}
        onFocus={() => pop.setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, results.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            choose(active);
          } else if (e.key === "Escape") {
            pop.setOpen(false);
            inputRef.current?.blur();
          }
        }}
        placeholder="Search patients, BT / iOMS IDs, insurance, phone…"
        className="h-10 w-full rounded-lg border border-slate-200 bg-surface pl-9 pr-3 text-[14px] text-slate-900 placeholder:text-slate-500 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-600/20"
      />
      {pop.open && query.trim() && (
        <div className="absolute left-0 right-0 z-50 mt-1.5 rounded-lg border border-slate-200 bg-surface p-1.5 shadow-lg">
          {results.length === 0 ? (
            <p className="px-2.5 py-2 text-xs text-slate-500">No patients match &ldquo;{query}&rdquo;</p>
          ) : (
            <>
              <p className="px-2.5 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">Patients</p>
              {results.map((p, i) => (
                <button
                  key={p.id}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => choose(i)}
                  className={cx("flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left", i === active && "bg-slate-100")}
                >
                  <span className={cx("h-6 w-1 shrink-0 rounded", coverageBar(p))} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold text-slate-900">
                      {p.firstName} {p.lastName}
                    </span>
                    <span className="block truncate text-[11px] text-slate-500">
                      ID {p.id} · {p.insuranceName} · {columnLabel(p, startOfToday())} · {userDisplayName(usersById[p.ownerId ?? ""])}
                    </span>
                  </span>
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** Light / dark switch. The initial theme is applied before paint by the script in layout.tsx. */
function ThemeToggle() {
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);
  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light");
  }, []);
  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("romcrm-theme", next);
    } catch {
      // storage unavailable; theme still applies for this visit
    }
    setTheme(next);
  };
  const dark = theme === "dark";
  return (
    <button
      onClick={toggle}
      title={dark ? "Switch to light mode" : "Switch to dark mode"}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      className="cursor-pointer rounded-lg border border-transparent p-2 text-slate-500 transition hover:border-slate-300 hover:bg-slate-100 hover:text-slate-900"
    >
      {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  );
}
