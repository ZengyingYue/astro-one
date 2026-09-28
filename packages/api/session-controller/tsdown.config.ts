import { clientBundle } from '../../client/tsdown.client.ts'

export default clientBundle(
  '@astro-one/api-session-controller',
  ['lib/types/index.js'],
  { hostPhase: true },
)
