<template>
  <div class="scrim" @click.self="$emit('close')" @keydown.escape="$emit('close')">
    <section class="modal" role="dialog" aria-modal="true" aria-label="Nimiq Pay Wallet">
      <div class="row spread">
        <h2>Nimiq Pay Wallet</h2>
        <button class="icon-btn" @click="$emit('close')" aria-label="Close wallet modal">✕</button>
      </div>

      <!-- State 1: Connected inside Nimiq Pay -->
      <div v-if="state.connected && state.activeAccount" class="wallet-connected">
        <div class="notice ok" role="status">
          <div class="row spread">
            <strong>🟢 Connected via Nimiq Pay</strong>
            <span class="badge on">{{ state.network?.toUpperCase() || 'MAINNET' }}</span>
          </div>
          <p class="muted">Real account connected with non-custodial Lightning swap capability.</p>
        </div>

        <div class="field">
          <label>Nimiq Account</label>
          <div class="copy-box">
            <code>{{ formatAddress(state.activeAccount) }}</code>
            <button class="btn small" @click="copyText(state.activeAccount, 'address')">
              {{ copiedField === 'address' ? '✓ Copied' : 'Copy' }}
            </button>
          </div>
        </div>

        <div class="field">
          <label>Live Balance</label>
          <div class="balance-display">
            <span class="balance-amount">{{ formattedBalance ?? '0.00 NIM' }}</span>
            <span v-if="state.fiat" class="fiat-badge">{{ state.fiat }}</span>
          </div>
          <p class="hint">Live on-chain balance fetched from your Nimiq Pay wallet.</p>
        </div>

        <div class="btn-row">
          <button class="btn" @click="detect">Refresh Balance</button>
          <button class="btn primary" @click="$emit('close')">Done</button>
        </div>
      </div>

      <!-- State 2: Not running inside Nimiq Pay -->
      <div v-else class="wallet-disconnected">
        <div class="notice" role="status">
          <strong>⚡ Connect with Nimiq Pay</strong>
          <p class="muted">
            To pay Bitcoin merchants with NIM or USDT, this Mini App must run inside the
            <strong>Nimiq Pay</strong> mobile container.
          </p>
        </div>

        <div class="actions-stack">
          <a :href="deepLink" class="btn pay full-width-link" target="_blank" rel="noopener">
            🚀 Open in Nimiq Pay App
          </a>

          <div class="field">
            <label>Mini App URL</label>
            <div class="copy-box">
              <input type="text" readonly :value="currentUrl" class="copy-input" />
              <button class="btn small" @click="copyText(currentUrl, 'url')">
                {{ copiedField === 'url' ? '✓ Copied' : 'Copy URL' }}
              </button>
            </div>
            <p class="hint">
              Open <strong>Nimiq Pay</strong> → <strong>Mini Apps</strong> → <strong>Custom URL</strong>, then paste this address.
            </p>
          </div>
        </div>

        <div class="guide-steps">
          <h3>How to connect:</h3>
          <ol>
            <li>Install & open <strong>Nimiq Pay</strong> on your mobile device.</li>
            <li>Tap the <strong>Open in Nimiq Pay</strong> button above (Universal Link).</li>
            <li>Alternatively, go to <strong>Mini Apps → Custom URL</strong> and paste the copied link.</li>
            <li>Your real NIM balance and Lightning payment rail will activate with zero mock data.</li>
          </ol>
        </div>

        <div class="btn-row">
          <button class="btn" :disabled="state.isChecking" @click="detect">
            {{ state.isChecking ? 'Checking…' : 'Re-check Connection' }}
          </button>
          <button class="btn primary" @click="$emit('close')">Close</button>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useNimiq } from '../lib/nimiq'

defineEmits<{ (e: 'close'): void }>()

const { state, formattedBalance, deepLink, detect, formatAddress } = useNimiq()

const copiedField = ref<'address' | 'url' | null>(null)
const currentUrl = computed(() => (typeof window !== 'undefined' ? window.location.href : ''))

async function copyText(text: string, field: 'address' | 'url'): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
    copiedField.value = field
    setTimeout(() => {
      if (copiedField.value === field) copiedField.value = null
    }, 2000)
  } catch {
    /* clipboard fallback */
  }
}
</script>
