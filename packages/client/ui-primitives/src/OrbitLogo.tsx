/** Astro One satellite emblem. */
import type { IconProps } from './icons/props.ts'

/** Render the decorative orbital satellite mark.
 * @param props - Mark size and layout class.
 * @returns An accessible-name-free SVG for use beside a product label.
 */
export function OrbitLogo({ size = 24, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" className={className} aria-hidden="true">
      <ellipse cx="16" cy="16" rx="15" ry="7" transform="rotate(-35 16 16)" stroke="currentColor" strokeWidth="1" opacity=".55" />
      <g transform="rotate(-35 16 16)" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
        <path d="M12 12h8v8h-8z" fill="currentColor" fillOpacity=".2" />
        <path d="M2 11h7v10H2zM23 11h7v10h-7zM5.5 11v10M26.5 11v10M2 16h7m14 0h7M9 16h3m8 0h3M16 12V8m-3-2 3 2 3-2" />
      </g>
      <circle cx="27" cy="6" r="2" fill="currentColor" />
    </svg>
  )
}
