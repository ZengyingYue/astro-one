import type { TurnBoundaryProjection } from './types.ts'
import type {} from '@astro-one/session-projection'

declare module '@astro-one/session-projection/types' {
  interface SessionProjectionStateMap {
    /** The agent session's open/last turn and step boundary facts (whole value). */
    turnBoundary: TurnBoundaryProjection
  }
}

export {}
