import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Pago Voice',
  description: 'Asistentul vocal Pago pentru plata facturilor',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ro">
      <body className="bg-slate-50 text-slate-900 antialiased dark:bg-slate-950 dark:text-slate-100">
        {children}
      </body>
    </html>
  );
}
