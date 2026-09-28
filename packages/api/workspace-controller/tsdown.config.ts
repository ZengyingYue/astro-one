import { clientBundle } from '../../client/tsdown.client.ts'

export default clientBundle(
  '@astro-one/api-workspace-controller',
  ['lib/types/index.js'],
  { hostPhase: true },
)
