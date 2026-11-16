"use client";

import type { ComponentType } from "react";
import {
  Bell,
  Car,
  CreditCard,
  House,
  Plus,
  Receipt,
  ScanLine,
  Send,
  Wallet,
  Wifi,
  Zap,
  User,
  Home,
  type LucideProps,
} from "lucide-react";
import { useAssistant } from "@/components/assistant/assistant-provider";
import { CATEGORY_LABEL_RO, formatDateRo, formatRon } from "@/lib/assistant/format";
import type { Bill, BillCategory } from "@/lib/assistant/types";

const CATEGORY_ICON: Record<BillCategory, ComponentType<LucideProps>> = {
  auto: Car,
  house: House,
  utilities: Zap,
  telecom: Wifi,
  other: Receipt,
};

const QUICK_ACTIONS: { label: string; icon: ComponentType<LucideProps> }[] = [
  { label: "Plătește", icon: CreditCard },
  { label: "Trimite", icon: Send },
  { label: "Reîncarcă", icon: Plus },
  { label: "Scanează", icon: ScanLine },
];

export function HomeScreen() {
  // Bills come from the shared assistant state, so paying in checkout updates this list.
  const { bills } = useAssistant();
  const dueBills = bills.filter((b) => b.status === "due").sort((a, b) =>
    a.dueDate.localeCompare(b.dueDate),
  );
  const paidBills = bills.filter((b) => b.status === "paid");
  const totalDue = dueBills.reduce((sum, b) => sum + b.amount, 0);
  const totalPaid = paidBills.reduce((sum, b) => sum + b.amount, 0);

  return (
    <div className="min-h-dvh w-full bg-zinc-100 text-zinc-900">
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col pb-40">
        {/* Header */}
        <header className="flex items-center justify-between px-5 pb-2 pt-10">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-violet-600 text-sm font-bold text-white">
              CG
            </div>
            <div>
              <p className="text-xs text-zinc-500">Bună dimineața</p>
              <p className="text-base font-semibold">Cezar</p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Notificări"
            className="relative flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm"
          >
            <Bell className="h-5 w-5 text-zinc-700" />
            <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-rose-500" />
          </button>
        </header>

        {/* Balance card */}
        <section className="px-5 pt-4">
          <div className="rounded-3xl bg-gradient-to-br from-violet-600 via-violet-700 to-indigo-800 p-5 text-white shadow-lg">
            <div className="flex items-center justify-between text-sm text-white/80">
              <span className="flex items-center gap-2">
                <Wallet className="h-4 w-4" /> Facturi de plătit
              </span>
              <span>{dueBills.length} deschise</span>
            </div>
            <p className="mt-3 text-3xl font-semibold tracking-tight">
              {formatRon(totalDue)}
            </p>
            <div className="mt-5 grid grid-cols-2 gap-3 text-xs">
              <div className="rounded-2xl bg-white/10 p-3">
                <p className="text-white/70">Plătit luna aceasta</p>
                <p className="mt-1 text-sm font-semibold">{formatRon(totalPaid)}</p>
              </div>
              <div className="rounded-2xl bg-white/10 p-3">
                <p className="text-white/70">Următoarea scadență</p>
                <p className="mt-1 text-sm font-semibold">
                  {dueBills[0] ? `${dueBills[0].provider} · ${formatDateRo(dueBills[0].dueDate)}` : "—"}
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Quick actions */}
        <section className="grid grid-cols-4 gap-3 px-5 pt-6">
          {QUICK_ACTIONS.map(({ label, icon: Icon }) => (
            <button key={label} type="button" className="flex flex-col items-center gap-2">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white shadow-sm">
                <Icon className="h-5 w-5 text-violet-600" />
              </span>
              <span className="text-xs font-medium text-zinc-600">{label}</span>
            </button>
          ))}
        </section>

        {/* Bills */}
        <section className="px-5 pt-8">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold">Facturi viitoare</h2>
            <button type="button" className="text-sm font-medium text-violet-600">
              Vezi toate
            </button>
          </div>
          <ul className="flex flex-col gap-2">
            {[...dueBills, ...paidBills].map((bill) => (
              <BillRow key={bill.id} bill={bill} />
            ))}
          </ul>
        </section>
      </div>

      <BottomNav />
    </div>
  );
}

function BillRow({ bill }: { bill: Bill }) {
  const Icon = CATEGORY_ICON[bill.category];
  const paid = bill.status === "paid";

  return (
    <li className="flex items-center gap-3 rounded-2xl bg-white p-3 shadow-sm">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-50">
        <Icon className="h-5 w-5 text-violet-600" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{bill.provider}</p>
        <p className="text-xs text-zinc-500">
          {paid ? "Plătită" : `Scadentă ${formatDateRo(bill.dueDate)}`} · {CATEGORY_LABEL_RO[bill.category]}
        </p>
      </div>
      <div className="text-right">
        <p className="text-sm font-semibold">{formatRon(bill.amount)}</p>
        <span
          className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium ${
            paid ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
          }`}
        >
          {paid ? "Plătită" : "De plătit"}
        </span>
      </div>
    </li>
  );
}

/** Bottom bar. The centre gap is where the AI launcher floats. */
function BottomNav() {
  return (
    <nav
      aria-label="Navigare principală"
      className="fixed inset-x-0 bottom-0 z-30 mx-auto flex h-20 max-w-md items-center justify-around border-t border-zinc-200 bg-white/95 px-6 pb-2 backdrop-blur-md"
    >
      <NavItem icon={Home} label="Acasă" active />
      <NavItem icon={Wallet} label="Portofel" />
      <div className="w-16" aria-hidden />
      <NavItem icon={Receipt} label="Facturi" />
      <NavItem icon={User} label="Profil" />
    </nav>
  );
}

function NavItem({
  icon: Icon,
  label,
  active = false,
}: {
  icon: ComponentType<LucideProps>;
  label: string;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      aria-current={active ? "page" : undefined}
      className={`flex flex-col items-center gap-1 text-[11px] font-medium ${
        active ? "text-violet-600" : "text-zinc-400"
      }`}
    >
      <Icon className="h-5 w-5" />
      {label}
    </button>
  );
}
