export function ProgressBar({ value, thin = false, label }: { value: number; thin?: boolean; label?: string }) {
  return (
    <div className={`progress ${thin ? "progress-thin" : ""}`} role="progressbar" aria-valuenow={value} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div className="progress-fill" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}
