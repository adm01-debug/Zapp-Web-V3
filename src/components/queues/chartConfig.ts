/** Shared chart styling constants for Queue analytics */

export const TOOLTIP_STYLE = {
  backgroundColor: 'hsl(var(--card))',
  border: '1px solid hsl(var(--border))',
  borderRadius: '8px',
  color: 'hsl(var(--foreground))',
} as const;

/** A X I S_ P R O P S constant. */
export const AXIS_PROPS = {
  stroke: 'hsl(var(--muted-foreground))',
  fontSize: 12,
  tickLine: false,
  axisLine: false,
} as const;

/** G R I D_ P R O P S constant. */
export const GRID_PROPS = {
  strokeDasharray: '3 3',
  stroke: 'hsl(var(--border))',
  opacity: 0.3,
} as const;
