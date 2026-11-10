<template>
  <div class="scrim" @click.self="$emit('close')" @keydown.escape="$emit('close')">
    <section class="modal" role="dialog" aria-modal="true" aria-label="About Zap Near Me">
      <div class="sheet-handle mobile-only" aria-hidden="true"></div>
      <div class="row spread brand-row">
        <div class="brand-header">
          <img src="/thumbnail-240.png" alt="Zap Near Me logo" class="brand-logo" width="44" height="44" />
          <div>
            <h2 class="brand-title">Zap Near Me</h2>
            <span class="brand-subtitle">⚡ Nimiq Pay Mini App</span>
          </div>
        </div>
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
