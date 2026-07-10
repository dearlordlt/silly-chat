import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { TextBlock } from '@/types/contract'

// GFM enables tables, strikethrough, and autolinks in markdown text blocks.
// Styling below covers the elements react-markdown emits as bare HTML.
export function TextBlockView({ block }: { block: TextBlock }) {
  return (
    <div
      className="max-w-none break-words text-[14.5px] leading-[1.65]
        [&_p]:my-2 [&_a]:text-primary [&_a]:underline [&_strong]:font-semibold
        [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5
        [&_li]:my-0.5
        [&_h1]:mt-3 [&_h1]:mb-1 [&_h1]:text-lg [&_h1]:font-semibold
        [&_h2]:mt-3 [&_h2]:mb-1 [&_h2]:text-base [&_h2]:font-semibold
        [&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:border [&_pre]:bg-muted/50 [&_pre]:p-3 [&_pre]:text-[13px]
        [&_code]:rounded-sm [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[12.5px]
        [&_pre_code]:bg-transparent [&_pre_code]:p-0
        [&_table]:my-2 [&_table]:block [&_table]:w-full [&_table]:overflow-x-auto [&_table]:border-collapse [&_table]:text-[13.5px]
        [&_th]:border [&_th]:bg-muted [&_th]:px-3 [&_th]:py-2 [&_th]:text-left [&_th]:text-[12.5px] [&_th]:font-bold
        [&_td]:border [&_td]:px-3 [&_td]:py-2"
    >
      <Markdown remarkPlugins={[remarkGfm]}>{block.markdown}</Markdown>
    </div>
  )
}
