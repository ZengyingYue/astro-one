/** Shared names for the desktop Platform bridge. */
/** Private desktop channels; the Platform renderer receives bootstrap and locale updates. */
export const PLATFORM_IPC = {
  bootstrap: 'astro-one-platform:bootstrap',
  localeChanged: 'astro-one-platform:locale-changed',
  open: 'astro-one-platform:open',
  bounds: 'astro-one-platform:bounds',
  close: 'astro-one-platform:close',
} as const

/** Resolved Platform language; Desktop resolves the system preference before sending it. */
export type PlatformLocale = 'en_US' | 'zh_CN'
