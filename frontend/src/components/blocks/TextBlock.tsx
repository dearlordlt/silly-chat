import Markdown from 'react-markdown'
import type { TextBlock } from '@/types/contract'

export function TextBlockView({ block }: { block: TextBlock }) {
  return (
    <div className="prose-chat max-w-none leading-relaxed [&_a]:text-primary [&_a]:underline [&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_strong]:font-semibold">
      <Markdown>{block.markdown}</Markdown>
    </div>
  )
}
