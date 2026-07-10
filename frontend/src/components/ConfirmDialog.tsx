import { createPortal } from 'react-dom'

/** Confirm dialog (design doc frames 1r/1w): centered card, bold title, muted body,
 * pill buttons — destructive action filled red. Portaled so animated ancestors
 * can't trap the fixed overlay. */
export function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Confirm',
  destructive,
  onConfirm,
  onCancel,
}: {
  title: string
  message?: string
  confirmLabel?: string
  destructive?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/40 p-4 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="animate-rise w-full max-w-sm rounded-xl border bg-card p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-bold">{title}</h2>
        {message && <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{message}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="h-[38px] rounded-[10px] border bg-card px-4 text-[13px] font-bold transition-colors hover:bg-accent"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={
              destructive
                ? 'h-[38px] rounded-[10px] bg-destructive px-4 text-[13px] font-bold text-white transition-opacity hover:opacity-90'
                : 'h-[38px] rounded-[10px] bg-primary px-4 text-[13px] font-bold text-primary-foreground transition-opacity hover:opacity-90'
            }
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
