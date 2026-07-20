interface BridgeStatCardProps {
  label: string;
  value: string;
  tone?: 'success' | 'error';
}

/** Bridge Stat Card component for the connections section. */
export function BridgeStatCard({ label, value, tone }: BridgeStatCardProps) {
  const toneClass =
    tone === 'success'
      ? 'text-emerald-500'
      : tone === 'error'
        ? 'text-destructive'
        : 'text-foreground';
        
  return (
    <div className="rounded-md border border-border/40 bg-muted/30 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-base font-semibold ${toneClass}`}>{value}</div>
    </div>
  );
}
