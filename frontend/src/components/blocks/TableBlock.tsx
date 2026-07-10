import type { TableBlock } from '@/types/contract'
import { InlineMd } from './InlineMd'

// Card-styled table (design doc): muted header band, 13.5px cells, and the table
// scrolls horizontally INSIDE the card when wider than the column.
export function TableBlockView({ block }: { block: TableBlock }) {
  return (
    <div className="overflow-x-auto rounded-lg border bg-card">
      <table className="w-full text-[13.5px]">
        <thead className="bg-muted">
          <tr>
            {block.columns.map((c, i) => (
              <th
                key={i}
                className="whitespace-nowrap px-3.5 py-2.5 text-left text-[12.5px] font-bold"
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.rows.map((row, r) => (
            <tr key={r} className="border-t">
              {row.map((cell, c) => (
                <td key={c} className="px-3.5 py-2.5 align-top">
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
