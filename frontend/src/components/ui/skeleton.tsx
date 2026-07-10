import { cn } from '@/lib/utils'

// Shimmer sweep (design doc): a soft highlight travels across the muted base.
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('silly-shimmer rounded-md bg-muted', className)} />
}
