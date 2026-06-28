import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Components } from 'react-markdown'

// Render markdown inline (no block <p> wrapper) — for table cells, captions, etc.
const components: Components = {
  p: ({ node: _node, ...props }) => <span {...props} />,
}

export function InlineMd({ children }: { children: string }) {
  return (
    <span className="[&_strong]:font-semibold [&_em]:italic [&_a]:text-primary [&_a]:underline [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:text-[0.85em]">
      <Markdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </Markdown>
    </span>
  )
}
