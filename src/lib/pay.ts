// Nimiq Pay provider wrapper. All Lightning payments go through
// payLightningInvoice(): the user spends NIM/USDT, the merchant gets BTC.
// Docs: https://nimiq.dev/mini-apps/features/bitcoin-lightning-payments

import { init, NimiqProviderError } from '@nimiq/mini-app-sdk'

type NimiqProvider = Awaited<ReturnType<typeof init>>

let providerPromise: Promise<NimiqProvider> | null = null

export function resetProviderForTests(): void {
  providerPromise = null
}

/**
 * Cached provider. Rejects with a friendly Error outside Nimiq Pay (init()
 * times out when no provider is injected), so the map still works on desktop.
 */
export function getProvider(): Promise<NimiqProvider> {
  if (!providerPromise) {
    providerPromise = init().catch((err: unknown) => {
      providerPromise = null
      throw new Error(
        'Nimiq Pay not detected. Open this Mini App inside Nimiq Pay to pay.',
        { cause: err },
      )
    })
  }
  return providerPromise
}

export interface SubmittedPayment {
  hash: string
  swapId: string
  invoice: string
}

export type PayFailureKind =
  | 'duplicate'
  | 'unknown-outcome'
  | 'not-in-pay'
  | 'error'

export interface PayFailure {
  kind: PayFailureKind
  message: string
  hash?: string
  swapId?: string
}

/**
 * Pay a fixed-amount BOLT11 invoice. Resolved = spending tx SUBMITTED, not
 * settled — the merchant backend confirms Lightning settlement. Never
 * auto-retry: duplicates and unknown outcomes need a merchant-side check.
 */
export async function payInvoice(invoice: string): Promise<SubmittedPayment> {
  const nimiq = await getProvider()
  try {
    const { hash, swapId } = await nimiq.payLightningInvoice({ invoice })
    return { hash, swapId, invoice }
  } catch (err: unknown) {
    throw toPayFailure(err)
  }
}

export function toPayFailure(err: unknown): PayFailure {
  if (err instanceof Error && err.message.includes('Nimiq Pay not detected')) {
    return { kind: 'not-in-pay', message: err.message }
  }
  if (NimiqProviderError.is(err)) {
    const { type, data } = err as { type?: unknown; data?: unknown }
    const ids =
      typeof data === 'object' && data !== null
        ? {
            hash: typeof (data as { hash?: unknown }).hash === 'string' ? ((data as { hash: string }).hash) : undefined,
            swapId: typeof (data as { swapId?: unknown }).swapId === 'string' ? ((data as { swapId: string }).swapId) : undefined,
          }
        : {}
    if (type === 'DUPLICATE_PAYMENT') {
      return {
        kind: 'duplicate',
        message:
          'This invoice was already paid or is being paid. Ask the merchant for the payment status before trying a new invoice.',
        ...ids,
      }
    }
    if (type === 'TRANSACTION_OUTCOME_UNKNOWN') {
      return {
        kind: 'unknown-outcome',
        message:
          'Nimiq Pay could not confirm whether the payment was submitted. Check with the merchant before paying again.',
        ...ids,
      }
    }
    return { kind: 'error', message: (err as Error).message || `Payment failed (${String(type)})`, ...ids }
  }
  return { kind: 'error', message: err instanceof Error ? err.message : 'Payment failed' }
}
