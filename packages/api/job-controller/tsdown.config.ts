import { clientBundle } from '../../client/tsdown.client.ts'

export default clientBundle(
  '@astro-one/api-job-controller',
  ['lib/types/index.js'],
  { hostPhase: true },
)
