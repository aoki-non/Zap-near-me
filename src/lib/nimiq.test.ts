import { describe, expect, it } from 'vitest'
import { formatAddress, getNimiqPayDeepLink, lunaToNim } from './nimiq'

describe('formatAddress', () => {
  it('formats Nimiq address with spaces in 4-character blocks', () => {
    const raw = 'NQ0700000000000000000000000000000000'
    expect(formatAddress(raw)).toBe('NQ07 0000 0000 0000 0000 0000 0000 0000 0000')
  })

  it('formats compact address for header pills', () => {
    const raw = 'NQ25B68HND6NP8F6EF3S3V8NKNDL62G3X489'
    expect(formatAddress(raw, true)).toBe('NQ25…X489')
  })

  it('handles empty string gracefully', () => {
    expect(formatAddress('')).toBe('')
  })
})

describe('lunaToNim', () => {
  it('correctly converts Lunas to NIM (100,000 Luna = 1 NIM)', () => {
    expect(lunaToNim(100000)).toBe(1)
    expect(lunaToNim(250000000)).toBe(2500)
    expect(lunaToNim(50000)).toBe(0.5)
  })
})

describe('getNimiqPayDeepLink', () => {
  it('generates nimpay.app deep link from custom URL', () => {
    const link = getNimiqPayDeepLink('https://example.com/zap')
    expect(link).toBe('https://nimpay.app/miniapps/open/example.com/zap')
  })

  it('generates default nimpay.app deep link prefix', () => {
    const link = getNimiqPayDeepLink()
    expect(link).toContain('https://nimpay.app/miniapps/open/')
  })
})
