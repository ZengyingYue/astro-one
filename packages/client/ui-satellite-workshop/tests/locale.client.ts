import { en, zh, type WorkshopLocaleKey } from '../src/client/locales.ts'
import type { Translate } from '../src/client/presentation.ts'

/** Build the translate function a rendered component receives for one dictionary. */
export function translate(dict: Record<WorkshopLocaleKey, string>): Translate {
  return (key, params) => Object.entries(params ?? {}).reduce(
    (text, [name, value]) => text.replaceAll(`{${name}}`, value),
    dict[key],
  )
}

export const tEn = translate(en)
export const tZh = translate(zh)
