import type { CodeBlock } from '@/types/contract'

export function CodeBlockView({ block }: { block: CodeBlock }) {
  return (
    <div className="overflow-hidden rounded-lg border bg-muted/50">
      <div className="border-b px-3 py-1.5 text-xs text-muted-foreground">
        {block.language}
      </div>
      <pre className="overflow-x-auto p-3 text-sm">
        <code>{block.content}</code>
      </pre>
    </div>
  )
}
