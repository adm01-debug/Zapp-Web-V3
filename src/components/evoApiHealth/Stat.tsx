interface StatProps {
  label: string;
  value: number | string;
  status?: string;
}

/** Stat component for the evoApiHealth section. */
export function Stat({ label, value, status }: StatProps) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold flex items-center gap-2">
        {status && <span className="text-base">{status}</span>}
        {value ?? '—'}
      </p>
    </div>
  );
}
