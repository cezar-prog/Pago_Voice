"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import { X } from "lucide-react";
import { useAssistant } from "./assistant-provider";
import { buildInvoice, type InvoiceData } from "@/lib/assistant/invoice";
import { formatRon } from "@/lib/assistant/format";
import type { Bill } from "@/lib/assistant/types";

/**
 * Full-screen PDF-style viewer for one bill's invoice. The invoice is drawn with HTML
 * instead of a PDF iframe, which is more reliable on mobile Safari. Sizes use container
 * units, so the A4 page scales with the screen.
 */
export function InvoiceViewerModal({ bill }: { bill: Bill }) {
  const { closeInvoice } = useAssistant();
  const invoice = useMemo(() => buildInvoice(bill), [bill]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-[70] flex flex-col bg-black/85 backdrop-blur-md"
      role="dialog"
      aria-modal="true"
      aria-label={`Factura ${bill.provider}`}
    >
      <header className="flex items-center justify-between gap-3 px-4 pb-3 pt-[max(16px,env(safe-area-inset-top))] text-white">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">Factura {bill.provider}</p>
          <p className="text-[11px] text-white/50">{invoice.number} · 1 / 1</p>
        </div>
        <button
          type="button"
          onClick={closeInvoice}
          aria-label="Închide factura"
          className="shrink-0 rounded-full border border-white/10 bg-white/10 p-2 text-white/80 transition-colors hover:bg-white/20"
        >
          <X className="h-5 w-5" />
        </button>
      </header>

      <div className="flex min-h-0 flex-1 justify-center overflow-y-auto px-3 pb-8">
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 24, scale: 0.97 }}
          transition={{ type: "spring", stiffness: 260, damping: 28 }}
          className="@container w-full max-w-[560px] shrink-0"
        >
          <InvoiceDocument invoice={invoice} />
        </motion.div>
      </div>
    </motion.div>
  );
}

/** A4 page (210 × 297 mm). All sizes are in container units, so the page scales as a whole. */
function InvoiceDocument({ invoice }: { invoice: InvoiceData }) {
  return (
    <div className="flex aspect-[210/297] w-full flex-col overflow-hidden rounded-sm bg-white p-[6cqw] text-[max(9px,2.4cqw)] leading-snug text-zinc-800 shadow-2xl">
      {/* Supplier and invoice header */}
      <div className="flex items-start justify-between gap-[3cqw]">
        <div className="flex min-w-0 items-center gap-[2.5cqw]">
          <div
            className="flex h-[11cqw] w-[11cqw] shrink-0 items-center justify-center rounded-md text-[3.4cqw] font-bold text-white"
            style={{ backgroundColor: invoice.supplier.color }}
            aria-hidden
          >
            {invoice.supplier.initials}
          </div>
          <div className="min-w-0">
            <p className="text-[3.6cqw] font-bold text-zinc-900">{invoice.supplier.name}</p>
            <p className="text-zinc-500">CUI {invoice.supplier.cui}</p>
            <p className="text-zinc-500">{invoice.supplier.address}</p>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[4cqw] font-bold tracking-wide text-zinc-900">FACTURĂ</p>
          <p>Nr. {invoice.number}</p>
          <p>Emisă: {invoice.issueDate}</p>
          <p>Scadentă: {invoice.dueDate}</p>
        </div>
      </div>

      <div className="my-[4cqw] h-px bg-zinc-200" />

      {/* Client and billing period */}
      <div className="grid grid-cols-2 gap-[4cqw]">
        <div>
          <p className="text-[2.2cqw] uppercase tracking-wider text-zinc-400">Client</p>
          <p className="font-semibold text-zinc-900">{invoice.client.name}</p>
          <p>{invoice.client.address}</p>
          <p>Cont {invoice.client.account}</p>
        </div>
        <div>
          <p className="text-[2.2cqw] uppercase tracking-wider text-zinc-400">Perioada facturată</p>
          <p className="font-semibold text-zinc-900">{invoice.period}</p>
        </div>
      </div>

      {/* Provider-specific block: meter readings, loan details, vehicle and so on */}
      <div className="mt-[4cqw] rounded-sm bg-zinc-50 p-[3cqw]">
        <p className="mb-[1.5cqw] font-semibold text-zinc-900">{invoice.details.title}</p>
        <dl className="grid grid-cols-2 gap-x-[3cqw] gap-y-[1cqw]">
          {invoice.details.rows.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-zinc-500">{label}</dt>
              <dd className="text-right font-medium text-zinc-900">{value}</dd>
            </div>
          ))}
        </dl>
      </div>

      {/* Services table */}
      <table className="mt-[4cqw] w-full border-collapse">
        <thead>
          <tr className="border-b border-zinc-300 text-left text-zinc-500">
            <th className="py-[1.5cqw] font-medium">Descriere</th>
            <th className="py-[1.5cqw] text-right font-medium">Cantitate</th>
            <th className="py-[1.5cqw] text-right font-medium">Valoare (RON)</th>
          </tr>
        </thead>
        <tbody>
          {invoice.lines.map((line) => (
            <tr key={line.label} className="border-b border-zinc-100">
              <td className="py-[1.5cqw] text-zinc-800">{line.label}</td>
              <td className="py-[1.5cqw] text-right text-zinc-600">{line.qty}</td>
              <td className="py-[1.5cqw] text-right text-zinc-800">
                {line.amount.toLocaleString("ro-RO", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={2} className="pt-[2.5cqw] text-right font-semibold text-zinc-900">
              Total de plată
            </td>
            <td className="pt-[2.5cqw] text-right text-[3.4cqw] font-bold text-zinc-900">
              {formatRon(invoice.total)}
            </td>
          </tr>
        </tfoot>
      </table>

      <p className="mt-auto text-zinc-500">{invoice.note}</p>
      <p className="mt-[2cqw] text-[2cqw] text-zinc-400">
        Document demonstrativ, generat pentru test. Logo-ul este un marcaj generic, iar datele clientului sunt fictive.
      </p>
    </div>
  );
}
