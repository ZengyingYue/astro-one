/** Sidebar shell style contracts shared with its slot-owned controls. */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const css = readFileSync(fileURLToPath(new URL('../src/client/SidebarRoot.module.css', import.meta.url)), 'utf8')

/**
 * Declarations of one exact selector, keyed by property.
 * @param selector - exact selector text.
 * @returns the normalized declarations, or undefined when absent.
 */
function declarations(selector: string): Map<string, string> | undefined {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, ' ')
  for (const [, selectorList = '', body = ''] of withoutComments.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (!selectorList.split(',').map(value => value.trim()).includes(selector)) continue
    const found = new Map<string, string>()
    for (const part of body.split(';')) {
      const colon = part.indexOf(':')
      if (colon === -1) continue
      found.set(part.slice(0, colon).trim(), part.slice(colon + 1).trim().replace(/\s+/g, ' '))
    }
    return found
  }
  return undefined
}

describe('SidebarRoot.module.css', () => {
  it('uses a compact navigation gap', () => {
    expect(declarations('.panelList')?.get('gap')).toBe('2px')
  })

  it('fits navigation into 32px rows', () => {
    const row = declarations('.panelRow')
    expect(row?.get('min-height')).toBe('32px')
    expect(row?.get('padding')).toBe('5px calc(var(--astro-one-sidebar-row-padding) - var(--astro-one-sidebar-paint-inset))')
    expect(row?.get('line-height')).toBe('22px')
    expect(row?.get('box-sizing')).toBe('border-box')
    expect(row?.get('border')).toBe('none')
  })

  it('owns a shared scrollport whose gaps scroll away', () => {
    const root = declarations('.root')
    const scrollport = declarations('.scrollArea')
    expect(root?.get('--astro-one-sidebar-inline-padding')).toBe('12px')
    expect(root?.get('--astro-one-sidebar-row-padding')).toBe('12px')
    expect(root?.get('--astro-one-sidebar-label-gap')).toBe('6px')
    expect(root?.get('--astro-one-sidebar-paint-inset')).toBe('3px')
    expect(root?.get('padding')).toBe('16px var(--astro-one-sidebar-inline-padding) 16px calc(var(--astro-one-sidebar-inline-padding) + 10px)')
    expect(declarations('.scrollRegion')?.get('min-height')).toBe('0')
    expect(declarations('.root:not(.collapsed) .scrollRegion')?.get('container-type')).toBe('size')
    expect(declarations('.scrollRegion')?.get('container-type')).toBeUndefined()
    expect(scrollport?.get('display')).toBe('grid')
    expect(scrollport?.get('overflow-y')).toBe('auto')
    expect(scrollport?.get('overflow-x')).toBe('hidden')
    expect(scrollport?.get('grid-template-columns')).toBe('4px minmax(0, 1fr) calc(var(--astro-one-sidebar-inline-padding) - 2px)')
    expect(scrollport?.get('grid-template-rows')).toBe('8px max-content 2px max-content')
    expect(declarations('.scrollRegion')?.get('margin-top')).toBe('4px')
    expect(declarations('.collapsed .scrollRegion')?.get('margin-top')).toBe('0')
    expect(scrollport?.get('margin-left')).toBe('-4px')
    expect(scrollport?.get('margin-right')).toBe('calc(2px - var(--astro-one-sidebar-inline-padding))')
    expect(scrollport?.get('scroll-padding-block')).toBeUndefined()
    expect(declarations('.panelList')?.get('grid-row')).toBe('2')
    expect(declarations('.regionArea')?.get('grid-row')).toBe('4')
    expect(declarations('.regionArea')?.get('overflow')).toBeUndefined()
    expect(declarations('.regionArea')?.get('margin-right')).toBeUndefined()
    expect(declarations('.regionArea')?.get('flex')).toBeUndefined()
    expect(declarations('.collapsed .regionArea')?.get('flex')).toBe('1')
    expect(declarations('.collapsed .regionArea')?.get('margin-left')).toBeUndefined()
    expect(declarations('.collapsed .regionArea')?.get('margin-right')).toBeUndefined()
    expect(declarations('.collapsed .regionArea')?.get('padding-left')).toBeUndefined()
    expect(declarations('.scrollFade')?.get('height')).toBe('24px')
    expect(declarations('.collapsed .scrollArea')?.get('overflow')).toBe('visible')
    expect(declarations('.collapsed .scrollArea')?.get('margin')).toBe('0')
  })

  it('hides the expanded viewport scrollbar and publishes its scroll state to the section', () => {
    const expanded = declarations('.root:not(.collapsed) .scrollArea')
    expect(expanded?.get('container-type')).toBe('scroll-state')
    expect(expanded?.get('scrollbar-width')).toBe('none')
    expect(declarations('.root:not(.collapsed) .scrollArea::-webkit-scrollbar')?.get('display')).toBe('none')
  })

  it('keeps the command bar spacing separate from the rail and the drawer', () => {
    expect(declarations('.commandBar')?.get('position')).toBe('fixed')
    expect(declarations('.commandBarDrawer')?.get('position')).toBe('static')
    expect(declarations('.commandBar .newSession')?.get('margin')).toBe('0')
    expect(css).not.toContain(':not(.fading)')
    expect(declarations('.root.collapsed')?.get('padding')).toBe('26px 8px 14px 12px')
  })

  it('fixes the command bar across the top of the window, below any caption row', () => {
    const bar = declarations('.commandBar')
    expect(bar?.get('position')).toBe('fixed')
    expect(bar?.get('top')).toBe('var(--lh-command-bar-top, 0px)')
    expect(bar?.get('left')).toBe('0')
    expect(bar?.get('right')).toBe('0')
    expect(bar?.get('height')).toBe('var(--lh-command-bar-height, 56px)')
    expect(declarations('.commandBar .panelList')?.get('flex-direction')).toBe('row')
    expect(css).not.toMatch(/@keyframes rail-in\b/)
  })

  it('keeps full-size brand artwork with a compact mark-to-name gap', () => {
    expect(declarations('.brandIdentity')?.get('gap')).toBe('5px')
    expect(declarations('.brandIdentity')?.get('height')).toBe('24px')
    expect(declarations('.brandName')?.get('height')).toBe('24px')
    expect(declarations('.brandName')?.get('line-height')).toBe('24px')
    expect(declarations('.brandName')?.get('font-size')).toBe('18px')
    expect(declarations('.fallbackBrandName')?.get('font-size')).toBe('17px')
    expect(declarations('.fallbackBrandName')?.get('white-space')).toBe('nowrap')
  })
})
