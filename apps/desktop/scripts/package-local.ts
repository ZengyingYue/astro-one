/** Build an independent Astro One installer with the complete bundled astro-one runtime. */
import { spawnSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { pnpmInvocation } from '../../../scripts/pnpm-invocation.ts'
import { desktopTargetBuildPaths, desktopTargetPlatform, resolveDesktopBuildTarget } from './desktop-build-paths.mjs'

const root = resolve(import.meta.dirname, '../../..')
const appRoot = resolve(import.meta.dirname, '..')
const { values } = parseArgs({ options: {
  dir: { type: 'boolean', default: false },
  'skip-build': { type: 'boolean', default: false },
  'prepare-only': { type: 'boolean', default: false },
} })
if (process.platform !== 'linux' && process.platform !== 'win32') {
  throw new Error('Astro One installers must be built on Ubuntu or Windows.')
}
const target = resolveDesktopBuildTarget({})
const platform = desktopTargetPlatform(target)
const paths = desktopTargetBuildPaths(target)
const environment = { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: 'false',
  ASTRO_ONE_DESKTOP_TARGET_PLATFORM: platform.platform, ASTRO_ONE_DESKTOP_TARGET_ARCH: platform.arch }
function run(args: string[], cwd = root): void {
  const invocation = pnpmInvocation(args, environment)
  const result = spawnSync(invocation.command, invocation.args, { cwd, env: environment, stdio: 'inherit' })
  if (result.error !== undefined) throw result.error
  if (result.status !== 0) throw new Error(`Astro One packaging failed: ${args.join(' ')} (${String(result.status ?? result.signal)})`)
}
if (!values['skip-build']) run(['run', 'build'])
run(['run', 'build'], appRoot)
run(['run', 'release:pack', '--family', 'astro-one', '--local', '--out', paths.packedAstroOne, '--concurrency', '4'])
run(['--dir', 'apps/desktop-host', 'pack', '--pack-destination', paths.packedAstroOne])
run(['run', 'release:pack', '--family', 'vendor', '--out', paths.packedVendor, '--concurrency', '4'])
mkdirSync(paths.packedLandlock, { recursive: true })
run(['--dir', 'native/system', 'run', 'build:ts'])
run(['--dir', 'native/system/packages/entry', 'pack', '--pack-destination', paths.packedLandlock])
for (const script of ['prepare:runtime', 'prepare:packages', 'prepare:astro-one']) run(['run', script], appRoot)
if (!values['prepare-only']) {
  run(['exec', 'electron-builder', '--config', 'electron-builder.local.mjs',
    process.platform === 'linux' ? '--linux' : '--win',
    target.endsWith('arm64') ? '--arm64' : '--x64', '--publish', 'never', ...(values.dir ? ['--dir'] : [])], appRoot)
  run(['exec', 'tsx', 'scripts/smoke-local.ts'], appRoot)
}
