// Nimiq Pay integration: connection state, live accounts, real balances,
// and deep linking to launch the Mini App inside the Nimiq Pay container.
// All payments and balances use the real @nimiq/mini-app-sdk (no simulated data).

import {
  init,
  getHostFiat,
  getHostLanguage,
  getHostNetwork,
  type NimiqProvider,
} from '@nimiq/mini-app-sdk'
import { computed, reactive, readonly } from 'vue'
import { getProvider } from './pay'

export interface NimiqState {
  isDetected: boolean
  isChecking: boolean
  connected: boolean
  activeAccount: string | null
  balanceNim: number | null
  network: string | null
  fiat: string | null
  language: string | null
  error: string | null
}

const state = reactive<NimiqState>({
  isDetected: false,
  isChecking: true,
  connected: false,
  activeAccount: null,
  balanceNim: null,
  network: null,
  fiat: null,
  language: null,
  error: null,
})

let initPromise: Promise<NimiqProvider | null> | null = null

/**
 * Generate a Nimiq Pay universal link to open this Mini App directly
 * inside the Nimiq Pay mobile app.
 * Format: https://nimpay.app/miniapps/open/<domain-or-host>/<path>
 */
export function getNimiqPayDeepLink(customUrl?: string): string {
  if (customUrl) {
    const clean = customUrl.replace(/^https?:\/\//i, '').replace(/\/+$/, '')
    return `https://nimpay.app/miniapps/open/${clean}`
  }
  if (typeof window === 'undefined') return 'https://nimpay.app/miniapps/open/'
  const host = window.location.host
  const path = window.location.pathname.replace(/^\/+/, '')
  const target = path ? `${host}/${path}` : host
  return `https://nimpay.app/miniapps/open/${target}`
}

/**
 * Format a Nimiq address into human-readable 4-character blocks,
 * or truncated for compact display.
 */
export function formatAddress(address: string, compact = false): string {
  const clean = address.replace(/\s+/g, '').toUpperCase()
  if (!clean) return ''
  if (compact) {
    if (clean.length <= 10) return clean
    return `${clean.slice(0, 4)}…${clean.slice(-4)}`
  }
  return clean.replace(/(.{4})/g, '$1 ').trim()
}

/**
 * Convert Lunas (Nimiq's smallest unit) to NIM.
 * 100,000 Lunas = 1 NIM.
 */
export function lunaToNim(luna: number): number {
  return luna / 100000
}

/**
 * Initialize or check the real Nimiq Pay provider.
 * Runs with a short timeout so non-Nimiq environments don't hang.
 */
export async function detectNimiqPay(): Promise<NimiqProvider | null> {
  if (initPromise) return initPromise

  state.isChecking = true
  state.error = null

  initPromise = (async () => {
    try {
      // 1. Check if window.nimiq is injected
      const provider = await init({ timeout: 2000 })
      state.isDetected = true
      state.network = getHostNetwork() || 'mainnet'
      state.fiat = getHostFiat() || 'USD'
      state.language = getHostLanguage() || 'en'

      // 2. Fetch real accounts from Nimiq Pay
      await refreshAccounts(provider)

      // 3. Listen for account switches inside Nimiq Pay
      provider.on('accountsChanged', (accounts: string[]) => {
        handleAccountsChanged(provider, accounts)
      })

      return provider
    } catch (err: unknown) {
      state.isDetected = false
      state.connected = false
      state.activeAccount = null
      state.balanceNim = null
      return null
    } finally {
      state.isChecking = false
    }
  })()

  return initPromise
}

async function refreshAccounts(provider: NimiqProvider): Promise<void> {
  try {
    const rawAccounts = await provider.listAccounts()
    const accounts = Array.isArray(rawAccounts) ? (rawAccounts as string[]) : []

    if (accounts.length > 0) {
      state.connected = true
      state.activeAccount = accounts[0]
      await refreshBalance(provider, state.activeAccount)
    } else {
      state.connected = false
      state.activeAccount = null
      state.balanceNim = null
    }
  } catch (err: unknown) {
    state.error = err instanceof Error ? err.message : 'Failed to list accounts'
  }
}

async function refreshBalance(provider: NimiqProvider, address: string): Promise<void> {
  try {
    const balanceLuna = await provider.getBalance(address)
    if (typeof balanceLuna === 'number') {
      state.balanceNim = lunaToNim(balanceLuna)
    }
  } catch (err: unknown) {
    console.warn('Could not fetch Nimiq balance:', err)
  }
}

function handleAccountsChanged(provider: NimiqProvider, accounts: string[]): void {
  if (accounts.length > 0) {
    state.connected = true
    state.activeAccount = accounts[0]
    void refreshBalance(provider, state.activeAccount)
  } else {
    state.connected = false
    state.activeAccount = null
    state.balanceNim = null
  }
}

/**
 * Manually request to connect/re-check Nimiq Pay provider.
 */
export async function connectNimiq(): Promise<boolean> {
  initPromise = null
  const provider = await detectNimiqPay()
  if (provider && !state.activeAccount) {
    try {
      await provider.connect()
      await refreshAccounts(provider)
    } catch {
      // Connect might fail if user denies
    }
  }
  return state.connected
}

/**
 * Composable providing reactive Nimiq Pay status.
 */
export function useNimiq() {
  const shortAddress = computed(() =>
    state.activeAccount ? formatAddress(state.activeAccount, true) : null,
  )

  const formattedBalance = computed(() => {
    if (state.balanceNim == null) return null
    return `${state.balanceNim.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    })} NIM`
  })

  return {
    state: readonly(state),
    shortAddress,
    formattedBalance,
    deepLink: computed(() => getNimiqPayDeepLink()),
    detect: detectNimiqPay,
    connect: connectNimiq,
    formatAddress,
  }
}
