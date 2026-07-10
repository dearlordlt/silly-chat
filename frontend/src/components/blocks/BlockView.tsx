import type { Block } from '@/types/contract'
import { Skeleton } from '@/components/ui/skeleton'
import { TextBlockView } from './TextBlock'
import { TableBlockView } from './TableBlock'
import { GalleryBlockView } from './GalleryBlock'
import { ChartBlockView } from './ChartBlock'
import { CodeBlockView } from './CodeBlock'
import { MapBlockView } from './MapBlock'
import { SourcesBlockView } from './SourcesBlock'

/** Render a completed block by dispatching on its discriminant. */
export function BlockView({ block }: { block: Block }) {
  switch (block.type) {
    case 'text':
      return <TextBlockView block={block} />
    case 'table':
      return <TableBlockView block={block} />
    case 'gallery':
      return <GalleryBlockView block={block} />
    case 'chart':
      return <ChartBlockView block={block} />
    case 'code':
      return <CodeBlockView block={block} />
    case 'map':
      return <MapBlockView block={block} />
    case 'sources':
      return <SourcesBlockView block={block} />
  }
}

/** Type-specific skeleton shown between block_start and block_data. */
export function BlockSkeleton({ blockType }: { blockType: string }) {
  switch (blockType) {
    case 'table':
      return (
        <div className="space-y-2">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-6 w-full" />
          <Skeleton className="h-6 w-5/6" />
        </div>
      )
    case 'gallery':
      return (
        <div className="grid grid-cols-3 gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="aspect-square w-full" />
          ))}
        </div>
      )
    case 'chart':
      return <Skeleton className="h-40 w-full" />
    case 'map':
      return <Skeleton className="h-[320px] w-full" />
    case 'code':
      return <Skeleton className="h-24 w-full" />
    default:
      return (
        <div className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-4/5" />
        </div>
      )
  }
}
