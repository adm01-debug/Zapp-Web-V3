interface BridgeInfoRowProps {
  label: string;
  value: string;
  mono?: boolean;
}

/** Bridge Info Row component for the connections section. */
export function BridgeInfoRow({ label, value, mono }: BridgeInfoRowProps) {
  return (
    <div className="rounded-md border border-border/40 bg-muted/30 px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-sm text-foreground break-all ${mono ? 'font-mono' : ''}`}>{value}</div>
    </div>
  );
}
