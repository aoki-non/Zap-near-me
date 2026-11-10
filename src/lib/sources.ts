// Pluggable merchant sources. BTC Map is live; the Crypto Map source is a
// disabled stub until licensed data access exists (see README §2).

import { fetchPlace, searchByName, searchNearby, type BtcMapPlace } from './btcmap'
import { normalizeBtcMapPlace, type Merchant } from './merchant'

export interface MerchantSource {
  id: 'btcmap' | 'cryptomap'
  label: string
  available: boolean
  unavailableReason?: string
  nearby(lat: number, lon: number, radiusKm: number, signal?: AbortSignal): Promise<Merchant[]>
  searchByName(name: string, signal?: AbortSignal): Promise<Merchant[]>
  detail(id: string, signal?: AbortSignal): Promise<Merchant | null>
}

function normalizeAll(places: BtcMapPlace[]): Merchant[] {
  const out: Merchant[] = []
  for (const p of places) {
    const m = normalizeBtcMapPlace(p)
    if (m) out.push(m)
  }
  return out
}

export class BtcMapSource implements MerchantSource {
  id = 'btcmap' as const
  label = 'BTC Map'
  available = true

  async nearby(lat: number, lon: number, radiusKm: number, signal?: AbortSignal): Promise<Merchant[]> {
    return normalizeAll(await searchNearby(lat, lon, radiusKm, signal))
  }

  async searchByName(name: string, signal?: AbortSignal): Promise<Merchant[]> {
    return normalizeAll(await searchByName(name, signal))
  }

  async detail(id: string, signal?: AbortSignal): Promise<Merchant | null> {
    // Namespaced "btcmap:4829" → numeric v4 id (v4 also accepts OSM ids).
    const raw = id.startsWith('btcmap:') ? id.slice('btcmap:'.length) : id
    return normalizeBtcMapPlace(await fetchPlace(raw, undefined, signal))
  }
}

/**
 * Disabled until there is licensed access. The Crypto Map frontend is public
 * (nimiq/crypto-map) but its location data is a private submodule fed by the
 * commercial NAKA API + paid Google Places enrichment — no open API. To enable:
 * get an agreement/API from the Nimiq team or license NAKA/GoCrypto directly,
 * then implement nearby/searchByName/detail against it.
 */
export class CryptoMapSource implements MerchantSource {
  id = 'cryptomap' as const
  label = "Nimiq Crypto Map"
  available = false
  unavailableReason =
    'No open API: Crypto Map location data is private (NAKA/GoCrypto feed). ' +
    'Needs a Nimiq data agreement — see README.'

  async nearby(): Promise<Merchant[]> {
    throw new Error(this.unavailableReason)
  }
  async searchByName(): Promise<Merchant[]> {
    throw new Error(this.unavailableReason)
  }
  async detail(): Promise<Merchant | null> {
    throw new Error(this.unavailableReason)
  }
}

export const sources: MerchantSource[] = [new BtcMapSource(), new CryptoMapSource()]

export const liveSources = (): MerchantSource[] => sources.filter((s) => s.available)
