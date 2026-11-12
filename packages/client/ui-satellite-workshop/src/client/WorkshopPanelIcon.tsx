/** The sidebar's Satellite workshop entry icon; the sidebar owns the button, label, and selected state around it. */

import type { ReactNode } from 'react'
import type { PropsRuntime } from '@astro-one/client-ui-slots'
import type {} from '@astro-one/client-ui-sidebar/client'

/**
 * Render a satellite glyph — a bus between two solar wings with a dish — at the size the sidebar asks for.
 * @param props - the sidebar's icon share: the requested edge.
 * @returns the icon element.
 */
export function WorkshopPanelIcon({ size }: PropsRuntime<'sidebar.panellist'>): ReactNode {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="6" y="5.5" width="4" height="5" rx="0.6" />
      <path d="M1 6.5h3.5v3H1zM11.5 6.5H15v3h-3.5zM4.5 8H6M10 8h1.5M2.75 6.5v3M13.25 6.5v3" />
      <path d="M6.2 3.6a1.8 1.8 0 0 1 3.6 0M8 3.6v1.9M8 10.5v1.6M6.6 13.4 8 12.1l1.4 1.3" />
    </svg>
  )
}
