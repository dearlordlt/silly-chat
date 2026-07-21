import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Block } from '@/types/contract'
import type { Turn } from '@/lib/types'
import { THEMES } from '@/lib/theme'
import { ChartBlockView } from '@/components/blocks/ChartBlock'
import { SimBlockPrint } from '@/components/blocks/SimBlock'
import { TimelineBlockPrint } from '@/components/blocks/TimelineBlock'
import { ChangeBlockPrint } from '@/components/blocks/ChangeBlock'

/**
 * PDF export = the browser's print-to-PDF over this dedicated print surface.
 * Hidden on screen; @media print hides the app and shows only this. Uses the
 * light theme's tokens locally so charts stay readable on paper, whatever
 * theme the screen uses.
 */

const MD =
  'leading-relaxed [&_p]:my-2 [&_h1]:text-2xl [&_h1]:font-bold [&_h2]:text-lg [&_h2]:font-bold [&_h2]:mt-5 [&_h3]:font-bold [&_h3]:mt-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-1 [&_strong]:font-semibold [&_a]:underline [&_code]:bg-neutral-100 [&_code]:px-1 [&_code]:rounded-sm'

function PrintBlock({ b }: { b: Block }) {
  switch (b.type) {
    case 'text':
      return (
        <div className={MD}>
          <Markdown remarkPlugins={[remarkGfm]}>{b.markdown}</Markdown>
        </div>
      )
    case 'table':
      return (
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr>
              {b.columns.map((c, i) => (
                <th key={i} className="border-b-2 border-black px-2 py-1 text-left font-bold">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {b.rows.map((r, i) => (
              <tr key={i}>
                {r.map((c, j) => (
                  <td key={j} className="border-b border-neutral-300 px-2 py-1 align-top">
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )
    case 'code':
      return (
        <div>
          {b.filename && <p className="mb-1 font-mono text-xs font-bold">{b.filename}</p>}
          <pre className="whitespace-pre-wrap break-words rounded border border-neutral-300 bg-neutral-50 p-3 font-mono text-[11px] leading-relaxed">
            {b.content}
          </pre>
        </div>
      )
    case 'chart':
      return <ChartBlockView block={b} />
    case 'sim':
      return <SimBlockPrint block={b} />
    case 'ask':
      return <p className="text-xs italic text-neutral-500">Asked permission to {b.action}.</p>
    case 'timeline':
      return <TimelineBlockPrint block={b} />
    case 'change':
      return <ChangeBlockPrint block={b} />
    case 'gallery':
      return (
        <div className="flex flex-wrap gap-2">
          {b.images.map((img, i) => (
            <img key={i} src={img.url} alt={img.caption ?? ''} className="max-h-56 rounded border" />
          ))}
        </div>
      )
    case 'slides':
      // A deck prints as a handout: one slide per page, big and readable.
      return (
        <div>
          {b.slides.map((s, i) => (
            <section
              key={i}
              className="flex min-h-[230mm] flex-col justify-center px-6"
              style={{ breakAfter: i < b.slides.length - 1 ? 'page' : 'auto' }}
            >
              <span className="mb-4 block h-1.5 w-20 rounded-full bg-neutral-800" />
              <h2 className={i === 0 ? 'text-4xl font-bold tracking-tight' : 'text-3xl font-bold tracking-tight'}>
                {s.title}
              </h2>
              <div className={`mt-5 text-lg ${MD} [&_li]:my-2`}>
                <Markdown remarkPlugins={[remarkGfm]}>{s.markdown ?? ''}</Markdown>
              </div>
              <p className="mt-auto pt-8 text-right text-xs text-neutral-400">
                {b.title ? `${b.title} · ` : ''}
                {i + 1} / {b.slides.length}
              </p>
            </section>
          ))}
        </div>
      )
    case 'diagram':
      return (
        <pre className="whitespace-pre-wrap rounded border border-neutral-300 bg-neutral-50 p-3 font-mono text-[11px]">
          {b.mermaid}
        </pre>
      )
    case 'map':
      return (
        <p className="text-sm">
          <strong>Map{b.title ? `: ${b.title}` : ''}</strong> — {b.points.map((p) => p.name).join(', ')}
        </p>
      )
    case 'sources':
      return (
        <ol className="list-decimal pl-5 text-xs text-neutral-600">
          {b.items.map((s, i) => (
            <li key={i}>
              {s.title} — {s.url}
            </li>
          ))}
        </ol>
      )
    case 'file':
      return <p className="text-sm">📄 {b.name}</p>
    case 'edits':
      return null
  }
}

// The light showcase theme's tokens, applied locally so themed SVGs print well.
const PRINT_VARS = Object.fromEntries(
  Object.entries(THEMES.find((t) => t.id === 'frigg')!.vars).map(([k, v]) => [`--${k}`, v]),
) as React.CSSProperties

export function ExportPrint({
  title,
  turns,
  onDone,
}: {
  title: string
  turns: Turn[]
  onDone: () => void
}) {
  useEffect(() => {
    document.body.classList.add('print-export')
    window.addEventListener('afterprint', onDone)
    const t = setTimeout(() => window.print(), 300) // let layout + images settle
    return () => {
      clearTimeout(t)
      window.removeEventListener('afterprint', onDone)
      document.body.classList.remove('print-export')
    }
  }, [onDone])

  return createPortal(
    <div className="print-surface bg-white p-2 font-sans text-[13.5px] text-black" style={PRINT_VARS}>
      <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      <p className="mb-3 mt-0.5 text-xs text-neutral-500">
        {new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
      </p>
      <hr className="mb-5 border-t-2 border-black" />
      <div className="space-y-5">
        {turns.map((t, i) =>
          t.role === 'user' ? (
            <p key={i} className="border-l-2 border-neutral-400 pl-3 text-neutral-600">
              <strong>You:</strong> {t.text}
            </p>
          ) : (
            <div key={i} className="space-y-4">
              {t.slots.map(
                (s) => s.kind === 'filled' && <PrintBlock key={s.id} b={s.block} />,
              )}
            </div>
          ),
        )}
      </div>
      <p className="mt-8 border-t pt-2 text-center text-[10px] text-neutral-400">made with silly-chat</p>
    </div>,
    document.body,
  )
}
