# Zap Near Me — a merchant map that pays

*Bitcoin merchants around you — pay in seconds.*

A [Nimiq Pay Mini App](https://nimiq.dev/mini-apps/) that shows bitcoin-accepting
merchants near you and lets you pay them over Lightning without leaving Nimiq Pay.

- **Map**: BTC Map places (26,900+ merchants, 16,000+ verified in the past year —
  August 2026 numbers) via the open
  [BTC Map REST API v4](https://github.com/teambtcmap/btcmap-api/blob/master/docs/rest/v4/README.md).
- **Pay**: tap a merchant, then either paste the BOLT11 invoice from its till or pay
  its Lightning Address (resolved via LNURL-pay with an amount you enter).
  Payment goes through `payLightningInvoice()` — you spend NIM or USDT, the
  merchant receives BTC over Lightning.
- **Cache**: client-side IndexedDB snapshot + incremental sync, plus an optional
  edge cache worker in [`cache/`](./cache/worker.ts).

## Check-first answers (read before shipping)

### 1. Attribution duties for the OpenStreetMap-derived data

BTC Map merchant data is derived from OpenStreetMap (tags like `currency:XBT`,
`payment:lightning`), so the
[Open Database License (ODbL)](https://opendatacommons.org/licenses/odbl/) applies
to the data, on top of any tile-layer terms. What this app does about it:

- Every map view carries `© OpenStreetMap contributors` linking to
  <https://www.openstreetmap.org/copyright>, plus a BTC Map credit and the tile
  provider credit (see [`src/lib/map.ts`](./src/lib/map.ts)).
- The About panel states the data is available under the ODbL and links the
  license text.
- Each merchant sheet links back to its OpenStreetMap object and its BTC Map
  page, preserving provenance.
- The cache only redistributes the data; it does not strip `osm_id` references.
  If you ever publish a corrected/enriched merchant database built on this data,
  ODbL share-alike requires offering that derivative database under the ODbL too.

Full checklist: [`ATTRIBUTION.md`](./ATTRIBUTION.md).

### 2. API access to Nimiq's Crypto Map

There is **no open API or open dataset** for the Crypto Map:

- The frontend repo ([nimiq/crypto-map](https://github.com/nimiq/crypto-map)) is
  public, but all location data lives in the **private** `nimiq/crypto-map-sources`
  submodule, piped from the commercial NAKA API (`api.gocrypto.com`) and enriched
  with paid Google Places data — neither redistributable.
- The app's own `/api/search` and `/api/locations/[uuid]` routes are internal to
  the Nuxt deployment, undocumented for third-party use.

So this app ships with BTC Map as the live source and a `MerchantSource`
interface with a disabled `CryptoMapSource` stub
([`src/lib/sources.ts`](./src/lib/sources.ts)). To light it up, either get an
agreement/API from the Nimiq team or license the NAKA/GoCrypto feed directly,
then implement the two interface methods. No UI changes needed.

A related product note: BTC Map merchants generally do **not** publish a Lightning
Address (OSM has no standard tag for it), so the primary pay path is the till
invoice; the Lightning Address path covers merchants whose address is known
(Crypto Map data, shop signage, or typed in).

## Quickstart

```bash
cd zap-near-me
cp .env.example .env   # then put your CARTO basemap key in .env
npm install
npm run dev -- --host
```

Then open Nimiq Pay → Mini Apps → Custom URL → `http://<your-LAN-IP>:5173`
([details](https://nimiq.dev/mini-apps/development/load-local-mini-app)).
On desktop without Nimiq Pay the map works; paying shows an
"open in Nimiq Pay" notice.

```bash
npm test        # unit tests (pure merchant/lnurl helpers)
npm run build   # production build
```

Copy [`.env.example`](./.env.example) to `.env` to point at your cache worker or a
custom tile server.

## How it works

```
┌─────────────┐  viewport search   ┌──────────────────────┐
│  Mini App   │ ── lat/lon/radius ─▶  BTC Map v4 API       │
│  (Vue+Leaflet)◀── places ────────  (or cache/ worker)   │
└──────┬──────┘                    └──────────────────────┘
       │ IndexedDB snapshot + updated_since incremental sync
       │ tap merchant → detail fetch (contact + payment tags)
       ▼
┌─────────────┐  BOLT11 ──────────────────────┐
│  Pay sheet  │  address + sats → LNURL-pay → invoice
└──────┬──────┘                               ▼
       │ payLightningInvoice({ invoice })  Nimiq Pay
       │ ◀── { hash, swapId } (submitted,  (swap NIM/USDT → BTC,
       │      not yet settled)               user approves)
       ▼
  merchant receives BTC over Lightning
```

Key files:

| File | Purpose |
| ---- | ------- |
| `src/lib/btcmap.ts` | v4 client: search, detail, chronological sync, CDN snapshot |
| `src/lib/merchant.ts` | normalized `Merchant`, verification + distance helpers |
| `src/lib/sources.ts` | pluggable sources; BTC Map live, Crypto Map stub |
| `src/lib/store.ts` | IndexedDB place cache + sync anchor |
| `src/lib/lnurl.ts` | BOLT11 / address / LNURL parsing + LNURL-pay resolve |
| `src/lib/pay.ts` | Nimiq provider wrapper + duplicate/unknown-outcome handling |
| `src/lib/map.ts` | Leaflet setup with required attribution |
| `cache/worker.ts` | optional edge cache (search + detail, stale-while-revalidate) |

## Payment notes

- `payLightningInvoice()` is **mainnet only**; test with a small mainnet invoice.
- A resolved call means the spending transaction was **submitted**, not that the
  merchant received BTC. The pay sheet keeps that state visible, with `hash` and
  `swapId` for follow-up.
- Re-paying an invoice (including one resolved from the same LNURL) is rejected
  with `DUPLICATE_PAYMENT`; an unclear submission outcome surfaces as
  `TRANSACTION_OUTCOME_UNKNOWN` with identifiers when known. Never auto-retry:
  check with the merchant first.
- Nimiq Pay chooses the spending asset (NIM or USDT on Polygon) and shows
  approval dialogs; the Mini App never signs directly.
