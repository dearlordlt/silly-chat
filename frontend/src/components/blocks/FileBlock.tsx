import { Download, FileText } from 'lucide-react'
import type { FileBlock } from '@/types/contract'

/** A generated file (e.g. a PDF from make_document) — a friendly download chip. */
export function FileBlockView({ block }: { block: FileBlock }) {
  const kb = block.size ? Math.max(1, Math.round(block.size / 1024)) : null
  const kindLabel = block.mime === 'application/pdf' ? 'PDF' : (block.mime ?? '').split('/')[1] || 'file'
  return (
    <a
      href={block.url}
      download={block.name}
      className="group flex w-full max-w-md items-center gap-3 rounded-lg border bg-card px-4 py-3 shadow-[0_1px_3px_0_oklch(0_0_0/0.05)] transition-colors hover:bg-accent"
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary [&_svg]:size-5">
        <FileText />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{block.name}</span>
        <span className="block text-[11px] text-muted-foreground">
          {kindLabel.toUpperCase()}
          {kb != null && ` · ${kb} KB`}
        </span>
      </span>
      <span className="grid size-8 shrink-0 place-items-center rounded-full border bg-background text-muted-foreground transition-colors group-hover:text-foreground [&_svg]:size-4">
        <Download />
      </span>
    </a>
  )
}
