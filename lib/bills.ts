import type { Bill } from './types';

export const SAMPLE_BILLS: Bill[] = [
  { id: 'digi-1', provider: 'Digi', amount: 54.99, dueDate: '2026-11-25', status: 'due' },
  {
    id: 'engie-1',
    provider: 'Engie Gaz',
    amount: 312.4,
    dueDate: '2026-11-28',
    status: 'due',
    note: 'Include regularizare gaz pentru perioada august - octombrie',
  },
  { id: 'enel-1', provider: 'Enel Energie', amount: 148.2, dueDate: '2026-12-02', status: 'due' },
  { id: 'apa-1', provider: 'Apa Nova', amount: 67.15, dueDate: '2026-11-10', status: 'paid' },
];
