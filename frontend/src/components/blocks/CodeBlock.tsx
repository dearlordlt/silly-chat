import { useMemo, useState } from 'react'
import hljs from 'highlight.js/lib/common'
import { Check, Code2, Copy, Download, ExternalLink, Eye } from 'lucide-react'
import type { CodeBlock } from '@/types/contract'
import { cn } from '@/lib/utils'

const HTML_LANGS = new Set(['html', 'xml', 'htm'])

// highlight.js language id -> sensible file extension for downloads without a filename.
const LANG_EXT: Record<string, string> = {
  html: 'html', xml: 'xml', javascript: 'js', typescript: 'ts', python: 'py',
  ruby: 'rb', go: 'go', rust: 'rs', java: 'java', kotlin: 'kt', c: 'c', cpp: 'cpp',
  csharp: 'cs', php: 'php', swift: 'swift', css: 'css', scss: 'scss', json: 'json',
  yaml: 'yml', toml: 'toml', bash: 'sh', sql: 'sql', markdown: 'md', lua: 'lua',
}

export function CodeBlockView({ block }: { block: CodeBlock }) {
  const isHtml = HTML_LANGS.has(block.language.toLowerCase())
  const [tab, setTab] = useState<'code' | 'preview'>(isHtml ? 'preview' : 'code')
  const [copied, setCopied] = useState(false)

  const highlighted = useMemo(() => {
    try {
      const lang = block.language.toLowerCase()
      if (lang && hljs.getLanguage(lang)) {
        return hljs.highlight(block.content, { language: lang }).value
      }
      return hljs.highlightAuto(block.content).value
    } catch {
      return escapeHtml(block.content)
    }
  }, [block.content, block.language])

  const lineCount = block.content.split('\n').length

  function copy() {
    navigator.clipboard.writeText(block.content).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  function download() {
    const name = block.filename || `code.${LANG_EXT[block.language?.toLowerCase()] ?? 'txt'}`
    const blob = new Blob([block.content], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = name.split('/').pop() || name
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  async function openPreview() {
    try {
      const r = await fetch('/api/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ html: block.content }),
        credentials: 'include',
      })
      const { id } = await r.json()
      window.open(`/api/preview/${id}`, '_blank', 'noopener')
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      <div className="flex items-center justify-between border-b bg-muted/40 px-3 py-1.5">
        <span className="truncate text-xs font-medium text-muted-foreground" title={block.filename || undefined}>
          {block.filename || block.language || 'code'}
        </span>
        <div className="flex items-center gap-1">
          {isHtml && (
            <div className="mr-1 flex rounded-md bg-muted p-0.5 text-xs">
              <TabBtn active={tab === 'code'} onClick={() => setTab('code')} icon={<Code2 />}>
                Code
              </TabBtn>
              <TabBtn active={tab === 'preview'} onClick={() => setTab('preview')} icon={<Eye />}>
                Preview
              </TabBtn>
            </div>
          )}
          {isHtml && (
            <IconBtn label="Open in new tab" onClick={openPreview}>
              <ExternalLink />
            </IconBtn>
          )}
          <IconBtn label="Download file" onClick={download}>
            <Download />
          </IconBtn>
          <IconBtn label="Copy code" onClick={copy}>
            {copied ? <Check className="text-green-600" /> : <Copy />}
          </IconBtn>
        </div>
      </div>

      {tab === 'preview' && isHtml ? (
        <iframe
          title="preview"
          srcDoc={block.content}
          sandbox="allow-scripts allow-popups allow-modals allow-forms"
          className="h-[460px] w-full bg-white"
        />
      ) : (
        <div className="flex max-h-[460px] overflow-auto text-sm">
          <pre className="sticky left-0 select-none border-r bg-card px-3 py-3 text-right font-mono text-xs leading-[1.625rem] text-muted-foreground">
            {Array.from({ length: lineCount }, (_, i) => i + 1).join('\n')}
          </pre>
          <pre className="flex-1 whitespace-pre px-3 py-3 font-mono leading-[1.625rem]">
            <code dangerouslySetInnerHTML={{ __html: highlighted }} />
          </pre>
        </div>
      )}
    </div>
  )
}

function TabBtn({
  children,
  icon,
  active,
  onClick,
}: {
  children: React.ReactNode
  icon: React.ReactNode
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-1 rounded px-2 py-1 font-medium transition-colors [&_svg]:size-3.5',
        active ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
      )}
    >
      {icon}
      {children}
    </button>
  )
}

function IconBtn({
  children,
  label,
  onClick,
}: {
  children: React.ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-background hover:text-foreground [&_svg]:size-3.5"
    >
      {children}
    </button>
  )
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c] as string)
}
