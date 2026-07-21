import type { Block } from '@/types/contract'
import { Skeleton } from '@/components/ui/skeleton'
import { TextBlockView } from './TextBlock'
import { TableBlockView } from './TableBlock'
import { GalleryBlockView } from './GalleryBlock'
import { ChartBlockView } from './ChartBlock'
import { SimBlockView } from './SimBlock'
import { TimelineBlockView } from './TimelineBlock'
import { ChangeBlockView } from './ChangeBlock'
import { CodeBlockView } from './CodeBlock'
import { DiagramBlockView } from './DiagramBlock'
import { SlidesBlockView } from './SlidesBlock'
import { EditsBlockView } from './EditsBlock'
import { FileBlockView } from './FileBlock'
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
    case 'sim':
      return <SimBlockView block={block} />
    case 'timeline':
      return <TimelineBlockView block={block} />
    case 'change':
      return <ChangeBlockView block={block} />
    case 'code':
      return <CodeBlockView block={block} />
    case 'diagram':
      return <DiagramBlockView block={block} />
    case 'slides':
      return <SlidesBlockView block={block} />
    case 'edits':
      return <EditsBlockView block={block} />
    case 'file':
      return <FileBlockView block={block} />
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
    case 'sim':
      return (
        <div className="space-y-3">
          <Skeleton className="h-40 w-full" />
          <div className="grid grid-cols-2 gap-3">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        </div>
      )
    case 'timeline':
      return (
        <div className="space-y-2">
          <Skeleton className="h-8 w-full" />
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      )
    case 'change':
      return (
        <div className="space-y-3">
          <Skeleton className="h-8 w-2/3" />
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      )
    case 'map':
      return <Skeleton className="h-[320px] w-full" />
    case 'diagram':
      return <Skeleton className="h-56 w-full" />
    case 'slides':
      return <Skeleton className="aspect-[16/9] w-full" />
    case 'edits':
      return <Skeleton className="h-24 w-full" />
    case 'file':
      return <Skeleton className="h-16 w-full max-w-md" />
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
