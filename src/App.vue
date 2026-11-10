<template>
  <div class="app">
    <div class="map-wrap">
      <div id="map" aria-label="Merchant map"></div>
      <div class="topbar">
        <input
          v-model="query" class="search" type="search" placeholder="Search merchants…"
          aria-label="Search merchants by name" autocomplete="off"
          @keydown.enter="runNameSearch"
        />
        <button class="icon-btn" :disabled="searching" aria-label="Search" @click="runNameSearch">⌕</button>
        <button class="icon-btn" aria-label="Find merchants near me" title="Near me" @click="locate">◎</button>
        <button class="icon-btn" aria-label="About this map" title="About" @click="aboutOpen = true">?</button>
      </div>
      <ul v-if="results.length > 0" class="results" aria-label="Search results">
        <li v-for="m in results" :key="m.id">
          <button @click="flyToMerchant(m)">
            {{ m.name }}
            <span v-if="m.verifiedPastYear">✓</span>
            <span v-if="m.distanceM != null"> · {{ formatDistance(m.distanceM) }}</span>
          </button>
        </li>
      </ul>
      <div v-if="banner" class="banner" :class="{ error: banner.error }" role="status">
        <span>{{ banner.text }}</span>
        <button class="btn" @click="banner = null">Dismiss</button>
      </div>
    </div>

    <MerchantSheet
      v-if="sheetOpen"
      :merchant="selected" :loading="detailLoading" :error="detailError"
      :distance="selected && userPos ? formatDistance(haversineM(userPos.lat, userPos.lon, selected.lat, selected.lon)) : ''"
      @close="sheetOpen = false" @retry="reloadDetail" @pay="payMerchant = $event"
    />

    <PaySheet v-if="payMerchant" :merchant="payMerchant" @close="payMerchant = null" />
    <AboutPanel v-if="aboutOpen" @close="aboutOpen = false" />
  </div>
</template>

<script setup lang="ts">
import L from 'leaflet'
import { onMounted, onUnmounted, ref } from 'vue'
import AboutPanel from './components/AboutPanel.vue'
import MerchantSheet from './components/MerchantSheet.vue'
import PaySheet from './components/PaySheet.vue'
import { fetchSnapshot, syncPlacesPage } from './lib/btcmap'
import { createMap, markerFor } from './lib/map'
import { formatDistance, haversineM, normalizeBtcMapPlace, type Merchant } from './lib/merchant'
import { BtcMapSource } from './lib/sources'
import { deletePlaces, getAllCachedPlaces, getSyncAnchor, setSyncAnchor, upsertPlaces } from './lib/store'

const source = new BtcMapSource()
const MAX_PINS = 2000

let map: L.Map | null = null
let markers: L.LayerGroup | null = null
let searchAbort: AbortController | null = null
let moveTimer: ReturnType<typeof setTimeout> | null = null

const merchants = ref<Map<string, Merchant>>(new Map())
const results = ref<Merchant[]>([])
const query = ref('')
const searching = ref(false)
const userPos = ref<{ lat: number; lon: number } | null>(null)
const banner = ref<{ text: string; error: boolean } | null>(null)

const sheetOpen = ref(false)
const selected = ref<Merchant | null>(null)
const detailLoading = ref(false)
const detailError = ref<string | null>(null)
const payMerchant = ref<Merchant | null>(null)
const aboutOpen = ref(false)

onMounted(async () => {
  const el = document.getElementById('map')
  if (!el) return
  const handles = createMap(el)
  map = handles.map
  markers = handles.markers
  map.on('moveend', scheduleViewportSearch)
  await primeFromCache()
  void backgroundSync()
  locate()
})

onUnmounted(() => {
  if (moveTimer) clearTimeout(moveTimer)
  searchAbort?.abort()
  map?.remove()
})

function scheduleViewportSearch(): void {
  if (moveTimer) clearTimeout(moveTimer)
  moveTimer = setTimeout(() => void viewportSearch(), 500)
}

async function viewportSearch(): Promise<void> {
  if (!map) return
  const bounds = map.getBounds()
  const center = bounds.getCenter()
  const radiusKm = Math.min(50, Math.max(1, center.distanceTo(bounds.getNorthEast()) / 1000))
  if (map.getZoom() < 9) {
    renderPins() // zoomed out: cached pins only, no heavy query
    return
  }
  searchAbort?.abort()
  searchAbort = new AbortController()
  try {
    const found = await source.nearby(center.lat, center.lng, radiusKm, searchAbort.signal)
    for (const m of found) merchants.value.set(m.id, withDistance(m))
    renderPins()
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') return
    banner.value = { text: `Live search failed: ${messageOf(err)} Showing cached pins.`, error: true }
  }
}

async function runNameSearch(): Promise<void> {
  const q = query.value.trim()
  results.value = []
  if (q.length < 3) {
    banner.value = { text: 'Type at least 3 letters to search.', error: false }
    return
  }
  searching.value = true
  try {
    results.value = (await source.searchByName(q)).slice(0, 25).map(withDistance)
    if (results.value.length === 0) banner.value = { text: 'No merchants found.', error: false }
  } catch (err: unknown) {
    banner.value = { text: `Search failed: ${messageOf(err)}`, error: true }
  } finally {
    searching.value = false
  }
}

function flyToMerchant(m: Merchant): void {
  results.value = []
  map?.flyTo([m.lat, m.lon], 16)
  void selectMerchant(m)
}

function locate(): void {
  if (!('geolocation' in navigator)) {
    banner.value = { text: 'Geolocation is not available here. Search by name instead.', error: false }
    return
  }
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      userPos.value = { lat: pos.coords.latitude, lon: pos.coords.longitude }
      map?.flyTo([pos.coords.latitude, pos.coords.longitude], 14)
    },
    () => {
      banner.value = { text: 'Location blocked. Search by name or drag the map instead.', error: false }
    },
    { enableHighAccuracy: false, timeout: 8000 },
  )
}

async function selectMerchant(pin: Merchant): Promise<void> {
  selected.value = pin
  sheetOpen.value = true
  await reloadDetail()
}

async function reloadDetail(): Promise<void> {
  const current = selected.value
  if (!current) return
  const requestedId = current.id
  detailLoading.value = true
  detailError.value = null
  try {
    const full = await source.detail(requestedId)
    if (selected.value?.id !== requestedId) return // user tapped another pin
    if (full) {
      selected.value = withDistance(full)
      merchants.value.set(full.id, selected.value)
    }
  } catch (err: unknown) {
    detailError.value = messageOf(err)
  } finally {
    detailLoading.value = false
  }
}

function renderPins(): void {
  if (!map || !markers) return
  markers.clearLayers()
  const bounds = map.getBounds().pad(0.1)
  let count = 0
  for (const m of merchants.value.values()) {
    if (count >= MAX_PINS) break
    if (!bounds.contains([m.lat, m.lon])) continue
    const marker = L.marker([m.lat, m.lon], { icon: markerFor(m), title: m.name })
    marker.on('click', () => void selectMerchant(m))
    marker.addTo(markers)
    count++
  }
}

function withDistance(m: Merchant): Merchant {
  if (!userPos.value) return m
  return { ...m, distanceM: haversineM(userPos.value.lat, userPos.value.lon, m.lat, m.lon) }
}

// --- Client-side cache: instant pins, then incremental sync ---

async function primeFromCache(): Promise<void> {
  try {
    const cached = await getAllCachedPlaces()
    for (const p of cached) {
      const m = normalizeBtcMapPlace(p)
      if (m) merchants.value.set(m.id, withDistance(m))
    }
    renderPins()
  } catch {
    /* cache is best-effort; live search still works */
  }
}

async function backgroundSync(): Promise<void> {
  try {
    let anchor = await getSyncAnchor()
    if (!anchor) {
      const snap = await fetchSnapshot()
      await upsertPlaces(snap.places)
      for (const p of snap.places) {
        const m = normalizeBtcMapPlace(p)
        if (m && !merchants.value.has(m.id)) merchants.value.set(m.id, withDistance(m))
      }
      anchor = snap.lastModified ? new Date(snap.lastModified).toISOString() : new Date(0).toISOString()
      await setSyncAnchor(anchor)
      renderPins()
    }
    // Incremental pages until a short page (initial-block-download style).
    for (let page = 0; page < 20; page++) {
      const batch = await syncPlacesPage(anchor, { limit: 5000 })
      if (batch.length === 0) break
      const upserts = batch.filter((p) => !p['deleted_at'])
      const evictions = batch
        .filter((p) => p['deleted_at'])
        .map((p) => p['id'])
        .filter((id): id is number => typeof id === 'number')
      await upsertPlaces(upserts)
      if (evictions.length > 0) await deletePlaces(evictions)
      const maxUpdated = batch
        .map((p) => (typeof p['updated_at'] === 'string' ? p['updated_at'] : ''))
        .sort()
        .pop()
      if (maxUpdated) {
        anchor = maxUpdated
        await setSyncAnchor(anchor)
      }
      if (batch.length < 5000) break
    }
  } catch (err: unknown) {
    console.warn('Background sync failed (live search unaffected):', err)
  }
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : 'Unknown error'
}
</script>
