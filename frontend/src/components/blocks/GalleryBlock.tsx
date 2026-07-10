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
              className="aspect-square w-full rounded-lg border object-cover transition-transform duration-200 group-hover:scale-[1.015]"
            />
            {(img.caption || img.source_url) && (
              <span className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                {img.caption}
                {img.source_url && (
                  <span className="text-primary/80">
                    {img.caption ? ' · ' : ''}
                    {(() => {
                      try {
                        return new URL(img.source_url).hostname.replace(/^www\./, '')
                      } catch {
                        return ''
                      }
                    })()}
                  </span>
                )}
              </span>
            )}
          </>
        )
        return img.source_url ? (
          <a key={i} href={img.source_url} target="_blank" rel="noreferrer" className="group block">
            {inner}
          </a>
        ) : (
          <div key={i} className="group">{inner}</div>
        )
      })}
    </div>
  )
}
