import { clientBundle } from '../tsdown.client.ts'

export default clientBundle(
  '@astro-one/client-modules',
  ['lib/types/index.js', 'lib/types/invariant.js'],
)
