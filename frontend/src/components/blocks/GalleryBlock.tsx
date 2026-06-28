import type { GalleryBlock } from '@/types/contract'

export function GalleryBlockView({ block }: { block: GalleryBlock }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {block.images.map((img, i) => {
        const inner = (
          <>
            <img
              src={img.url}
              alt={img.caption ?? ''}
              loading="lazy"
              className="aspect-square w-full rounded-lg object-cover"
            />
            {img.caption && (
              <span className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                {img.caption}
              </span>
            )}
          </>
        )
        return img.source_url ? (
          <a key={i} href={img.source_url} target="_blank" rel="noreferrer" className="block">
            {inner}
          </a>
        ) : (
          <div key={i}>{inner}</div>
        )
      })}
    </div>
  )
}
