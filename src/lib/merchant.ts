// Normalized merchant model shared by all map sources (BTC Map live,
// Nimiq Crypto Map stub). Pure helpers are unit-tested in merchant.test.ts.

export type MerchantSourceId = 'btcmap' | 'cryptomap'

export interface Merchant {
  source: MerchantSourceId
  /** Stable namespaced id, e.g. "btcmap:4829". */
  id: string
  name: string
  lat: number
  lon: number
  icon?: string
  address?: string
  /** ISO date/datetime of last verification, when known. */
  verifiedAt?: string
  /** True when verified within the trailing 365 days. */
  verifiedPastYear: boolean
  /** Payment acceptance: true/false, or null when the source doesn't say. */
  acceptsLightning: boolean | null
  acceptsOnchain: boolean | null
  acceptsContactless: boolean | null
  /** Known Lightning Address, if any. Rare: OSM has no standard tag for it. */
  lightningAddress?: string
  phone?: string
  website?: string
  email?: string
  openingHours?: string
  description?: string
  comments?: number
  boosted?: boolean
  /** Provenance links (keep: ODbL attribution chain, see ATTRIBUTION.md). */
  osmUrl?: string
  sourceUrl: string
  /** Meters from the user's location, filled in by the view layer. */
  distanceM?: number
}

const YEAR_MS = 365 * 24 * 60 * 60 * 1000

/** True when `verifiedAt` parses and falls within the trailing 365 days. */
export function isVerifiedWithinYear(verifiedAt: string | undefined, now = Date.now()): boolean {
  if (!verifiedAt) return false
  const t = Date.parse(verifiedAt)
  if (Number.isNaN(t)) return false
  return t <= now && now - t <= YEAR_MS
}

/** Great-circle distance in meters (haversine). */
export function haversineM(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const rad = Math.PI / 180
  const dLat = (bLat - aLat) * rad
  const dLon = (bLon - aLon) * rad
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLon / 2) ** 2
  return 2 * 6371000 * Math.asin(Math.sqrt(h))
}

export function formatDistance(m: number | undefined): string {
  if (m == null || Number.isNaN(m)) return ''
  if (m < 950) return `${Math.round(m)} m`
  if (m < 9500) return `${(m / 1000).toFixed(1)} km`
  return `${Math.round(m / 1000)} km`
}

/** Normalize one raw BTC Map v4 place into a Merchant. */
export function normalizeBtcMapPlace(place: Record<string, unknown>): Merchant | null {
  const id = place['id']
  const lat = place['lat']
  const lon = place['lon']
  if (typeof id !== 'number' || typeof lat !== 'number' || typeof lon !== 'number') return null

  const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined)
  // v4 exposes extra OSM tags as `osm:<tag>` fields when requested.
  const tag = (name: string): string | undefined => str(place[`osm:${name}`])
  // OSM yes/no tri-state: yes/true/1 → true, no/false/0 → false, else null.
  const tri = (v: string | undefined): boolean | null => {
    if (v == null) return null
    const s = v.trim().toLowerCase()
    if (['yes', 'true', '1', 'only'].includes(s)) return true
    if (['no', 'false', '0'].includes(s)) return false
    return null
  }

  const verifiedAt = str(place['verified_at'])
  const osmId = str(place['osm_id'])
  const boostedUntil = str(place['boosted_until'])
  const boosted = boostedUntil != null && !Number.isNaN(Date.parse(boostedUntil)) && Date.parse(boostedUntil) > Date.now()

  return {
    source: 'btcmap',
    id: `btcmap:${id}`,
    name: str(place['name']) ?? 'Unnamed merchant',
    lat,
    lon,
    icon: str(place['icon']),
    address: str(place['address']),
    verifiedAt,
    verifiedPastYear: isVerifiedWithinYear(verifiedAt),
    acceptsLightning: tri(tag('payment:lightning')),
    acceptsOnchain: tri(tag('payment:onchain')) ?? tri(tag('payment:bitcoin')),
    acceptsContactless: tri(tag('payment:lightning_contactless')),
    phone: str(place['phone']),
    website: str(place['website']),
    email: str(place['email']),
    openingHours: str(place['opening_hours']),
    description: str(place['description']),
    comments: typeof place['comments'] === 'number' ? place['comments'] : undefined,
    boosted,
    osmUrl: str(place['osm_url']) ?? (osmId ? `https://www.openstreetmap.org/${osmId.replace(':', '/')}` : undefined),
    // Canonical merchant page keyed by OSM id, e.g. /merchant/node:1234.
    sourceUrl: osmId ? `https://btcmap.org/merchant/${osmId}` : 'https://btcmap.org',
  }
}
