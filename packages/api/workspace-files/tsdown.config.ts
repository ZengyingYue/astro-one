import { clientBundle } from '../../client/tsdown.client.ts'

export default clientBundle(
  '@astro-one/api-workspace-files',
  ['lib/types/index.js'],
  { hostPhase: true },
)
