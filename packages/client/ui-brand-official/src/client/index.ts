/** Official Astro One occupants for the generic browser-brand slots. */
import type { Context as ClientContext } from '@astro-one/cordis'
import type {} from '@astro-one/client-ui-renderer/client'
import type {} from '@astro-one/client-ui-sidebar/client'
import { OfficialBrandMark, OfficialBrandName } from './Brand.tsx'

/** Required service: the UI slot registry. */
export const inject = ['slots']

/**
 * Fill the sidebar brand slots as one declaration-aware registration set. The
 * conversation hero stays on its declaring package's animated fish fallback,
 * so the official build registers nothing there.
 * @param ctx - Client root context.
 */
export function apply(ctx: ClientContext): void {
  if (process.env.ASTRO_ONE_CLIENT_BUILD_PROFILE !== 'official') return
  ctx.slots.inject('sidebar.brand.mark', () =>
    ctx.slots.inject('sidebar.brand.name', function* () {
      yield ctx.slots.register({ name: 'sidebar.brand.mark' }, OfficialBrandMark)
      yield ctx.slots.register({ name: 'sidebar.brand.name' }, OfficialBrandName)
    }))
}
