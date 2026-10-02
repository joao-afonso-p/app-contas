import { describe, expect, it } from 'vitest'
import { isIosNonSafari, isMacOS, platformFromEnv } from './platform'

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1'
const CHROME_IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 CriOS/120.0 Mobile/15E148 Safari/604.1'
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36'
const MAC = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15'
const WIN = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36'

describe('platformFromEnv', () => {
  it('deteta iPhone, Android e desktop', () => {
    expect(platformFromEnv({ userAgent: IPHONE })).toBe('ios')
    expect(platformFromEnv({ userAgent: ANDROID })).toBe('android')
    expect(platformFromEnv({ userAgent: WIN, platform: 'Win32' })).toBe('desktop')
  })
  it('trata iPadOS (MacIntel com toque) como iOS', () => {
    expect(platformFromEnv({ userAgent: MAC, platform: 'MacIntel', maxTouchPoints: 5 })).toBe('ios')
    expect(platformFromEnv({ userAgent: MAC, platform: 'MacIntel', maxTouchPoints: 0 })).toBe('desktop')
  })
})

describe('isIosNonSafari', () => {
  it('distingue Chrome iOS de Safari', () => {
    expect(isIosNonSafari(CHROME_IOS)).toBe(true)
    expect(isIosNonSafari(IPHONE)).toBe(false)
  })
})

describe('isMacOS', () => {
  it('só é true em Mac desktop', () => {
    expect(isMacOS({ userAgent: MAC, platform: 'MacIntel', maxTouchPoints: 0 })).toBe(true)
    expect(isMacOS({ userAgent: MAC, platform: 'MacIntel', maxTouchPoints: 5 })).toBe(false)
    expect(isMacOS({ userAgent: WIN, platform: 'Win32' })).toBe(false)
  })
})
