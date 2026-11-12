// The composer remains in ConversationRoot so switching out of the blank-draft
// phase does not remount its textarea.

import type { ReactNode, RefObject } from 'react'
import {
  OrbitLogo, IconChevronDownOutlineRegular, IconFolderCloseRegular, IconFolderOpenRegular,
} from '@astro-one/client-ui-primitives'
import { workspaceTitleOf } from '@astro-one/util-workspace-path'
import type { ConversationContentProps } from '../contract/slots.ts'
import css from './HeroShell.module.css'
import { MissionTelemetry } from './MissionTelemetry.tsx'

/** The owner's locale seat type, passed to hero chrome as a plain prop. */
type HeroTranslate = ConversationContentProps['t']

/**
 * Basename label for the workspace chip (the shared derivation);
 * separator-only paths echo the raw cwd.
 * @param cwd - workspace directory path (non-empty).
 * @returns chip label.
 */
export function workspaceLabel(cwd: string): string {
  const base = workspaceTitleOf(cwd)
  return base !== '' ? base : cwd
}

/**
 * The workspace chip (folder + label + chevron), always interactive: before
 * the first message the workspace stays switchable — picking another one
 * moves the New Session flow to that workspace's blank session. Without a
 * label the chip renders its placeholder state: closed folder + the
 * "Choose workspace" call to action.
 * @param props.label - chip label (see {@link workspaceLabel}); omitted → placeholder.
 * @param props.menuOpen - menu expansion echo.
 * @param props.onClick - menu toggle.
 * @returns the chip button element.
 */
export function WorkspaceChip({ buttonRef, label, menuOpen = false, onClick, t }: {
  buttonRef?: RefObject<HTMLButtonElement>
  label?: string | undefined
  menuOpen?: boolean
  onClick?: () => void
  t: HeroTranslate
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      className={css.workspace}
      aria-label={t('hero.chooseWorkspace')}
      aria-haspopup="menu"
      aria-expanded={menuOpen}
      onClick={onClick}
    >
      {label === undefined
        ? <IconFolderCloseRegular className={css.folder} size={16} />
        : <IconFolderOpenRegular className={css.folder} size={16} />}
      <span className={css.workspaceLabel}>{label ?? t('hero.chooseWorkspace')}</span>
      <IconChevronDownOutlineRegular className={css.chevron} size={12} />
    </button>
  )
}

/** Hero chrome props. The workspace row rides the InputBar accessory hole, not here. */
export interface HeroShellProps {
  /** The owner's locale seat, passed down as a plain prop. */
  t: HeroTranslate
  /** Authorized renderer for the hero brand-mark slot. */
  renderSlot: ConversationContentProps['renderSlot']
  /** Overlay content after the stack (modals). */
  children?: ReactNode
}

/** Render the orbital mission introduction around the persistent composer.
 * @param props - Localized copy, brand slot, and overlays.
 * @returns Mission introduction and its overlays.
 */
export function HeroShell({ t, renderSlot, children }: HeroShellProps) {
  return (
    <div className={css.root}>
      <div className={css.stack}>
        <div className={css.missionLabel}>
          {renderSlot('conversation.hero.brand.mark', { size: 26, className: css.mark }, {
            fallback: <OrbitLogo size={26} className={css.mark} />,
          })}
          <p className={css.eyebrow}>{t('hero.eyebrow')}</p>
        </div>
        <div className={css.headline}><span>{t('hero.headline')}</span></div>
        <p className={css.subtitle}>{t('hero.subtitle')}</p>
        <svg className={css.waveform} viewBox="0 0 240 24" fill="none" aria-hidden="true" data-lh-ambient>
          <path className={css.waveTrace} d="M0 12 C 10 12 14 4 20 4 S 30 20 40 20 S 50 4 60 4 S 70 20 80 20 S 90 4 100 4 S 110 20 120 20 S 130 4 140 4 S 150 20 160 20 S 170 4 180 4 S 190 20 200 20 S 210 4 220 4 S 234 12 240 12" pathLength="1000" />
          <path className={css.wavePulse} d="M0 12 C 10 12 14 4 20 4 S 30 20 40 20 S 50 4 60 4 S 70 20 80 20 S 90 4 100 4 S 110 20 120 20 S 130 4 140 4 S 150 20 160 20 S 170 4 180 4 S 190 20 200 20 S 210 4 220 4 S 234 12 240 12" pathLength="1000" />
        </svg>
        <MissionTelemetry t={t} />
        <div className={css.body} />
      </div>
      {children}
    </div>
  )
}
