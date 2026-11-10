// Optional edge cache in front of api.btcmap.org (Cloudflare Worker).
// Deploy: `wrangler deploy` with this file + wrangler.toml, then set
// VITE_BTCMAP_API=https://<your-worker>/ in the Mini App.
//
// What it does: caches GET /v4/places/search and /v4/places/:id responses at
// the edge with stale-while-revalidate, so map drags don't all hit London and
// the app survives short upstream outages. It redistributes BTC Map data
// verbatim (allowed with attribution — see ATTRIBUTION.md) and never strips
// osm_id/osm_url provenance fields.

const UPSTREAM = 'https://api.btcmap.org'

// Search results change slowly; details even slower.
const SEARCH_TTL = 300 // 5 min fresh, then revalidate in background
const DETAIL_TTL = 3600 // 1 h
const SWR = 86400 // serve stale up to a day while revalidating

export default {
  async fetch(request: Request, _env: unknown, ctx: { waitUntil(p: Promise<unknown>): void }): Promise<Response> {
    const url = new URL(request.url)
    if (request.method !== 'GET' || !url.pathname.startsWith('/v4/places')) {
      return json({ code: 'not_found', message: 'Only GET /v4/places/* is cached here' }, 404)
    }
    // Never cache or proxy auth'd or write paths (saved places, comments…).
    if (url.pathname.includes('/saved') || request.headers.has('authorization')) {
      return json({ code: 'forbidden', message: 'Authenticated paths are not proxied' }, 403)
    }

    const ttl = url.pathname.includes('/search') ? SEARCH_TTL : DETAIL_TTL
    // Cloudflare exposes the edge cache as `caches.default`, which the DOM
    // lib's CacheStorage type doesn't declare — cast narrowly instead of
    // pulling in @cloudflare/workers-types (it conflicts with DOM lib types).
    const cache: Cache = (caches as unknown as { default: Cache }).default
    const cacheKey = new Request(url.toString(), { method: 'GET' })
    const cached = await cache.match(cacheKey)
    if (cached) {
      ctx.waitUntil(revalidateAndStore(cache, cacheKey, url, ttl))
      return withCors(cached)
    }
    const fresh = await fetchUpstream(url, ttl)
    ctx.waitUntil(cache.put(cacheKey, fresh.clone()))
    return withCors(fresh)
  },
}

async function revalidateAndStore(
  cache: Cache,
  key: Request,
  url: URL,
  ttl: number,
): Promise<void> {
  try {
    await cache.put(key, await fetchUpstream(url, ttl))
  } catch {
    /* keep serving the stale copy */
  }
}

async function fetchUpstream(url: URL, ttl: number): Promise<Response> {
  const upstream = new URL(url.pathname + url.search, UPSTREAM)
  const res = await fetch(upstream.toString(), { headers: { Accept: 'application/json' } })
  const body = await res.arrayBuffer()
  return new Response(body, {
    status: res.status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': `public, max-age=${ttl}, stale-while-revalidate=${SWR}`,
    },
  })
}

function withCors(res: Response): Response {
  const out = new Response(res.body, res)
  out.headers.set('Access-Control-Allow-Origin', '*')
  return out
}

function json(obj: unknown, status: number): Response {
  return withCors(
    new Response(JSON.stringify(obj), {
      status,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    }),
  )
}
