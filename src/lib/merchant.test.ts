import { describe, expect, it } from 'vitest'
import {
  formatDistance,
  haversineM,
  isVerifiedWithinYear,
  normalizeBtcMapPlace,
} from './merchant'

describe('isVerifiedWithinYear', () => {
  const now = Date.parse('2026-08-01T00:00:00Z')
  it('accepts recent verifications', () => {
    expect(isVerifiedWithinYear('2026-02-03', now)).toBe(true)
    expect(isVerifiedWithinYear('2025-08-02T00:00:00Z', now)).toBe(true)
  })
  it('rejects old, missing, invalid and future dates', () => {
    expect(isVerifiedWithinYear('2024-01-01', now)).toBe(false)
    expect(isVerifiedWithinYear(undefined, now)).toBe(false)
    expect(isVerifiedWithinYear('not-a-date', now)).toBe(false)
    expect(isVerifiedWithinYear('2027-01-01', now)).toBe(false)
  })
})

describe('haversineM', () => {
  it('is zero for identical points and symmetric', () => {
    expect(haversineM(48.2, 16.3, 48.2, 16.3)).toBeCloseTo(0, 6)
    const a = haversineM(48.2, 16.3, 47.0, 15.0)
    expect(haversineM(47.0, 15.0, 48.2, 16.3)).toBeCloseTo(a, 6)
  })
  it('matches ~111.2 km per degree of latitude', () => {
    expect(haversineM(0, 0, 1, 0)).toBeCloseTo(111195, -2)
  })
})

describe('formatDistance', () => {
  it('formats meters and kilometers', () => {
    expect(formatDistance(120)).toBe('120 m')
    expect(formatDistance(1500)).toBe('1.5 km')
    expect(formatDistance(22000)).toBe('22 km')
    expect(formatDistance(undefined)).toBe('')
  })
})

describe('normalizeBtcMapPlace', () => {
  // Dynamic recent date so the suite doesn't rot as wall-clock time passes.
  const recent = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const place = {
    id: 4829,
    lat: 53.2689435,
    lon: 9.8538715,
    name: 'Der Schafstall',
    address: '5, Nowhere St.',
    icon: 'cafe',
    verified_at: recent,
    comments: 2,
    osm_id: 'node:1234',
    osm_url: 'https://www.openstreetmap.org/node/1234',
    website: 'https://example.com',
    boosted_until: '2027-01-01T00:00:00Z',
    'osm:payment:lightning': 'yes',
    'osm:payment:onchain': 'no',
    'osm:payment:lightning_contactless': 'yes',
  }

  it('maps fields, payment tags and provenance links', () => {
    const m = normalizeBtcMapPlace(place)
    expect(m).toMatchObject({
      source: 'btcmap',
      id: 'btcmap:4829',
      name: 'Der Schafstall',
      acceptsLightning: true,
      acceptsOnchain: false,
      acceptsContactless: true,
      osmUrl: 'https://www.openstreetmap.org/node/1234',
      sourceUrl: 'https://btcmap.org/merchant/node:1234',
    })
    expect(m?.verifiedPastYear).toBe(true)
  })

  it('rejects places without id or coordinates', () => {
    expect(normalizeBtcMapPlace({ ...place, lat: 'x' })).toBeNull()
    expect(normalizeBtcMapPlace({ ...place, id: undefined })).toBeNull()
  })

  it('derives the OSM url from osm_id and defaults the name', () => {
    const m = normalizeBtcMapPlace({ id: 1, lat: 0, lon: 0, osm_id: 'node:99' })
    expect(m?.osmUrl).toBe('https://www.openstreetmap.org/node/99')
    expect(m?.name).toBe('Unnamed merchant')
    expect(m?.acceptsLightning).toBeNull()
  })
})
