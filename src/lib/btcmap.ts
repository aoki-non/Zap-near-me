// Minimal client for the BTC Map REST API v4 (open, no key).
// Docs: https://github.com/teambtcmap/btcmap-api/blob/master/docs/rest/v4/README.md

export type BtcMapPlace = Record<string, unknown>

const DEFAULT_API = 'https://api.btcmap.org'
const DEFAULT_SNAPSHOT = 'https://cdn.static.btcmap.org/api/v4/places.json'

export function apiBase(): string {
  const fromEnv = (import.meta.env?.VITE_BTCMAP_API as string | undefined)?.replace(/\/$/, '')
  return fromEnv || DEFAULT_API
}

/** Fields for the merchant detail fetch: contact + payment OSM tags. */
export const DETAIL_FIELDS = [
  'id', 'lat', 'lon', 'icon', 'name', 'address', 'opening_hours', 'comments',
  'created_at', 'updated_at', 'verified_at', 'osm_id', 'osm_url', 'phone',
  'website', 'email', 'boosted_until', 'description', 'image',
  // Raw OSM payment tags (v4 `osm:<tag>` passthrough).
  'osm:currency:XBT', 'osm:payment:bitcoin', 'osm:payment:lightning',
  'osm:payment:onchain', 'osm:payment:lightning_contactless',
  'osm:check_date:currency:XBT',
].join(',')

/** Lightweight fields for sync: pins + cache eviction. */
export const SYNC_FIELDS = 'id,lat,lon,icon,comments,deleted_at,updated_at'

async function getJson(url: string, signal?: AbortSignal): Promise<unknown> {
  const res = await fetch(url, { signal, headers: { Accept: 'application/json' } })
  if (!res.ok) {
    let detail = ''
    try {
      const body = (await res.json()) as { message?: string }
      if (body?.message) detail = `: ${body.message}`
    } catch {
      /* non-JSON error body */
    }
    throw new Error(`BTC Map request failed (${res.status})${detail}`)
  }
  return res.json()
}

function asPlaces(data: unknown): BtcMapPlace[] {
  if (!Array.isArray(data)) throw new Error('Unexpected BTC Map response shape')
  return data as BtcMapPlace[]
}

/**
 * Viewport/nearby search. Docs: "fairly optimized, you can call it every time
 * the user moves the map." Returns detail-lite places (no payment tags —
 * fetch detail per place for those).
 */
export async function searchNearby(lat: number, lon: number, radiusKm: number, signal?: AbortSignal): Promise<BtcMapPlace[]> {
  const url = `${apiBase()}/v4/places/search/?lat=${lat}&lon=${lon}&radius_km=${radiusKm}`
  return asPlaces(await getJson(url, signal))
}

export async function searchByName(name: string, signal?: AbortSignal): Promise<BtcMapPlace[]> {
  const url = `${apiBase()}/v4/places/search/?name=${encodeURIComponent(name)}`
  return asPlaces(await getJson(url, signal))
}

export async function fetchPlace(id: number | string, fields = DETAIL_FIELDS, signal?: AbortSignal): Promise<BtcMapPlace> {
  const url = `${apiBase()}/v4/places/${id}?fields=${encodeURIComponent(fields)}`
  const data = await getJson(url, signal)
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new Error('Unexpected BTC Map place response shape')
  }
  return data as BtcMapPlace
}

/**
 * One chronological-sync page. Clients page with `updatedSince` until a page
 * comes back short, then store the max updated_at as the new anchor.
 * `includeDeleted` must be true after the cold sync so evictions propagate.
 */
export async function syncPlacesPage(
  updatedSince: string,
  opts: { fields?: string; includeDeleted?: boolean; limit?: number } = {},
  signal?: AbortSignal,
): Promise<BtcMapPlace[]> {
  const params = new URLSearchParams({
    fields: opts.fields ?? SYNC_FIELDS,
    updated_since: updatedSince,
    include_deleted: String(opts.includeDeleted ?? true),
  })
  if (opts.limit != null) params.set('limit', String(opts.limit))
  return asPlaces(await getJson(`${apiBase()}/v4/places?${params}`, signal))
}

/** CDN snapshot for instant pins (id/lat/lon/icon/comments/boosted_until). */
export async function fetchSnapshot(signal?: AbortSignal): Promise<{ places: BtcMapPlace[]; lastModified: string | null }> {
  const res = await fetch(DEFAULT_SNAPSHOT, { signal, headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`BTC Map snapshot failed (${res.status})`)
  return { places: asPlaces(await res.json()), lastModified: res.headers.get('last-modified') }
}
