// Leaflet map setup. Attribution here is a license duty, not decoration:
// OSM/ODbL credit + BTC Map credit + tile provider credit (see ATTRIBUTION.md).

import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { Merchant } from './merchant'

const OSM_CREDIT =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
const BTCMAP_CREDIT = '<a href="https://btcmap.org">BTC Map</a>'
const DEFAULT_TILE_CREDIT = '&copy; <a href="https://carto.com/attributions">CARTO</a>'
// CARTO requires an API key on all raster tiles (get one at
// https://carto.com/basemaps/apikey). Without a key the tiles render an
// "API KEY REQUIRED" watermark instead of the map.
const OSM_FALLBACK_TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'

function tileConfig(): { url: string; credit: string } {
  const env = import.meta.env ?? {}
  const override = env.VITE_TILE_URL as string | undefined
  if (override) {
    return { url: override, credit: (env.VITE_TILE_ATTRIBUTION as string | undefined) || DEFAULT_TILE_CREDIT }
  }
  const key = env.VITE_CARTO_API_KEY as string | undefined
  if (key) {
    return {
      url: `https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png?key=${key}`,
      credit: DEFAULT_TILE_CREDIT,
    }
  }
  console.warn('VITE_CARTO_API_KEY is not set; falling back to OSM tiles. Get a free key at https://carto.com/basemaps/apikey')
  return { url: OSM_FALLBACK_TILES, credit: '' } // OSM credit is already in the base string
}

export interface MapHandles {
  map: L.Map
  markers: L.LayerGroup
}

export function createMap(el: HTMLElement): MapHandles {
  const map = L.map(el, { zoomControl: false, attributionControl: true }).setView([20, 0], 2)
  L.control.zoom({ position: 'bottomright' }).addTo(map)

  const { url: tileUrl, credit: tileCredit } = tileConfig()
  const attribution = tileCredit
    ? `${OSM_CREDIT} &middot; ${BTCMAP_CREDIT} &middot; ${tileCredit}`
    : `${OSM_CREDIT} &middot; ${BTCMAP_CREDIT}`
  L.tileLayer(tileUrl, { maxZoom: 19, attribution }).addTo(map)

  const markers = L.layerGroup().addTo(map)
  return { map, markers }
}

/** Pin markers only use divIcons (no image assets to bundle). */
export function markerFor(m: Merchant): L.DivIcon {
  const cls = m.verifiedPastYear ? 'pin pin-verified' : 'pin'
  return L.divIcon({
    className: '',
    html: `<span class="${cls}${m.boosted ? ' pin-boosted' : ''}" title="${escapeHtml(m.name)}"></span>`,
    iconSize: [18, 18],
    iconAnchor: [9, 9],
  })
}

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]!)
}
