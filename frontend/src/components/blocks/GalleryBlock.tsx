import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Download, ExternalLink, X } from 'lucide-react'
import type { GalleryBlock, GalleryImage } from '@/types/contract'

export function GalleryBlockView({ block }: { block: GalleryBlock }) {
  const [open, setOpen] = useState<GalleryImage | null>(null)
  return (
    <>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {block.images.map((img, i) => (
          <button
            key={i}
            onClick={() => setOpen(img)}
            aria-label={img.caption ?? 'View image'}
            className="group block text-left"
          >
            <img
              src={img.url}
              alt={img.caption ?? ''}
              loading="lazy"
              className="aspect-square w-full cursor-zoom-in rounded-lg border object-cover transition-transform duration-200 group-hover:scale-[1.015]"
            />
            {(img.caption || img.source_url) && (
              <span className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                {img.caption}
                {img.source_url && (
                  <span className="text-primary/80">
                    {img.caption ? ' · ' : ''}
                    {hostname(img.source_url)}
                  </span>
                )}
              </span>
            )}
          </button>
        ))}
      </div>
      {open && <Lightbox img={open} onClose={() => setOpen(null)} />}
    </>
  )
}

function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return ''
  }
}

const ROUND_BTN =
  'grid size-9 place-items-center rounded-full border bg-card shadow-lg transition-colors hover:bg-accent [&_svg]:size-4'

/** Fullscreen image viewer (same shell as the map/diagram expand) with download. */
function Lightbox({ img, onClose }: { img: GalleryImage; onClose: () => void }) {
  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onEsc)
    return () => document.removeEventListener('keydown', onEsc)
  }, [onClose])

  async function download() {
    const name =
      (img.caption ?? '')
        .replace(/[^\w\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-')
        .slice(0, 60) || 'image'
    try {
      // Blob round-trip so generated images (cookie-authed, no-store) download with
      // a real filename; external images without CORS fall back to a plain open.
      const res = await fetch(img.url, { credentials: 'include' })
      if (!res.ok) throw new Error(String(res.status))
      const blob = await res.blob()
      const ext = (blob.type.split('/')[1] || 'png').replace('jpeg', 'jpg').replace('svg+xml', 'svg')
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `${name}.${ext}`
      a.click()
      URL.revokeObjectURL(a.href)
    } catch {
      window.open(img.url, '_blank', 'noopener')
    }
  }

  return createPortal(
    <div
      className="fixed inset-0 z-50 bg-foreground/40 p-3 backdrop-blur-sm sm:p-6"
      onClick={onClose}
    >
      <div
        className="animate-rise relative flex h-full w-full items-center justify-center overflow-hidden rounded-xl border bg-card shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={img.url}
          alt={img.caption ?? ''}
          className="max-h-full max-w-full object-contain p-3 pb-10 sm:p-6 sm:pb-12"
        />
        {img.caption && (
          <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-card via-card/80 to-transparent px-4 pb-3 pt-10 text-center text-xs text-muted-foreground">
            <span className="line-clamp-2">{img.caption}</span>
          </span>
        )}
        <div className="absolute right-3 top-3 flex items-center gap-1.5">
          <button onClick={download} aria-label="Download image" title="Download" className={ROUND_BTN}>
            <Download />
          </button>
          {img.source_url && (
            <a
              href={img.source_url}
              target="_blank"
              rel="noreferrer"
              aria-label="Open source page"
              title="Open source page"
              className={ROUND_BTN}
            >
              <ExternalLink />
            </a>
          )}
          <button onClick={onClose} aria-label="Close" className={ROUND_BTN}>
            <X />
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
