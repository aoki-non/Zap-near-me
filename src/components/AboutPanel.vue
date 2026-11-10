<template>
  <div class="scrim" @click.self="$emit('close')" @keydown.escape="$emit('close')">
    <section class="modal" role="dialog" aria-modal="true" aria-label="About this map">
      <div class="row spread">
        <h2>About this map</h2>
        <button class="icon-btn" @click="$emit('close')" aria-label="Close about panel">✕</button>
      </div>
      <p>
        Merchant data comes from <a href="https://btcmap.org">BTC Map</a>, which builds
        it from OpenStreetMap tags such as <code>currency:XBT</code>.
      </p>
      <p>
        © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>
        contributors. The data is available under the
        <a href="https://opendatacommons.org/licenses/odbl/1-0/">Open Database License (ODbL)</a>.
      </p>
      <p class="muted">
        “Verified in the past year” means the place was surveyed within the trailing
        365 days. Verification is a community signal, not a guarantee — confirm with
        the merchant before paying.
      </p>
      <p class="muted">
        Payments are Bitcoin Lightning invoices settled through Nimiq Pay: you spend
        NIM or USDT, the merchant receives BTC. Mainnet only.
      </p>
      <div class="btn-row">
        <button class="btn primary" @click="$emit('close')">Done</button>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
defineEmits<{ (e: 'close'): void }>()
</script>
