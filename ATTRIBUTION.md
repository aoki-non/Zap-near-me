# Attribution & data-license compliance

This app displays merchant data derived from OpenStreetMap via BTC Map. This file
records what the licenses require and where the app satisfies each duty.

## 1. OpenStreetMap data (ODbL 1.0)

Source: [openstreetmap.org/copyright](https://www.openstreetmap.org/copyright),
[ODbL text](https://opendatacommons.org/licenses/odbl/1-0/).

| Duty | What it means here | Where satisfied |
| ---- | ------------------ | --------------- |
| Credit `© OpenStreetMap contributors` on every map view | Corner attribution on the browsable map | `src/lib/map.ts` tile-layer attribution |
| Link the credit to openstreetmap.org/copyright | The credit must be a link | same string (HTML link) |
| State the data is available under the ODbL | A notice + link to the license | About panel (`src/components/AboutPanel.vue`) |
| Keep provenance for redistribution | Don't strip OSM references from cached data | cache keeps `osm_id`/`osm_url`; merchant sheet links both |
| Share-alike for derivative **databases** | Displaying pins (a Produced Work) is fine; if you publish a corrected/merged merchant DB, offer it under ODbL too | process duty — see note below |

Note on share-alike: the edge cache in `cache/` redistributes BTC Map data
verbatim (allowed with attribution). If you later merge sources, fix locations,
or add proprietary fields and serve that combined dataset, that combined
*database* must be made available under the ODbL. Keep `osm_id` on every record
so corrections can flow back upstream.

## 2. BTC Map

- API: open, no key. Docs: <https://github.com/teambtcmap/btcmap-api>.
- Code is AGPL-3.0 (we don't copy their code, we call their API — unaffected).
- Data flows from OSM (see §1). We credit BTC Map on the map and link each
  merchant to its `btcmap.org/merchant/…` page as a courtesy + provenance.
- Be a good citizen: use the
  [CDN snapshot](https://cdn.static.btcmap.org/api/v4/places.json) + incremental
  `updated_since` sync for bulk data, and viewport `places/search` for live
  queries (that's what `src/lib/btcmap.ts` does).

## 3. Map tiles

Default is CARTO basemaps over OSM data, which require a free API key
(`VITE_CARTO_API_KEY`, see `.env.example`); the tile layer attribution names
both OSM and CARTO. Without a key the app falls back to OSM community tiles
with OSM-only credit. If you switch `VITE_TILE_URL`, update
`VITE_TILE_ATTRIBUTION` to whatever that provider requires — tile terms are
separate from data terms, and heavy apps should use a paid tile account rather
than the OSM community tile servers.

## 4. Nimiq Crypto Map / NAKA data (not shipped)

The disabled `CryptoMapSource` stub exists so a future licensed feed (Nimiq
agreement or direct NAKA/GoCrypto license + Google Places terms) can plug in.
That data carries its own commercial terms — do not scrape `map.nimiq.com`;
license it properly first.

## Pre-release checklist

- [ ] Map corner shows © OpenStreetMap contributors (linked) + BTC Map + tiles
- [ ] About panel shows the ODbL notice with license link
- [ ] Merchant sheets link to the OSM object and BTC Map page
- [ ] Cache/API responses preserve `osm_id` / `osm_url`
- [ ] No Nimiq/Crypto Map data included without a license
- [ ] Tile provider terms respected for expected traffic
