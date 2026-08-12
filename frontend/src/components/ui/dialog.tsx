import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Modal shell: portaled (so animated ancestors can't trap the fixed overlay), closes
 * on Escape and on a backdrop click. The card scrolls its own body. */
export function Overlay({
  onClose,
  children,
  className,
}: {
  onClose: () => void
  children: React.ReactNode
  className?: string
}) {
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onEsc)
    return () => document.removeEventListener('keydown', onEsc)
  }, [onClose])
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className={cn(
          'animate-rise flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-xl border bg-card shadow-2xl',
          className,
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body,
  )
}

export function CloseBtn({ onClose }: { onClose: () => void }) {
  return (
    <button
      onClick={onClose}
      aria-label="Close"
      className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground [&_svg]:size-4"
    >
      <X />
    </button>
  )
}

export function DialogHeader({ title, onClose }: { title: string; onClose: () => void }) {
  return (
    <div className="flex items-center justify-between border-b px-5 py-3.5">
      <span className="text-base font-bold">{title}</span>
      <CloseBtn onClose={onClose} />
    </div>
  )
}
