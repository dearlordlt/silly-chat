import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Code2, Copy, Check, Eye, Maximize2, X } from 'lucide-react'
import type { DiagramBlock } from '@/types/contract'
import { cn } from '@/lib/utils'

/**
 * Mermaid diagram block (model-authored). The library is lazy-loaded (it's heavy),
 * themed from the app's CSS variables so diagrams match all 17 themes, and invalid
 * Mermaid degrades to a readable source view instead of ruining the answer.
 */

let seq = 0

// Mermaid's color engine only understands concrete colors (hex/rgb) — our tokens are
// oklch and we want color-mix shades. Resolve any CSS color expression to hex by
// letting the browser compute it on a probe element, then normalizing via canvas.
function makeResolver() {
  const probe = document.createElement('div')
  probe.style.display = 'none'
  document.body.appendChild(probe)
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 1
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  const resolve = (css: string): string => {
    probe.style.color = ''
    probe.style.color = css
    // Paint the computed color and read the pixel — guarantees 8-bit sRGB no matter
    // how the browser serializes oklch/color-mix.
    ctx.clearRect(0, 0, 1, 1)
    ctx.fillStyle = getComputedStyle(probe).color
    ctx.fillRect(0, 0, 1, 1)
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data
    return `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}`
  }
  return { resolve, cleanup: () => probe.remove() }
}

function themeVars(): Record<string, string> {
  const cs = getComputedStyle(document.documentElement)
  const v = (n: string) => cs.getPropertyValue(n).trim()
  const { resolve, cleanup } = makeResolver()
  const mix = (a: string, pct: number, b: string) =>
    resolve(`color-mix(in oklch, ${a} ${pct}%, ${b})`)
  const vars = {
    primaryColor: mix(v('--primary'), 18, v('--card')),
    primaryTextColor: resolve(v('--foreground')),
    primaryBorderColor: resolve(v('--primary')),
    lineColor: resolve(v('--muted-foreground')),
    secondaryColor: mix(v('--accent'), 60, v('--card')),
    tertiaryColor: resolve(v('--muted')),
    background: resolve(v('--card')),
    mainBkg: mix(v('--primary'), 14, v('--card')),
    nodeBorder: resolve(v('--primary')),
    clusterBkg: resolve(v('--muted')),
    clusterBorder: resolve(v('--border')),
    titleColor: resolve(v('--foreground')),
    edgeLabelBackground: resolve(v('--card')),
    fontSize: '14px',
  }
  cleanup()
  return vars
}

function useMermaid(source: string) {
  const [svg, setSvg] = useState<string | null>(null)
  const [error, setError] = useState(false)
  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const mermaid = (await import('mermaid')).default
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          theme: 'base',
          themeVariables: themeVars(),
          fontFamily: 'var(--font-sans)',
        })
        const { svg } = await mermaid.render(`silly-diagram-${++seq}`, source)
        if (alive) setSvg(svg)
      } catch {
        if (alive) setError(true)
      }
    })()
    return () => {
      alive = false
    }
  }, [source])
  return { svg, error }
}

export function DiagramBlockView({ block }: { block: DiagramBlock }) {
  const { svg, error } = useMermaid(block.mermaid)
  const [tab, setTab] = useState<'preview' | 'code'>('preview')
  const [expanded, setExpanded] = useState(false)
  const [copied, setCopied] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!expanded) return
    const onEsc = (e: KeyboardEvent) => e.key === 'Escape' && setExpanded(false)
    document.addEventListener('keydown', onEsc)
    return () => document.removeEventListener('keydown', onEsc)
  }, [expanded])

  function copy() {
    navigator.clipboard.writeText(block.mermaid).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  if (error) {
    // The model wrote invalid Mermaid — keep the answer useful with the raw source.
    return (
      <div className="overflow-hidden rounded-lg border bg-card">
        <div className="border-b bg-muted/40 px-3 py-1.5 text-xs font-semibold text-muted-foreground">
          {block.title || 'Diagram'} — couldn't render, showing source
        </div>
        <pre className="overflow-x-auto px-3.5 py-3 font-mono text-[12.5px] leading-relaxed">
          {block.mermaid}
        </pre>
      </div>
    )
  }

  const diagram = (
    <div
      ref={boxRef}
      className="silly-diagram flex w-full items-center justify-center overflow-auto p-4 [&_svg]:h-auto [&_svg]:max-w-full"
      dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
    >
      {svg ? undefined : <span className="py-10 text-sm text-muted-foreground">Drawing…</span>}
    </div>
  )

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="flex items-center justify-between gap-2 border-b bg-muted/40 px-3 py-1.5">
        <span className="truncate text-xs font-semibold">{block.title || 'Diagram'}</span>
        <div className="flex shrink-0 items-center gap-1">
          <div className="mr-1 flex rounded-md bg-muted p-0.5 text-xs">
            <TabBtn active={tab === 'code'} onClick={() => setTab('code')} icon={<Code2 />}>
              Code
            </TabBtn>
            <TabBtn active={tab === 'preview'} onClick={() => setTab('preview')} icon={<Eye />}>
              Preview
            </TabBtn>
          </div>
          <IconBtn label="Copy Mermaid source" onClick={copy}>
            {copied ? <Check className="text-success" /> : <Copy />}
          </IconBtn>
          <IconBtn label="Expand diagram" onClick={() => setExpanded(true)}>
            <Maximize2 />
          </IconBtn>
        </div>
      </div>
      {tab === 'preview' ? (
        diagram
      ) : (
        <div className="flex max-h-[460px] overflow-auto text-sm">
          <pre className="sticky left-0 select-none border-r bg-card px-3 py-3 text-right font-mono text-xs leading-[1.625rem] text-muted-foreground">
            {Array.from({ length: block.mermaid.split('\n').length }, (_, i) => i + 1).join('\n')}
          </pre>
          <pre className="flex-1 whitespace-pre px-3 py-3 font-mono text-[12.5px] leading-[1.625rem]">
            {block.mermaid}
          </pre>
        </div>
      )}

      {expanded &&
        createPortal(
          <div className="fixed inset-0 z-50 bg-foreground/40 p-3 backdrop-blur-sm sm:p-6">
            <div className="animate-rise relative flex h-full w-full items-center justify-center overflow-auto rounded-xl border bg-card shadow-2xl">
              <div
                // Full-box SVG: viewBox + preserveAspectRatio scale the drawing to fit.
                className="h-full w-full p-6 [&_svg]:!max-w-none [&_svg]:h-full [&_svg]:w-full"
                dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
              />
              <button
                onClick={() => setExpanded(false)}
                aria-label="Close diagram"
                className="absolute right-3 top-3 grid size-9 place-items-center rounded-full border bg-card shadow-lg transition-colors hover:bg-accent [&_svg]:size-4"
              >
                <X />
              </button>
            </div>
          </div>,
          document.body,
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
