import { clientBundle } from '../../client/tsdown.client.ts'

export default clientBundle(
  '@astro-one/api-terminal-controller',
  ['lib/types/index.js'],
  { hostPhase: true },
)
