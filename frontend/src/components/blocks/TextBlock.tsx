import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { TextBlock } from '@/types/contract'

// GFM enables tables, strikethrough, and autolinks in markdown text blocks.
// Styling below covers the elements react-markdown emits as bare HTML.
export function TextBlockView({ block }: { block: TextBlock }) {
  return (
    <div
      className="max-w-none break-words leading-relaxed
        [&_p]:my-2 [&_a]:text-primary [&_a]:underline [&_strong]:font-semibold
        [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5
        [&_h1]:mt-3 [&_h1]:mb-1 [&_h1]:text-lg [&_h1]:font-semibold
        [&_h2]:mt-3 [&_h2]:mb-1 [&_h2]:text-base [&_h2]:font-semibold
        [&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:border [&_pre]:bg-muted/50 [&_pre]:p-3 [&_pre]:text-sm
        [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-sm
        [&_pre_code]:bg-transparent [&_pre_code]:p-0
        [&_table]:my-2 [&_table]:block [&_table]:w-full [&_table]:overflow-x-auto [&_table]:border-collapse [&_table]:text-sm
        [&_th]:border [&_th]:bg-muted/60 [&_th]:px-3 [&_th]:py-1.5 [&_th]:text-left [&_th]:font-medium
        [&_td]:border [&_td]:px-3 [&_td]:py-1.5"
    >
      <Markdown remarkPlugins={[remarkGfm]}>{block.markdown}</Markdown>
    </div>
  )
}
