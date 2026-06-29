import { forwardRef, useLayoutEffect, useRef } from 'react'
import { cn } from '@/lib/utils'

type Props = React.TextareaHTMLAttributes<HTMLTextAreaElement>

/**
 * Textarea that grows with its content up to whatever `max-h-*` the caller sets,
 * then scrolls. Resizes on every value change — including programmatic ones
 * (cleared after send, prefilled for edit) — via a layout effect keyed on `value`.
 */
export const AutoTextarea = forwardRef<HTMLTextAreaElement, Props>(
  function AutoTextarea({ className, value, ...props }, ref) {
    const innerRef = useRef<HTMLTextAreaElement | null>(null)

    useLayoutEffect(() => {
      const el = innerRef.current
      if (!el) return
      el.style.height = 'auto' // reset so shrinking works, then grow to content
      el.style.height = `${el.scrollHeight}px`
    }, [value])

    return (
      <textarea
        ref={(node) => {
          innerRef.current = node
          if (typeof ref === 'function') ref(node)
          else if (ref) ref.current = node
        }}
        value={value}
        rows={1}
        className={cn('resize-none overflow-y-auto', className)}
        {...props}
      />
    )
  },
)
