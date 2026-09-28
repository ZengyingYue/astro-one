import { clientBundle } from '../../client/tsdown.client.ts'

export default clientBundle(
  '@astro-one/session-log-export',
  ['lib/types/index.js'],
  { hostPhase: true },
)
