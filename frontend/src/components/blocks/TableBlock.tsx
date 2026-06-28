import type { TableBlock } from '@/types/contract'
import { InlineMd } from './InlineMd'

export function TableBlockView({ block }: { block: TableBlock }) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-muted/60">
          <tr>
            {block.columns.map((c, i) => (
              <th key={i} className="px-3 py-2 text-left font-medium">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.rows.map((row, r) => (
            <tr key={r} className="border-t">
              {row.map((cell, c) => (
                <td key={c} className="px-3 py-2 align-top">
                  <InlineMd>{cell}</InlineMd>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
