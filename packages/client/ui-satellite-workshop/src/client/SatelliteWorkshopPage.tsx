/**
 * The satellite workshop page: the part bin, the 3D bench, and the panel with
 * the mission, the budgets, the rule checks, the mounted parts, and the
 * hand-off to the model. The build lives in the workshop store; the budgets
 * and findings derive from it on every render.
 */

import { useMemo, useState, type ReactNode } from 'react'
import clsx from 'clsx'
import { Button, Pill, StateDot, Toast, writeClipboard } from '@astro-one/client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime, PropsStore } from '@astro-one/client-ui-slots'
import type {} from '@astro-one/client-ui-layout/client'
import { PRESETS, freeSlotFor, mountsOf, slotsOf, type WorkshopStore } from './assembly.ts'
import type { BenchRenderer } from './bench.ts'
import { computeBudgets, findIssues } from './budgets.ts'
import { BUSES, CATEGORIES, MISSIONS, PARTS, busOf, findPart, missionOf, type Part } from './catalog.ts'
import {
  budgetLines, busName, categoryName, evaluationPrompt, findingText, missionDescription, missionName, partFigures,
  partName, slotLabel,
} from './presentation.ts'
import { PART_DRAG_TYPE } from './drag.ts'
import { LazyViewport } from './LazyViewport.tsx'
import css from './SatelliteWorkshopPage.module.css'

/** How a hand-off to the model ended. */
export type EvaluateOutcome = 'sent' | 'noWorkspace' | 'failed'

/** What the plugin body gives the page. */
export interface WorkshopInjected {
  /**
   * Send an evaluation prompt to the model in a new session and show that session.
   * @param prompt - the evaluation request.
   * @returns whether the prompt was accepted, no workspace exists, or sending failed.
   */
  readonly evaluate: (prompt: string) => Promise<EvaluateOutcome>
}

/** Full component props assembled by the main slot renderer. */
export type SatelliteWorkshopPageProps =
  PropsRuntime<'main'>
  & PropsLocale<'satelliteWorkshop'>
  & PropsStore<WorkshopStore>
  & InjectFace<WorkshopInjected>
  & {
    /** Renderer factory for the bench; absent uses WebGL. */
    readonly createRenderer?: ((canvas: HTMLCanvasElement) => BenchRenderer | null) | undefined
  }

/** How long a notice stays on screen. */
const NOTICE_MS = 3_200

/**
 * Render the workshop.
 * @param props - the store share, the dictionary, and the evaluation hand-off.
 * @returns the page.
 */
export function SatelliteWorkshopPage(props: SatelliteWorkshopPageProps): ReactNode {
  const { t, actions, useStore, evaluate } = props
  const state = useStore(store => store)
  const [notice, setNotice] = useState<{ readonly seq: number; readonly text: string } | null>(null)
  const [sending, setSending] = useState(false)
  const [resetSignal, setResetSignal] = useState(0)

  const bus = busOf(state.busId)
  const mission = missionOf(state.missionId)
  const derived = useMemo(() => {
    const slots = slotsOf(bus)
    const mounts = mountsOf(state)
    const budgets = computeBudgets(bus, mounts, mission)
    const findings = findIssues(mounts, mission, budgets)
    return { slots, mounts, budgets, findings }
  }, [bus, mission, state.busId, state.mounts])
  const { slots, mounts, budgets, findings } = derived
  const held = state.held === null ? undefined : findPart(state.held)
  const focusSlot = slots.find(slot => slot.id === state.focus)
  const focusPart = mounts.find(mount => mount.slot.id === state.focus)?.part
  const say = (text: string): void => { setNotice(current => ({ seq: (current?.seq ?? 0) + 1, text })) }

  const place = (part: Part, slotId: string | null): void => {
    const slot = slotId ?? freeSlotFor(state, part)?.id
    if (slot === undefined) say(t('noSlot', { name: partName(t, part) }))
    else actions.install(slot, part.id)
  }
  const prompt = (): string => evaluationPrompt(t, { bus, mission, mounts, slots, budgets, findings })
  const send = (): void => {
    setSending(true)
    void evaluate(prompt()).then((outcome) => {
      setSending(false)
      if (outcome === 'noWorkspace') say(t('evaluateNoWorkspace'))
      if (outcome === 'failed') say(t('evaluateFailed'))
    })
  }

  return (
    <div className={css.page}>
      <header className={css.head}>
        <div className={css.headText}>
          <h1 className={css.title}>{t('title')}</h1>
          <p className={css.intro}>{t('intro')}</p>
        </div>
        <div className={css.selectors}>
          <div className={css.selector} role="group" aria-label={t('mission')}>
            <span className={css.selectorLabel}>{t('mission')}</span>
            {MISSIONS.map(option => (
              <Pill key={option.id} active={option.id === mission.id} onClick={() => { actions.selectMission(option.id) }}>
                {missionName(t, option)}
              </Pill>
            ))}
          </div>
          <div className={css.selector} role="group" aria-label={t('bus')}>
            <span className={css.selectorLabel}>{t('bus')}</span>
            {BUSES.map(option => (
              <Pill key={option.id} active={option.id === bus.id} onClick={() => { actions.selectBus(option.id) }}>
                {busName(t, option)}
              </Pill>
            ))}
          </div>
        </div>
      </header>

      <div className={css.body}>
        <aside className={css.bin} aria-label={t('bin')}>
          <h2 className={css.sectionTitle}>{t('bin')}</h2>
          {CATEGORIES.map(category => (
            <section key={category} className={css.category}>
              <h3 className={css.categoryTitle}>{categoryName(t, category)}</h3>
              {PARTS.filter(part => part.category === category).map(part => (
                <button
                  key={part.id}
                  type="button"
                  className={clsx(css.part, part.id === state.held && css.partHeld)}
                  aria-pressed={part.id === state.held}
                  aria-label={t('hold', { name: partName(t, part) })}
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.setData(PART_DRAG_TYPE, part.id)
                    event.dataTransfer.effectAllowed = 'copy'
                  }}
                  onClick={() => { actions.hold(part.id === state.held ? null : part.id) }}
                  onDoubleClick={() => { place(part, null) }}
                >
                  <span className={css.partName}>{partName(t, part)}</span>
                  <span className={css.partFigures}>{partFigures(t, part).join(' · ')}</span>
                </button>
              ))}
            </section>
          ))}
        </aside>

        <section className={css.bench}>
          <LazyViewport
            className={css.canvas}
            unavailableClassName={css.unavailable}
            loading={t('benchLoading')}
            dragType={PART_DRAG_TYPE}
            view={{ bus, slots, mounts, heldKind: held?.mount ?? null, focus: state.focus, exploded: state.exploded }}
            kindOf={partId => findPart(partId)?.mount}
            label={t('viewport')}
            unavailable={t('webglUnavailable')}
            resetSignal={resetSignal}
            createRenderer={props.createRenderer}
            onPick={(slotId) => {
              if (held !== undefined && slotId !== null) actions.install(slotId, held.id)
              else actions.focus(slotId)
            }}
            onMove={actions.move}
            onRemove={actions.remove}
            onDropPart={(partId, slotId) => {
              const part = findPart(partId)
              if (part !== undefined) place(part, slotId)
            }}
            onStepFocus={actions.stepFocus}
            onConfirm={() => { if (held !== undefined && state.focus !== null) actions.install(state.focus, held.id) }}
            onRemoveFocused={() => { if (state.focus !== null) actions.remove(state.focus) }}
            onToggleExploded={actions.toggleExploded}
            onCancel={() => { actions.hold(null) }}
          />
          <div className={css.benchBar}>
            <Button variant="toolbar" size="sm" aria-pressed={state.exploded} onClick={actions.toggleExploded}>
              {state.exploded ? t('assemble') : t('explode')}
            </Button>
            <Button variant="toolbar" size="sm" onClick={() => { setResetSignal(signal => signal + 1) }}>{t('resetView')}</Button>
            <Button
              variant="toolbar"
              size="sm"
              disabled={!PRESETS.some(preset => preset.missionId === mission.id)}
              title={PRESETS.some(preset => preset.missionId === mission.id) ? undefined : t('presetNone')}
              onClick={() => { actions.loadPreset(mission.id) }}
            >
              {t('preset')}
            </Button>
            <Button variant="toolbar" size="sm" disabled={mounts.length === 0} onClick={actions.clear}>{t('clear')}</Button>
          </div>
          <p className={css.hint} role="status">
            {held !== undefined
              ? t('holding', { name: partName(t, held) })
              : focusSlot !== undefined
                ? t('slotFocus', {
                  slot: slotLabel(t, focusSlot, slots),
                  name: focusPart === undefined ? t('slotEmpty') : partName(t, focusPart),
                })
                : t('idleHint')}
          </p>
          <p className={css.keys}>{t('keys')}</p>
        </section>

        <aside className={css.panel}>
          <section className={css.block}>
            <h2 className={css.sectionTitle}>{missionName(t, mission)}</h2>
            <p className={css.blockText}>{missionDescription(t, mission)}</p>
          </section>

          <section className={css.block}>
            <h2 className={css.sectionTitle}>{t('budgets')}</h2>
            <ul className={css.budgets}>
              {budgetLines(t, budgets, findings).map(line => (
                <li key={line.id} className={css.budget} data-severity={line.severity ?? 'ok'}>
                  <span className={css.budgetLabel}>{line.label}</span>
                  <span className={css.budgetValue}>{line.value}</span>
                  <span className={css.meter} aria-hidden="true">
                    <span className={css.meterFill} style={{ width: `${Math.round(Math.min(1, line.ratio) * 100)}%` }} />
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section className={css.block}>
            <h2 className={css.sectionTitle}>{t('findings')}</h2>
            {findings.length === 0
              ? <p className={css.pass}><StateDot state="done" />{t('findingsNone')}</p>
              : (
                <ul className={css.findings}>
                  {findings.map((finding, index) => (
                    <li key={`${finding.code}:${index}`} className={css.finding}>
                      <StateDot state={finding.severity} />
                      <span>{findingText(t, finding)}</span>
                    </li>
                  ))}
                </ul>
              )}
          </section>

          <section className={css.block}>
            <h2 className={css.sectionTitle}>{t('installed')}</h2>
            {mounts.length === 0
              ? <p className={css.blockText}>{t('installedNone')}</p>
              : (
                <ul className={css.mounts}>
                  {mounts.map(({ slot, part }) => (
                    <li key={slot.id} className={clsx(css.mount, slot.id === state.focus && css.mountFocus)}>
                      <button type="button" className={css.mountMain} onClick={() => { actions.focus(slot.id) }}>
                        <span className={css.mountSlot}>{slotLabel(t, slot, slots)}</span>
                        <span className={css.mountPart}>{partName(t, part)}</span>
                      </button>
                      <button
                        type="button"
                        className={css.mountRemove}
                        aria-label={t('remove', { name: partName(t, part) })}
                        onClick={() => { actions.remove(slot.id) }}
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              )}
          </section>

          <section className={css.evaluate}>
            <Button variant="primary" disabled={sending} onClick={send}>{sending ? t('evaluating') : t('evaluate')}</Button>
            <Button
              variant="outline"
              onClick={() => { void writeClipboard(prompt()).then((copied) => { if (copied) say(t('copied')) }) }}
            >
              {t('copyPrompt')}
            </Button>
            <p className={css.blockText}>{t('evaluateHint')}</p>
          </section>
        </aside>
      </div>

      {notice !== null && (
        <Toast key={notice.seq} text={notice.text} holdMs={NOTICE_MS} onDone={() => { setNotice(null) }} />
      )}
    </div>
  )
}
