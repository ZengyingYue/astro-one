import { staticLinked } from '../tsdown.client.ts'

export default staticLinked(
  '@astro-one/client-web',
  ['lib/types/index.js', 'lib/types/apply-injections.js'],
)
