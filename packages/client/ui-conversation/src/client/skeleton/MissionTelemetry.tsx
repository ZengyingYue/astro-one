/** Live instrument readout on the blank-conversation mission introduction. */
import { useEffect, useState } from 'react'
import type { ConversationContentProps } from '../contract/slots.ts'
import css from './HeroShell.module.css'

/**
 * Format a time as a zero-padded UTC clock.
 * @param date - instant to format.
 * @returns `HH:MM:SS` in UTC.
 */
export function utcClock(date: Date): string {
  return date.toISOString().slice(11, 19)
}

/**
 * Render the station readout: a UTC clock that advances every second, the
 * station identifier, and an animated signal meter. The readout is
 * decorative telemetry, so it stays out of the accessibility tree.
 * @param props.t - the hero locale seat.
 * @returns the readout row.
 */
export function MissionTelemetry({ t }: { t: ConversationContentProps['t'] }) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => { setNow(new Date()) }, 1000)
    return () => { clearInterval(timer) }
  }, [])
  return (
    <div className={css.readout} aria-hidden="true" data-mission-telemetry data-lh-ambient>
      <span className={css.readoutCell}>
        <span className={css.readoutKey}>{t('hero.telemetry.clock')}</span>
        <span className={css.readoutValue}>{utcClock(now)}</span>
      </span>
      <span className={css.readoutCell}>
        <span className={css.readoutKey}>{t('hero.telemetry.station')}</span>
        <span className={css.readoutValue}>{t('hero.telemetry.stationId')}</span>
      </span>
      <span className={css.readoutCell}>
        <span className={css.readoutKey}>{t('hero.telemetry.signal')}</span>
        <span className={css.signalBars}><i /><i /><i /><i /><i /></span>
      </span>
    </div>
  )
}
