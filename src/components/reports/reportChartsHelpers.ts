/** COLORS component for the reports section. */
export const COLORS = [
  'hsl(var(--primary))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
];

/** TOOLTIP_STYLE component for the reports section. */
export const TOOLTIP_STYLE = {
  backgroundColor: 'hsl(var(--card))',
  border: '1px solid hsl(var(--border))',
  borderRadius: '8px',
};

/** Chart Data component for the reports section. */
export interface ChartData {
  daily: Array<Record<string, unknown>>;
  bySender: Array<{ name: string; value: number }>;
  byAgent: Array<{ name: string; mensagens: number }>;
}

/** Contacts Chart Data component for the reports section. */
export interface ContactsChartData {
  daily: Array<Record<string, unknown>>;
  byType: Array<{ name: string; value: number }>;
  byTag: Array<{ name: string; contatos: number }>;
}
