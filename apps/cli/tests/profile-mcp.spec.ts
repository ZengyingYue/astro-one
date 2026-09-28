/** MCP resource ownership across the resolved shipped profile templates. */

import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { composeEntries, loadProfile, PROFILE_TEMPLATES } from '@astro-one/app-boot'

const installAnchor = fileURLToPath(new URL('../package.json', import.meta.url))
const resourcePackage = '@astro-one/mcp-resources'

describe('shipped MCP resource composition', () => {
  it.each(Object.keys(PROFILE_TEMPLATES))('%s carries one shared resource consumer without a server', (name) => {
    const home = mkdtempSync(join(tmpdir(), 'astro-one-profile-mcp-'))
    try {
      const profile = loadProfile('astro-one', name, installAnchor, home)
      const warnings: string[] = []
      const rows = composeEntries([
        ...profile.layers.map(layer => layer.patches),
        profile.patches,
      ], message => warnings.push(message))

      expect(rows.filter(row => row.name === resourcePackage)).toEqual([
        { id: 'mcp-resources', name: resourcePackage },
      ])
      expect(rows.filter(row => row.name === '@astro-one/mcp-client')).toEqual([])
      expect(warnings).toEqual([])

      const owners = profile.layers.filter((layer) => {
        const manifest = JSON.parse(readFileSync(join(layer.packageDir, 'package.json'), 'utf8')) as {
          dependencies?: Record<string, string>
        }
        return manifest.dependencies?.[resourcePackage] !== undefined
      })
      expect(owners.map(owner => owner.packageName)).toEqual([
        name === 'sdk-minimal' ? '@astro-one/sdk-minimal' : '@astro-one/base',
      ])
    } finally {
      rmSync(home, { recursive: true, force: true })
    }
  })
})
