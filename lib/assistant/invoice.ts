import { formatDateRo, formatRon } from "./format";
import type { Bill } from "./types";

// Mock invoice content for the in-app viewer. Logos are generic placeholders with
// initials, not real company logos. All client details are fictional.

export interface InvoiceLine {
  label: string;
  qty: string;
  amount: number;
}

export interface InvoiceData {
  number: string;
  issueDate: string;
  dueDate: string;
  period: string;
  supplier: { name: string; initials: string; color: string; cui: string; address: string };
  client: { name: string; address: string; account: string };
  lines: InvoiceLine[];
  total: number;
  currency: string;
  /** Provider-specific block: meter readings, loan details, vehicle and so on. */
  details: { title: string; rows: [string, string][] };
  note: string;
}

const MONTHS_RO = [
  "ianuarie", "februarie", "martie", "aprilie", "mai", "iunie",
  "iulie", "august", "septembrie", "octombrie", "noiembrie", "decembrie",
];

/** Small deterministic number from a string, so the same bill always shows the same mock data. */
const seed = (text: string) => [...text].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

const shiftDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
};

/** Billing period = the month before the due date (e.g. due 20 Nov → "octombrie 2026"). */
const periodFor = (dueDate: string) => {
  const [y, m] = dueDate.split("-").map(Number);
  const prev = m === 1 ? 12 : m - 1;
  const year = m === 1 ? y - 1 : y;
  return `${MONTHS_RO[prev - 1]} ${year}`;
};

type Template = {
  shares: [string, number][];
  qty: (bill: Bill) => string;
  details: (bill: Bill, s: number) => { title: string; rows: [string, string][] };
  note: string;
};

const TEMPLATES: Record<string, Template> = {
  digi: {
    shares: [
      ["Abonament internet fibră", 0.7],
      ["Serviciu TV", 0.2],
      ["Taxă echipament (router)", 0.1],
    ],
    qty: () => "1 lună",
    details: (_b, s) => ({
      title: "Serviciu",
      rows: [
        ["Pachet", "Fibră 300 Mbps + TV"],
        ["Contract", `DG-${(s % 900000) + 100000}`],
        ["Adresa de instalare", "Str. Exemplu nr. 1"],
      ],
    }),
    note: "Plata se face până la data scadenței. Pentru întrebări despre factură, contactează furnizorul.",
  },
  enel: {
    shares: [
      ["Energie electrică activă", 0.6],
      ["Distribuție energie", 0.25],
      ["Transport și sistem", 0.05],
      ["TVA", 0.1],
    ],
    qty: (b) => `${Math.round(b.amount / 0.95)} kWh`,
    details: (b, s) => {
      const oldIndex = 10000 + (s % 9000);
      const kwh = Math.round(b.amount / 0.95);
      return {
        title: "Index contor",
        rows: [
          ["Cod loc de consum", `RO${(s % 90000000) + 10000000}`],
          ["Index vechi", `${oldIndex} kWh`],
          ["Index nou", `${oldIndex + kwh} kWh`],
          ["Consum facturat", `${kwh} kWh`],
        ],
      };
    },
    note: "Dacă indexul afișat nu corespunde cu citirea ta, transmite indexul real în aplicație înainte de data scadenței.",
  },
  "apa nova": {
    shares: [
      ["Apă potabilă", 0.6],
      ["Canalizare", 0.4],
    ],
    qty: (b) => `${Math.max(1, Math.round(b.amount / 9))} mc`,
    details: (b, s) => {
      const oldIndex = 100 + (s % 900);
      const mc = Math.max(1, Math.round(b.amount / 9));
      return {
        title: "Index apometru",
        rows: [
          ["Index vechi", `${oldIndex} mc`],
          ["Index nou", `${oldIndex + mc} mc`],
          ["Consum facturat", `${mc} mc`],
        ],
      };
    },
    note: "Citirea contorului se face lunar. Pentru corecții, contactează furnizorul.",
  },
  "bt home loan": {
    shares: [
      ["Rată credit (capital)", 0.7],
      ["Dobândă", 0.3],
    ],
    qty: () => "1 rată",
    details: (_b, s) => ({
      title: "Credit",
      rows: [
        ["Tip credit", "Credit ipotecar"],
        ["Dobândă anuală", "7,90%"],
        ["Sold rămas", formatRon(120000 + (s % 40000))],
      ],
    }),
    note: "Rata include dobânda și se plătește până la data scadenței.",
  },
  "allianz rca": {
    shares: [["Primă asigurare RCA (lună)", 1]],
    qty: () => "1 lună",
    details: (_b, s) => ({
      title: "Poliță",
      rows: [
        ["Tip poliță", "RCA (răspundere civilă auto)"],
        ["Vehicul", `B ${(s % 90) + 10} PGO`],
        ["Perioada asigurată", "12 luni"],
      ],
    }),
    note: "Polița este valabilă doar dacă plata se face la timp.",
  },
  rovinieta: {
    shares: [["Rovinietă, perioadă de valabilitate", 1]],
    qty: () => "1 an",
    details: (_b, s) => ({
      title: "Rovinietă",
      rows: [
        ["Categoria vehiculului", "M1 (autoturism)"],
        ["Vehicul", `B ${(s % 90) + 10} PGO`],
        ["Valabilă", "12 luni"],
      ],
    }),
    note: "Rovinieta trebuie să fie activă pe toată durata circulației pe drumurile naționale.",
  },
};

const GENERIC: Template = {
  shares: [["Servicii", 1]],
  qty: () => "1 lună",
  details: (_b, s) => ({ title: "Detalii", rows: [["Referință", `REF-${s % 100000}`]] }),
  note: "Pentru întrebări despre factură, contactează furnizorul.",
};

const COLORS = ["#0ea5e9", "#f59e0b", "#0284c7", "#1d4ed8", "#0f766e", "#475569", "#6d28d9"];

/** Builds the invoice shown for one bill. The line amounts always add up to the bill amount. */
export function buildInvoice(bill: Bill): InvoiceData {
  const key = bill.provider.toLowerCase();
  const template = TEMPLATES[key] ?? GENERIC;
  const s = seed(bill.id + bill.dueDate);

  const issueDate = shiftDays(bill.dueDate, -10);
  let remaining = bill.amount;
  const lines: InvoiceLine[] = template.shares.map(([label, share], i) => {
    const isLast = i === template.shares.length - 1;
    const amount = isLast ? Math.round(remaining * 100) / 100 : Math.round(bill.amount * share * 100) / 100;
    remaining = Math.round((remaining - amount) * 100) / 100;
    return { label, qty: template.qty(bill), amount };
  });

  return {
    number: `PG-${bill.id.toUpperCase().replace(/[^A-Z0-9]/g, "")}-${bill.dueDate.slice(0, 4)}${bill.dueDate.slice(5, 7)}`,
    issueDate: formatDateRo(issueDate),
    dueDate: formatDateRo(bill.dueDate),
    period: periodFor(bill.dueDate),
    supplier: {
      name: bill.provider,
      initials: bill.provider
        .split(" ")
        .map((w) => w[0])
        .join("")
        .slice(0, 2)
        .toUpperCase(),
      color: COLORS[s % COLORS.length],
      cui: `RO${(s % 90000000) + 10000000}`,
      address: "Str. Exemplu nr. 10, București",
    },
    client: {
      name: "Client Pago Demo",
      address: "Str. Exemplu nr. 1, București",
      account: `CONT-${(s % 9000000) + 1000000}`,
    },
    lines,
    total: bill.amount,
    currency: bill.currency,
    details: template.details(bill, s),
    note: template.note,
  };
}
