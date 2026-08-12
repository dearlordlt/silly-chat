import { cn } from '@/lib/utils'

/** The app's on/off-and-friends control: a row of equal segments in a muted track,
 * the selected one raised. Used for storage mode, timezone mode and project settings. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  className,
}: {
  options: { value: T; label: string }[]
  value: T
  onChange: (v: T) => void
  className?: string
}) {
  return (
    <div
      className={cn('grid gap-1 rounded-md bg-muted p-1 text-xs', className)}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          aria-pressed={value === o.value}
          className={cn(
            'rounded-[7px] px-2 py-[5px] font-bold transition-colors',
            value === o.value
              ? 'bg-card text-foreground shadow-[0_1px_3px_0_oklch(0_0_0/0.08)]'
              : 'font-medium text-muted-foreground hover:text-foreground',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
