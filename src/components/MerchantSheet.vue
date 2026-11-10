<template>
  <section class="sheet" aria-label="Merchant details">
    <div v-if="loading">
      <h2>Loading merchant…</h2>
      <p class="meta">Fetching details from BTC Map.</p>
    </div>
    <div v-else-if="error">
      <h2>Merchant unavailable</h2>
      <p class="meta">{{ error }}</p>
      <div class="btn-row">
        <button class="btn" @click="$emit('retry')">Retry</button>
        <button class="btn" @click="$emit('close')">Close</button>
      </div>
    </div>
    <div v-else-if="merchant">
      <div class="row spread">
        <h2>{{ merchant.name }}</h2>
        <button class="icon-btn" @click="$emit('close')" aria-label="Close merchant details">✕</button>
      </div>
      <p class="meta">
        <span v-if="merchant.verifiedPastYear" class="badge on">Verified in the past year</span>
        <span v-else class="badge off">Not recently verified</span>
        <span v-if="distance"> · {{ distance }}</span>
        <span v-if="merchant.boosted"> · Boosted</span>
      </p>
      <div class="row" aria-label="Accepted payment methods">
        <span class="badge" :class="payClass(merchant.acceptsLightning)">
          Lightning{{ paySuffix(merchant.acceptsLightning) }}
        </span>
        <span class="badge" :class="payClass(merchant.acceptsOnchain)">
          On-chain{{ paySuffix(merchant.acceptsOnchain) }}
        </span>
        <span class="badge" :class="payClass(merchant.acceptsContactless)">
          Contactless{{ paySuffix(merchant.acceptsContactless) }}
        </span>
      </div>
      <p v-if="merchant.address" class="meta">{{ merchant.address }}</p>
      <p v-if="merchant.description">{{ merchant.description }}</p>
      <p v-if="merchant.openingHours" class="meta">Hours: {{ merchant.openingHours }}</p>
      <p v-if="merchant.lightningAddress" class="meta">Lightning Address: {{ merchant.lightningAddress }}</p>
      <div class="links">
        <a v-if="merchant.website" :href="merchant.website" target="_blank" rel="noopener">Website</a>
        <a v-if="merchant.phone" :href="`tel:${merchant.phone}`">Call</a>
        <a v-if="merchant.osmUrl" :href="merchant.osmUrl" target="_blank" rel="noopener">OpenStreetMap</a>
        <a :href="merchant.sourceUrl" target="_blank" rel="noopener">BTC Map</a>
      </div>
      <div class="btn-row">
        <button class="btn pay" @click="$emit('pay', merchant)">Pay this merchant</button>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import type { Merchant } from '../lib/merchant'

defineProps<{ merchant: Merchant | null; loading: boolean; error: string | null; distance: string }>()
defineEmits<{ (e: 'close'): void; (e: 'retry'): void; (e: 'pay', m: Merchant): void }>()

function payClass(v: boolean | null): string {
  return v === true ? 'on' : v === false ? 'off' : ''
}
function paySuffix(v: boolean | null): string {
  return v === true ? ' ✓' : v === false ? ' ✕' : ' ?'
}
</script>
