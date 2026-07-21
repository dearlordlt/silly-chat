import { Check, Code2, FileText, Image as ImageIcon, Map as MapIcon, Search, Wand2, X } from 'lucide-react'
import type { AskBlock } from '@/types/contract'
import { Button } from '@/components/ui/button'

/**
 * Tool-permission card (chat mode): the model asks before using a tool.
 * Allow / Not now reply with predefined messages (see Chat.tsx) so the whole
 * exchange stays visible in the transcript. Cards from earlier turns render
 * inert — permission is per-moment, not standing.
 */

const ICONS = {
  search: Search,
  code: Code2,
  image: ImageIcon,
  document: FileText,
  map: MapIcon,
  other: Wand2,
} as const

export type AskResponder = { enabled: boolean; respond: (allow: boolean) => void }

export function AskBlockView({ block, ask }: { block: AskBlock; ask?: AskResponder }) {
  const Icon = ICONS[(block.kind ?? 'other') as keyof typeof ICONS] ?? Wand2
  const active = ask?.enabled ?? false
  return (
    <div
      className={`flex flex-wrap items-center gap-x-4 gap-y-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 ${
        active ? '' : 'opacity-60'
      }`}
    >
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/15 text-primary">
        <Icon className="size-4" />
      </span>
      <p className="min-w-0 flex-1 text-[13px] leading-snug">
        <span className="font-semibold">silly-chat wants to</span> {block.action}
      </p>
      {active && (
        <span className="flex shrink-0 items-center gap-2">
          <Button size="sm" className="h-8 rounded-full px-4" onClick={() => ask!.respond(true)}>
            <Check className="size-3.5" /> Allow
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 rounded-full px-3 text-muted-foreground"
            onClick={() => ask!.respond(false)}
          >
            <X className="size-3.5" /> Not now
          </Button>
        </span>
      )}
    </div>
  )
}
