/** Decorative orbital scene; its motion never moves interactive conversation content. */
import { useEffect, useRef } from 'react'
import css from './OrbitalScene.module.css'

/**
 * Render the blank conversation's tinted planet scene, tracking reticle, and
 * radar scan with bounded pointer parallax. The frame's cosmos backdrop
 * supplies the stars behind it.
 * Visibility changes pause animation; unmounting removes all scene listeners.
 * @returns an inaccessible, pointer-transparent background.
 */
export function OrbitalScene() {
  const sceneRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const scene = sceneRef.current
    const host = scene?.parentElement
    if (!scene || !host) return
    const reset = () => {
      scene.style.setProperty('--orbit-x', '0px')
      scene.style.setProperty('--orbit-y', '0px')
    }
    const move = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return
      const rect = host.getBoundingClientRect()
      if (rect.width === 0 || rect.height === 0) return
      const x = Math.max(-.5, Math.min(.5, (event.clientX - rect.left) / rect.width - .5))
      const y = Math.max(-.5, Math.min(.5, (event.clientY - rect.top) / rect.height - .5))
      scene.style.setProperty('--orbit-x', `${x * 24}px`)
      scene.style.setProperty('--orbit-y', `${y * 18}px`)
    }
    const visibility = () => { scene.dataset.paused = String(document.hidden) }
    visibility()
    host.addEventListener('pointermove', move, { passive: true })
    host.addEventListener('pointerleave', reset)
    document.addEventListener('visibilitychange', visibility)
    return () => {
      host.removeEventListener('pointermove', move)
      host.removeEventListener('pointerleave', reset)
      document.removeEventListener('visibilitychange', visibility)
    }
  }, [])

  return (
    <div ref={sceneRef} className={css.scene} aria-hidden="true" data-orbital-scene data-lh-ambient>
      <div className={css.depth}>
        <div className={css.photograph} />
        <div className={css.nebula} />
        <svg className={css.orbits} viewBox="0 0 1200 800" fill="none">
          <g transform="rotate(-24 870 310)">
            <ellipse className={css.orbitTrack} cx="870" cy="310" rx="355" ry="130" />
            <ellipse className={css.orbitSignal} cx="870" cy="310" rx="355" ry="130" pathLength="1000" />
            <ellipse className={css.orbitSignalSecondary} cx="870" cy="310" rx="395" ry="160" pathLength="1000" />
          </g>
        </svg>
        <div className={css.solarGlint} />
      </div>
      <svg className={css.reticle} viewBox="0 0 200 200" fill="none">
        <circle className={css.reticleRing} cx="100" cy="100" r="92" pathLength="360" />
        <circle className={css.reticleSweep} cx="100" cy="100" r="74" pathLength="1000" />
        <path className={css.reticleCross} d="M100 2v22M100 176v22M2 100h22M176 100h22" />
        <path className={css.reticleCorners} d="M52 40h-12v12M148 40h12v12M52 160h-12v-12M148 160h12v-12" />
      </svg>
      <div className={css.scan} />
    </div>
  )
}
