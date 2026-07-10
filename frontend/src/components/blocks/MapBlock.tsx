import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Maximize2, X } from 'lucide-react'
import type { MapBlock } from '@/types/contract'

/**
 * Interactive map (OpenStreetMap tiles via Leaflet): geocoded markers, optional
 * route polyline, distance/time chips, and an expand-to-fullscreen overlay.
 * Tiles get a CSS filter in dark themes (see index.css .map-tiles rules).
 */

function mountMap(el: HTMLElement, block: MapBlock): L.Map {
  const map = L.map(el, { scrollWheelZoom: false })
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    className: 'map-tiles',
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(map)

  const pts = block.points.map((p) => [p.lat, p.lon] as [number, number])
  block.points.forEach((p, i) => {
    L.circleMarker([p.lat, p.lon], {
      radius: 8,
      color: 'var(--color-primary)',
      weight: 3,
      fillColor: 'var(--color-card)',
      fillOpacity: 1,
    })
      .addTo(map)
      .bindPopup(`<b>${i + 1}.</b> ${p.name}`)
  })

  let bounds = L.latLngBounds(pts)
  if (block.route && block.route.geometry.length > 1) {
    const line = L.polyline(block.route.geometry as [number, number][], {
      color: 'var(--color-primary)',
      weight: 4,
      opacity: 0.85,
    }).addTo(map)
    bounds = line.getBounds()
  }
  map.fitBounds(bounds.pad(0.25), { maxZoom: 15 })
  return map
}

function MapCanvas({ block, className }: { block: MapBlock; className: string }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!ref.current) return
    const map = mountMap(ref.current, block)
    // The container is often still sizing on first paint (tabs, modals, rise-in).
    const t = setTimeout(() => map.invalidateSize(), 120)
    return () => {
      clearTimeout(t)
      map.remove()
    }
  }, [block])
  return <div ref={ref} className={className} />
}

export function MapBlockView({ block }: { block: MapBlock }) {
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    if (!expanded) return
    const onEsc = (e: KeyboardEvent) => e.key === 'Escape' && setExpanded(false)
    document.addEventListener('keydown', onEsc)
    return () => document.removeEventListener('keydown', onEsc)
  }, [expanded])

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <div className="flex items-center justify-between gap-2 border-b bg-muted/40 px-3 py-1.5">
        <span className="truncate text-xs font-semibold">
          {block.title || block.points.map((p) => p.name).join(' → ')}
        </span>
        <div className="flex shrink-0 items-center gap-2">
          {block.route && (
            <span className="text-[11px] text-muted-foreground">
              {block.route.distance_km} km · ~{Math.round(block.route.duration_min)} min
            </span>
          )}
          <button
            onClick={() => setExpanded(true)}
            aria-label="Expand map"
            title="Expand map"
            className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-background hover:text-foreground [&_svg]:size-3.5"
          >
            <Maximize2 />
          </button>
        </div>
      </div>
      <MapCanvas block={block} className="z-0 h-[320px] w-full" />

      {expanded &&
        // Portal to <body>: ancestors animate with transforms, which would otherwise
        // trap this fixed overlay inside the block.
        createPortal(
        <div className="fixed inset-0 z-50 bg-foreground/40 p-3 backdrop-blur-sm sm:p-6">
          <div className="animate-rise relative h-full w-full overflow-hidden rounded-xl border bg-card shadow-2xl">
            <MapCanvas block={block} className="z-0 h-full w-full" />
            <button
              onClick={() => setExpanded(false)}
              aria-label="Close map"
              className="absolute right-3 top-3 z-[1000] grid size-9 place-items-center rounded-full border bg-card shadow-lg transition-colors hover:bg-accent [&_svg]:size-4"
            >
              <X />
            </button>
            {block.route && (
              <span className="absolute bottom-3 left-3 z-[1000] rounded-full border bg-card px-3 py-1.5 text-xs font-semibold shadow-lg">
                {block.route.distance_km} km · ~{Math.round(block.route.duration_min)} min by car
              </span>
            )}
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}
