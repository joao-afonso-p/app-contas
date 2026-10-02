export type Platform = 'ios' | 'android' | 'desktop'

export interface PlatformEnv {
  userAgent: string
  platform?: string
  maxTouchPoints?: number
}

export function platformFromEnv(env: PlatformEnv): Platform {
  const ua = env.userAgent
  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios'
  // iPadOS 13+ apresenta-se como Mac.
  if (env.platform === 'MacIntel' && (env.maxTouchPoints ?? 0) > 1) return 'ios'
  if (/Android/i.test(ua)) return 'android'
  return 'desktop'
}

// Browsers de terceiros no iOS (Chrome, Firefox, Edge) — também têm Partilhar → Ecrã principal desde o iOS 16.4.
export function isIosNonSafari(userAgent: string): boolean {
  return /CriOS|FxiOS|EdgiOS|OPiOS/i.test(userAgent)
}

export function isMacOS(env: PlatformEnv): boolean {
  if (platformFromEnv(env) !== 'desktop') return false
  return /Mac/i.test(env.platform ?? '') || /Macintosh|Mac OS X/i.test(env.userAgent)
}

function currentEnv(): PlatformEnv {
  if (typeof navigator === 'undefined') return { userAgent: '' }
  return {
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    maxTouchPoints: navigator.maxTouchPoints,
  }
}

export function detectPlatform(): Platform {
  return platformFromEnv(currentEnv())
}

export function detectIosNonSafari(): boolean {
  return detectPlatform() === 'ios' && isIosNonSafari(currentEnv().userAgent)
}

export function detectMac(): boolean {
  return isMacOS(currentEnv())
}

export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  )
}
