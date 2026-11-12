/** Load the bench and its 3D library only after the workshop page is mounted. */
import { lazy, Suspense, type ReactNode } from 'react'
import type { ViewportProps } from './Viewport.tsx'

const LoadedViewport = lazy(async () => ({ default: (await import('./Viewport.tsx')).Viewport }))

/**
 * Suspend while the package-local bench chunk arrives.
 * @param props - the canvas props, plus the text shown while the chunk loads.
 * @returns the deferred canvas.
 */
export function LazyViewport({ loading, ...props }: ViewportProps & { readonly loading: string }): ReactNode {
  return (
    <Suspense fallback={<p className={props.unavailableClassName} role="status">{loading}</p>}>
      <LoadedViewport {...props} />
    </Suspense>
  )
}
