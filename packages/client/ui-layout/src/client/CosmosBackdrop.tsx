/** Animated deep-space backdrop painted behind every Astro One column. */
import { useEffect, useRef } from 'react'
import { startCosmos } from './cosmos.ts'
import css from './CosmosBackdrop.module.css'

/**
 * Render the cosmos canvas and its vignette behind the frame's columns. The
 * layer is decorative: hidden from assistive technology and transparent to
 * the pointer.
 * @returns the backdrop element.
 */
export function CosmosBackdrop() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const canvas = canvasRef.current
    /* v8 ignore next -- the ref is attached by effect time: the canvas renders unconditionally. */
    if (canvas === null) return
    return startCosmos(canvas, window)
  }, [])

  return (
    <div className={css.root} aria-hidden="true" data-cosmos-backdrop data-lh-ambient>
      <canvas ref={canvasRef} className={css.canvas} />
      <div className={css.vignette} />
    </div>
  )
}
