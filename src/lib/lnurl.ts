// Lightning payment-input handling: BOLT11 invoices, Lightning Addresses and
// LNURL strings. Resolves address/LNURL via LNURL-pay to a fixed-amount invoice
// that can be passed to Nimiq Pay's payLightningInvoice().

export type PaymentInput =
  | { kind: 'bolt11'; invoice: string }
  | { kind: 'lightning-address'; address: string; user: string; domain: string }
  | { kind: 'lnurl'; url: string }
  | { kind: 'unknown'; raw: string }

const BOLT11_RE = /^(lnbc|lntb|lnbcrt)[a-z0-9]+$/i
const ADDRESS_RE = /^([^@\s]+)@([^@\s]+\.[^@\s]+)$/

/** Classify raw user input (also strips `lightning:` URI prefixes). */
export function parsePaymentInput(raw: string): PaymentInput {
  const input = raw.trim().replace(/^lightning:/i, '')
  if (BOLT11_RE.test(input)) return { kind: 'bolt11', invoice: input }
  const addr = ADDRESS_RE.exec(input)
  if (addr) return { kind: 'lightning-address', address: input.toLowerCase(), user: addr[1], domain: addr[2].toLowerCase() }
  if (input.toLowerCase().startsWith('lnurl1')) {
    try {
      return { kind: 'lnurl', url: bech32DecodeUrl(input) }
    } catch {
      return { kind: 'unknown', raw: input }
    }
  }
  return { kind: 'unknown', raw: input }
}

/** Mainnet-only guard: Nimiq Pay swaps fail on testnet invoices. */
export function isMainnetBolt11(invoice: string): boolean {
  const s = invoice.toLowerCase()
  // 'lnbcrt' (regtest) starts with 'lnbc', so exclude it explicitly.
  return s.startsWith('lnbc') && !s.startsWith('lnbcrt')
}

// --- Minimal bech32 decoder (BIP-173) for LNURL strings. ---

const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l'

export function bech32Decode(input: string): { hrp: string; data: number[] } {
  const s = input.trim()
  if (s.length < 8 || s.length > 2000) throw new Error('Invalid bech32 length')
  if (s !== s.toLowerCase() && s !== s.toUpperCase()) throw new Error('Mixed-case bech32')
  const lower = s.toLowerCase()
  const sep = lower.lastIndexOf('1')
  if (sep < 1 || sep + 7 > lower.length) throw new Error('Invalid bech32 separator')
  const hrp = lower.slice(0, sep)
  const data: number[] = []
  for (const ch of lower.slice(sep + 1)) {
    const v = CHARSET.indexOf(ch)
    if (v === -1) throw new Error('Invalid bech32 character')
    data.push(v)
  }
  if (!verifyChecksum(hrp, data)) throw new Error('Invalid bech32 checksum')
  return { hrp, data: data.slice(0, -6) }
}

function hrpExpand(hrp: string): number[] {
  const out: number[] = []
  for (const c of hrp) out.push(c.charCodeAt(0) >> 5)
  out.push(0)
  for (const c of hrp) out.push(c.charCodeAt(0) & 31)
  return out
}

function polymod(values: number[]): number {
  const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3]
  let chk = 1
  for (const v of values) {
    const b = chk >> 25
    chk = ((chk & 0x1ffffff) << 5) ^ v
    for (let i = 0; i < 5; i++) if ((b >> i) & 1) chk ^= GEN[i]
  }
  return chk
}

function verifyChecksum(hrp: string, data: number[]): boolean {
  return polymod([...hrpExpand(hrp), ...data]) === 1
}

function convertBits(data: number[], from: number, to: number, pad: boolean): number[] {
  let acc = 0
  let bits = 0
  const out: number[] = []
  const maxv = (1 << to) - 1
  for (const v of data) {
    acc = (acc << from) | v
    bits += from
    while (bits >= to) {
      bits -= to
      out.push((acc >> bits) & maxv)
    }
  }
  if (pad) {
    if (bits > 0) out.push((acc << (to - bits)) & maxv)
  } else if (bits >= from || ((acc << (to - bits)) & maxv)) {
    throw new Error('Invalid bech32 padding')
  }
  return out
}

function bech32DecodeUrl(lnurl: string): string {
  const { hrp, data } = bech32Decode(lnurl)
  if (hrp !== 'lnurl') throw new Error('Not an LNURL string')
  const bytes = convertBits(data, 5, 8, false)
  const url = new TextDecoder().decode(new Uint8Array(bytes))
  if (!/^https:\/\//i.test(url)) throw new Error('LNURL did not resolve to an HTTPS URL')
  return url
}

// --- LNURL-pay (LUD-06 / LUD-16) ---

interface LnurlPayParams {
  callback: string
  minSendable: number
  maxSendable: number
  metadata: string
  tag: string
}

async function fetchLnurlPayParams(url: string, signal?: AbortSignal): Promise<LnurlPayParams> {
  const res = await fetch(url, { signal, headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`LNURL endpoint failed (${res.status})`)
  const body = (await res.json()) as Record<string, unknown> & { status?: string; reason?: string }
  if (body.status === 'ERROR') throw new Error(typeof body.reason === 'string' ? body.reason : 'LNURL error')
  if (body.tag !== 'payRequest' || typeof body.callback !== 'string') {
    throw new Error('Not a Lightning Address that accepts payments')
  }
  return body as unknown as LnurlPayParams
}

export interface ResolvedInvoice {
  invoice: string
  amountSats: number
  description?: string
}

/**
 * Resolve a Lightning Address (or raw LNURL-pay URL) to a fixed-amount BOLT11
 * invoice by requesting `amountSats` from the recipient's callback.
 */
export async function resolveToInvoice(
  target: { kind: 'lightning-address'; user: string; domain: string } | { kind: 'lnurl'; url: string },
  amountSats: number,
  signal?: AbortSignal,
): Promise<ResolvedInvoice> {
  if (!Number.isInteger(amountSats) || amountSats <= 0) throw new Error('Enter an amount in sats')
  const msats = amountSats * 1000
  const endpoint =
    target.kind === 'lnurl' ? target.url : `https://${target.domain}/.well-known/lnurlp/${encodeURIComponent(target.user)}`
  const params = await fetchLnurlPayParams(endpoint, signal)
  if (msats < params.minSendable || msats > params.maxSendable) {
    throw new Error(`Amount must be between ${Math.ceil(params.minSendable / 1000)} and ${Math.floor(params.maxSendable / 1000)} sats`)
  }
  const sep = params.callback.includes('?') ? '&' : '?'
  const res = await fetch(`${params.callback}${sep}amount=${msats}`, { signal, headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`Recipient wallet failed (${res.status})`)
  const body = (await res.json()) as { pr?: unknown; status?: string; reason?: string }
  if (body.status === 'ERROR' || typeof body.pr !== 'string' || !BOLT11_RE.test(body.pr)) {
    throw new Error(typeof body.reason === 'string' ? body.reason : 'Recipient did not return an invoice')
  }
  if (!isMainnetBolt11(body.pr)) throw new Error('Testnet invoices are not supported (mainnet only)')
  let description: string | undefined
  try {
    const meta = JSON.parse(params.metadata) as Array<[string, string]>
    description = meta.find((e) => e[0] === 'text/plain')?.[1]
  } catch {
    /* metadata is optional display text */
  }
  return { invoice: body.pr, amountSats, description }
}
