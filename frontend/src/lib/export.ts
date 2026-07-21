import type { Block } from '@/types/contract'
import type { Turn } from '@/lib/types'

/**
 * Export: serialize turns to full-fidelity Markdown, and trigger downloads.
 * (PDF export renders the same content through the print stylesheet — see
 * components/ExportPrint.tsx — so what you see is what you save.)
 */

function blockToMarkdown(b: Block): string {
  switch (b.type) {
    case 'text':
      return b.markdown
    case 'table': {
      const head = `| ${b.columns.join(' | ')} |`
      const sep = `| ${b.columns.map(() => '---').join(' | ')} |`
      const rows = b.rows.map((r) => `| ${r.join(' | ')} |`)
      return [head, sep, ...rows].join('\n')
    }
    case 'code':
      return (b.filename ? `**${b.filename}**\n\n` : '') + '```' + b.language + '\n' + b.content + '\n```'
    case 'chart': {
      const title = b.title ? `**${b.title}**\n\n` : ''
      const series = b.series?.length
        ? b.series
        : [{ name: 'Value', values: b.values ?? [] }]
      const head = `| | ${series.map((s) => s.name).join(' | ')} |`
      const sep = `| --- | ${series.map(() => '---').join(' | ')} |`
      const rows = b.labels.map((l, i) => `| ${l} | ${series.map((s) => s.values[i] ?? '').join(' | ')} |`)
      return title + [head, sep, ...rows].join('\n')
    }
    case 'sim': {
      const title = b.title ? `**${b.title}** (interactive simulation)\n\n` : '**Interactive simulation**\n\n'
      const curves = b.series.map((s) => `- ${s.name}: \`${s.expr}\``).join('\n')
      const vars = b.variables
        .map((v) => `- ${v.label} (\`${v.name}\`) = ${v.default ?? 0}${v.unit ?? ''}`)
        .join('\n')
      return `${title}Curves over ${b.x.label ?? 'x'}:\n${curves}\n\nVariables:\n${vars}`
    }
    case 'timeline':
      return (
        (b.title ? `**${b.title}**` : '**Timeline**') +
        (b.range ? ` (${b.range})` : '') +
        '\n\n' +
        b.eras
          .map(
            (era) =>
              `### ${era.name}${era.range ? ` (${era.range})` : ''}\n\n` +
              era.events.map((ev) => `- **${ev.date}** — ${ev.title}${ev.desc ? `. ${ev.desc}` : ''}`).join('\n'),
          )
          .join('\n\n')
      )
    case 'change': {
      const title = (b.title ? `**${b.title}**` : '**Change over time**') + (b.subtitle ? ` — ${b.subtitle}` : '')
      const head = `| Group | ${b.periods.join(' | ')} |`
      const sep = `| --- | ${b.periods.map(() => '---').join(' | ')} |`
      const rows = b.groups.map(
        (g, gi) =>
          `| ${g} | ${b.periods
            .map((_, pi) =>
              b.data[pi][gi].map((v, oi) => `${b.options[oi]} ${Math.round(v * 10) / 10}${b.unit ?? '%'}`).join(', '),
            )
            .join(' | ')} |`,
      )
      return `${title}\n\n${[head, sep, ...rows].join('\n')}`
    }
    case 'gallery':
      return b.images.map((i) => `![${i.caption ?? ''}](${i.url})`).join('\n')
    case 'slides':
      return (
        (b.title ? `# ${b.title}\n\n` : '') +
        b.slides.map((s, i) => `## ${i + 1}. ${s.title}\n\n${s.markdown ?? ''}`).join('\n\n')
      )
    case 'diagram':
      return (b.title ? `**${b.title}**\n\n` : '') + '```mermaid\n' + b.mermaid + '\n```'
    case 'map': {
      const points = b.points.map((p) => `- ${p.name}`).join('\n')
      return `**Map${b.title ? `: ${b.title}` : ''}**\n\n${points}`
    }
    case 'file':
      return `📄 ${b.name}`
    case 'sources':
      return '**Sources**\n\n' + b.items.map((s, i) => `${i + 1}. [${s.title}](${s.url})`).join('\n')
    case 'edits':
      return '' // transient detail — the updated code follows anyway
    default:
      return ''
  }
}

export function turnsToMarkdown(turns: Turn[], title: string): string {
  const parts: string[] = [`# ${title}`, '']
  for (const t of turns) {
    if (t.role === 'user') {
      parts.push(`> **You:** ${t.text.replace(/\n/g, '\n> ')}`, '')
    } else {
      const body = t.slots
        .map((s) => (s.kind === 'filled' ? blockToMarkdown(s.block) : ''))
        .filter(Boolean)
        .join('\n\n')
      if (body) parts.push(body, '')
    }
  }
  parts.push('---', '*made with silly-chat*')
  return parts.join('\n')
}

export function downloadText(filename: string, text: string, mime = 'text/markdown'): void {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function exportFilename(title: string, ext: string): string {
  const safe = title.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'chat'
  return `${safe}.${ext}`
}
