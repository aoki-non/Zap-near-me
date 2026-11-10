import { describe, expect, it } from 'vitest'
import { bech32Decode, isMainnetBolt11, parsePaymentInput } from './lnurl'

describe('parsePaymentInput', () => {
  it('detects BOLT11 invoices, incl. lightning: URIs', () => {
    const invoice = 'lnbc2100n1pj mornings are fake'.replace(/ /g, '')
    expect(parsePaymentInput(invoice)).toMatchObject({ kind: 'bolt11' })
    expect(parsePaymentInput(`lightning:${invoice}`)).toMatchObject({ kind: 'bolt11', invoice })
  })
  it('detects Lightning Addresses and normalizes case', () => {
    const parsed = parsePaymentInput('Shop@Example.COM')
    expect(parsed).toMatchObject({ kind: 'lightning-address', user: 'Shop', domain: 'example.com' })
  })
  it('rejects bad LNURL checksums and garbage as unknown', () => {
    expect(parsePaymentInput('lnurl1dp68gurn8ghj7mr0vdskc6r0wd6z7mrww4exctthd9').kind).toBe('unknown')
    expect(parsePaymentInput('not a payment input').kind).toBe('unknown')
    expect(parsePaymentInput('').kind).toBe('unknown')
  })
})

describe('bech32Decode', () => {
  // Valid/invalid vectors transcribed from BIP-173's test-vectors appendix.
  it('decodes valid strings', () => {
    expect(bech32Decode('abcdef1qpzry9x8gf2tvdw0s3jn54khce6mua7lmqqqxw').hrp).toBe('abcdef')
    expect(bech32Decode('A12UEL5L').hrp).toBe('a')
    expect(bech32Decode('split1checkupstagehandshakeupstreamerranterredcaperred2y9e3w').hrp).toBe('split')
  })
  it('rejects bad checksums and mixed case', () => {
    expect(() => bech32Decode('abcdef1qpzry9x8gf2tvdw0s3jn54khce6mua7lmqqqxx')).toThrow()
    expect(() => bech32Decode('A12uel5L')).toThrow()
  })
})

describe('isMainnetBolt11', () => {
  it('accepts lnbc and rejects testnet prefixes', () => {
    expect(isMainnetBolt11('lnbc1234')).toBe(true)
    expect(isMainnetBolt11('LNBC1234')).toBe(true)
    expect(isMainnetBolt11('lntb1234')).toBe(false)
    expect(isMainnetBolt11('lnbcrt1234')).toBe(false)
  })
})
