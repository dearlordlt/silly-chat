import { useEffect, useState } from 'react'
import { ArrowLeft, Images, Trash2 } from 'lucide-react'
import { api, type GalleryItem } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { Lightbox } from '@/components/blocks/GalleryBlock'
import { toast } from '@/components/ui/toast'

/** The user's generated-images gallery — same floating-card shell as Settings.
 * Each image keeps its generation prompt + model (stored sealed under the user's
 * key); images live here until the user deletes them. */
export function GalleryPage({ onBack }: { onBack: () => void }) {
  const [items, setItems] = useState<GalleryItem[] | null>(null)
  const [open, setOpen] = useState<GalleryItem | null>(null)
  const [toDelete, setToDelete] = useState<GalleryItem | null>(null)

  useEffect(() => {
    api.getGallery().then(setItems).catch((e) => toast.error(String(e.message ?? e)))
  }, [])

  function remove(item: GalleryItem) {
    api
      .deleteGalleryImage(item.id)
      .then(() => {
        setItems((list) => (list ?? []).filter((i) => i.id !== item.id))
        toast.success('Image deleted')
      })
      .catch((e) => toast.error(String(e.message ?? e)))
  }

  return (
    <div className="min-h-dvh overflow-y-auto px-4 py-8 sm:px-8">
      <div className="animate-rise mx-auto w-full max-w-[1240px] rounded-2xl border bg-card p-6 shadow-[0_10px_40px_0_color-mix(in_oklch,var(--color-primary)_8%,transparent)] sm:p-7">
        <div className="mb-6 flex items-center gap-2">
          <Button variant="ghost" size="icon" onClick={onBack} aria-label="Back to chat">
            <ArrowLeft />
          </Button>
          <h1 className="text-lg font-bold tracking-tight">Gallery</h1>
          {items && items.length > 0 && (
            <span className="text-[13px] text-muted-foreground">
              {items.length} image{items.length === 1 ? '' : 's'}
            </span>
          )}
        </div>

        {!items ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : items.length === 0 ? (
          <div className="grid place-items-center gap-2 py-16 text-center text-muted-foreground">
            <Images className="size-8" />
            <p className="text-sm font-medium">Nothing here yet</p>
            <p className="max-w-sm text-[13px]">
              Every image the assistant generates for you lands here, with the prompt
              that made it. Try asking for one — "draw me a…"
            </p>
          </div>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {items.map((item) => (
              <li key={item.id} className="group relative rounded-lg border bg-card p-2">
                <button
                  onClick={() => setOpen(item)}
                  aria-label={item.prompt || 'View image'}
                  className="block w-full"
                >
                  <img
                    src={item.url}
                    alt={item.prompt}
                    loading="lazy"
                    className="aspect-square w-full cursor-zoom-in rounded-md border object-cover transition-transform duration-200 group-hover:scale-[1.01]"
                  />
                </button>
                <p className="mt-1.5 line-clamp-2 min-h-[2em] text-xs text-muted-foreground" title={item.prompt}>
                  {item.prompt || '(no prompt recorded)'}
                </p>
                <p className="mt-1 flex items-center justify-between gap-2 text-[11px] text-muted-foreground/80">
                  <span className="truncate" title={item.model}>
                    {(item.model || '').split('/').pop() || 'unknown model'}
                  </span>
                  <span className="shrink-0">
                    {new Date(item.created_at).toLocaleDateString(undefined, {
                      month: 'short',
                      day: 'numeric',
                    })}
                  </span>
                </p>
                <button
                  onClick={() => setToDelete(item)}
                  aria-label="Delete image"
                  title="Delete"
                  className="absolute right-3 top-3 grid size-7 place-items-center rounded-full border bg-card text-muted-foreground opacity-0 shadow-md transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100 [&_svg]:size-3.5"
                >
                  <Trash2 />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {open && (
        <Lightbox
          img={{ url: open.url, caption: open.prompt || null, source_url: null }}
          onClose={() => setOpen(null)}
        />
      )}

      {toDelete && (
        <ConfirmDialog
          title="Delete this image?"
          message="It disappears from your gallery and from any chats that show it. This can't be undone."
          confirmLabel="Delete"
          destructive
          onCancel={() => setToDelete(null)}
          onConfirm={() => {
            const item = toDelete
            setToDelete(null)
            remove(item)
          }}
        />
      )}
    </div>
  )
}
