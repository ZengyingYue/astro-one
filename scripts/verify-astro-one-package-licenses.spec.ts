import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { inspectAstroOnePackageLicenses } from './verify-astro-one-package-licenses.ts'

const roots: string[] = []

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

function writeManifest(root: string, file: string, manifest: Record<string, unknown>): void {
  const path = join(root, file)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`)
}

function createWorkspace(): string {
  const root = mkdtempSync(join(tmpdir(), 'astro-one-package-licenses-'))
  roots.push(root)
  writeManifest(root, 'package.json', {
    name: '@astro-one/root',
    license: 'MIT',
    workspaces: ['apps/*', 'packages/*/*', 'vendor/*'],
  })
  return root
}

describe('Astro One package license gate', () => {
  it('checks root, unhyphenated CLI, and astro-one-prefixed package names while ignoring other families', () => {
    const root = createWorkspace()
    writeManifest(root, 'apps/cli/package.json', { name: '@astro-one/cli', license: 'MIT' })
    writeManifest(root, 'packages/core/agent/package.json', {
      name: '@astro-one/agent',
      license: 'BSD-3-Clause',
    })
    writeManifest(root, 'vendor/cordis/package.json', {
      name: '@astro-one/cordis',
      license: 'BSD-3-Clause',
    })

    expect(inspectAstroOnePackageLicenses(root)).toEqual({
      packageCount: 3,
      failures: [
        'packages/core/agent/package.json: @astro-one/agent must declare "license": "MIT"; found "BSD-3-Clause".',
      ],
    })
  })

  it('rejects a missing license declaration', () => {
    const root = createWorkspace()
    writeManifest(root, 'packages/core/agent/package.json', { name: '@astro-one/agent' })

    expect(inspectAstroOnePackageLicenses(root).failures).toEqual([
      'packages/core/agent/package.json: @astro-one/agent must declare "license": "MIT"; found undefined.',
    ])
  })
})
