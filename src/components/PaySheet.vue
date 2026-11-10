<template>
  <div class="scrim" @click.self="$emit('close')" @keydown.escape="$emit('close')">
    <section class="modal" role="dialog" aria-modal="true" :aria-label="`Pay ${merchant.name}`">
      <div class="row spread">
        <h2>Pay {{ merchant.name }}</h2>
        <button class="icon-btn" @click="$emit('close')" aria-label="Close payment">✕</button>
      </div>

      <!-- Live Wallet Connection Indicator -->
      <div v-if="state.connected && state.activeAccount" class="wallet-pill-row">
        <span class="badge on">
          🟢 Nimiq Pay: {{ shortAddress }} ({{ formattedBalance ?? 'Connected' }})
        </span>
      </div>
      <div v-else class="notice" role="status">
        <div class="row spread">
          <strong>⚡ Nimiq Pay Required</strong>
          <span class="badge">{{ state.isChecking ? 'Checking…' : 'Browser Mode' }}</span>
        </div>
        <p class="muted">
          To pay this merchant using NIM or USDT over Lightning, launch this Mini App inside
          <strong>Nimiq Pay</strong>. Real on-chain and Lightning rails only.
        </p>
        <div class="btn-row" style="margin-top: 8px;">
          <a :href="deepLink" class="btn pay" style="text-align: center; text-decoration: none;" target="_blank" rel="noopener">
            🚀 Open in Nimiq Pay App
          </a>
        </div>
      </div>

      <div v-if="phase === 'done' && result" class="notice ok" role="status">
        <strong>Payment submitted — awaiting settlement.</strong>
        <p class="muted">
          Nimiq Pay sent the spending transaction. This does not yet mean the merchant
          received BTC — keep this screen until they confirm.
        </p>
        <p>Tx hash: <code>{{ result.hash }}</code></p>
        <p>Swap ID: <code>{{ result.swapId }}</code></p>
      </div>

      <div v-if="phase === 'failed' && failure" class="notice error" role="alert">
        <strong>{{ failureTitle }}</strong>
        <p>{{ failure.message }}</p>
        <p v-if="failure.hash">Tx hash: <code>{{ failure.hash }}</code></p>
        <p v-if="failure.swapId">Swap ID: <code>{{ failure.swapId }}</code></p>
        <div v-if="failure.kind === 'not-in-pay'" style="margin-top: 10px;">
          <a :href="deepLink" class="btn pay" style="display: block; text-align: center; text-decoration: none;" target="_blank" rel="noopener">
            🚀 Open in Nimiq Pay
          </a>
        </div>
      </div>

      <div v-if="phase === 'edit' || phase === 'failed'">
        <div class="tabs" role="tablist" aria-label="Payment method">
          <button role="tab" :aria-selected="tab === 'invoice'" @click="tab = 'invoice'">
            Till invoice
          </button>
          <button role="tab" :aria-selected="tab === 'address'" @click="tab = 'address'">
            Lightning Address
          </button>
        </div>

        <div v-if="tab === 'invoice'" class="field">
          <label for="pay-invoice">Lightning invoice from the till</label>
          <textarea
            id="pay-invoice" ref="invoiceField" v-model="invoiceInput" autocomplete="off"
            spellcheck="false" placeholder="lnbc…" aria-describedby="invoice-hint"
          />
          <p id="invoice-hint" class="hint">Paste the BOLT11 invoice the merchant shows you. Mainnet only.</p>
          <p v-if="inputError" class="error-text" role="alert">{{ inputError }}</p>
        </div>

        <div v-if="tab === 'address'">
          <div class="field">
            <label for="pay-address">Merchant Lightning Address</label>
            <input
              id="pay-address" ref="addressField" v-model="addressInput" type="text"
              autocomplete="off" spellcheck="false" inputmode="email" placeholder="shop@example.com"
            />
            <p v-if="!merchant.lightningAddress" class="hint">
              Few merchants publish one — ask the shop or use the till invoice instead.
            </p>
          </div>
          <div class="field">
            <label for="pay-amount">Amount (sats)</label>
            <input
              id="pay-amount" v-model="satsInput" type="number" min="1" step="1"
              inputmode="numeric" autocomplete="off" placeholder="2100"
            />
          </div>
          <p v-if="inputError" class="error-text" role="alert">{{ inputError }}</p>
        </div>

        <div class="btn-row">
          <button class="btn" @click="$emit('close')">Cancel</button>
          <button class="btn pay" :disabled="busy" @click="onPrimary">
            {{ primaryLabel }}
          </button>
        </div>
        <p class="muted">You spend NIM or USDT in Nimiq Pay; the merchant receives BTC. You approve the swap in Nimiq Pay.</p>
      </div>

      <div v-if="phase === 'review' && resolved" class="notice" role="status">
        <strong>Confirm {{ resolved.amountSats.toLocaleString() }} sats</strong>
        <p v-if="resolved.description">{{ resolved.description }}</p>
        <p class="muted">Invoice fetched from {{ addressInput }}. Paying submits the swap in Nimiq Pay.</p>
        <div class="btn-row">
          <button class="btn" :disabled="busy" @click="phase = 'edit'">Back</button>
          <button class="btn pay" :disabled="busy" @click="submitPay(resolved.invoice)">Pay now</button>
        </div>
      </div>

      <div v-if="phase === 'paying'" class="notice" role="status">
        <strong>{{ busyLabel }}</strong>
        <p class="muted">Approve the payment in the Nimiq Pay dialogs.</p>
      </div>

      <div v-if="phase === 'done'" class="btn-row">
        <button class="btn primary" @click="$emit('close')">Done</button>
      </div>
    </section>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, ref } from 'vue'
import type { Merchant } from '../lib/merchant'
import { isMainnetBolt11, parsePaymentInput, resolveToInvoice, type ResolvedInvoice } from '../lib/lnurl'
import { payInvoice, toPayFailure, type PayFailure, type SubmittedPayment } from '../lib/pay'
import { useNimiq } from '../lib/nimiq'

const props = defineProps<{ merchant: Merchant }>()
defineEmits<{ (e: 'close'): void }>()

const { state, shortAddress, formattedBalance, deepLink } = useNimiq()

type Phase = 'edit' | 'review' | 'paying' | 'done' | 'failed'

const tab = ref<'invoice' | 'address'>(props.merchant.lightningAddress ? 'address' : 'invoice')
const phase = ref<Phase>('edit')
const busy = ref(false)
const busyLabel = ref('')
const invoiceInput = ref('')
const addressInput = ref(props.merchant.lightningAddress ?? '')
const satsInput = ref('')
const inputError = ref('')
const resolved = ref<ResolvedInvoice | null>(null)
const result = ref<SubmittedPayment | null>(null)
const failure = ref<PayFailure | null>(null)
const invoiceField = ref<HTMLTextAreaElement | null>(null)
const addressField = ref<HTMLInputElement | null>(null)

const primaryLabel = computed(() =>
  busy.value ? 'Working…' : tab.value === 'invoice' ? 'Pay invoice' : 'Get invoice',
)

const failureTitle = computed(() => {
  switch (failure.value?.kind) {
    case 'duplicate': return 'Already paid or in progress'
    case 'unknown-outcome': return 'Outcome unclear — do not retry yet'
    case 'not-in-pay': return 'Open in Nimiq Pay'
    default: return 'Payment failed'
  }
})

onMounted(() => {
  nextTick(() => {
    if (tab.value === 'invoice') invoiceField.value?.focus()
    else addressField.value?.focus()
  })
})

async function onPrimary(): Promise<void> {
  inputError.value = ''
  failure.value = null
  if (tab.value === 'invoice') {
    const parsed = parsePaymentInput(invoiceInput.value)
    if (parsed.kind !== 'bolt11') {
      inputError.value = 'That is not a Lightning invoice. Paste the lnbc… string from the till.'
      return
    }
    if (!isMainnetBolt11(parsed.invoice)) {
      inputError.value = 'Testnet invoices are not supported (mainnet only).'
      return
    }
    await submitPay(parsed.invoice)
    return
  }
  const parsed = parsePaymentInput(addressInput.value)
  if (parsed.kind !== 'lightning-address' && parsed.kind !== 'lnurl') {
    inputError.value = 'Enter a Lightning Address like shop@example.com, or an lnurl string.'
    return
  }
  const sats = Number(satsInput.value)
  if (!Number.isInteger(sats) || sats <= 0) {
    inputError.value = 'Enter an amount in sats.'
    return
  }
  busy.value = true
  busyLabel.value = 'Fetching an invoice from the merchant…'
  phase.value = 'paying'
  try {
    resolved.value = await resolveToInvoice(parsed, sats)
    phase.value = 'review'
  } catch (err: unknown) {
    failure.value = toPayFailure(err)
    phase.value = 'failed'
  } finally {
    busy.value = false
  }
}

async function submitPay(invoice: string): Promise<void> {
  busy.value = true
  busyLabel.value = 'Submitting payment…'
  phase.value = 'paying'
  try {
    result.value = await payInvoice(invoice)
    phase.value = 'done'
  } catch (err: unknown) {
    failure.value = toPayFailure(err)
    phase.value = 'failed'
  } finally {
    busy.value = false
  }
}
</script>
