import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  assertDesktopHostPackageFiles,
  selectDesktopPackageClosure,
  type PackedDesktopPackage,
} from '../scripts/prepare-package-set.ts'

function packed(name: string, manifest: Record<string, unknown> = {}): PackedDesktopPackage {
  return { tarball: `${name}.tgz`, manifest: { name, version: '1.0.0', ...manifest } }
}

describe('desktop package-set selection', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('does not select a packaging target when imported as a library', async () => {
    vi.stubEnv('ASTRO_ONE_DESKTOP_TARGET_PLATFORM', 'linux')
    vi.stubEnv('ASTRO_ONE_DESKTOP_TARGET_ARCH', 'x64')
    vi.resetModules()
    await expect(import('../scripts/prepare-package-set.ts')).resolves.toHaveProperty('prepareDesktopPackageSet')
  })

  it('includes only the available internal production closure', () => {
    const available = new Map<string, PackedDesktopPackage>([
      ['@astro-one/cli', packed('@astro-one/cli', {
        dependencies: { '@astro-one/base': '^1.0.0', external: '^2.0.0' },
        optionalDependencies: { '@deepseek-ai/platform-package': '1.0.0', '@deepseek-ai/missing-platform': '1.0.0' },
      })],
      ['@astro-one/desktop-host', packed('@astro-one/desktop-host', {
        dependencies: { '@astro-one/cli': '^1.0.0' },
      })],
      ['@astro-one/base', packed('@astro-one/base', {
        peerDependencies: { '@astro-one/cordis': '^1.0.0' },
      })],
      ['@astro-one/cordis', packed('@astro-one/cordis')],
      ['@deepseek-ai/platform-package', packed('@deepseek-ai/platform-package')],
      ['@deepseek-ai/unused', packed('@deepseek-ai/unused')],
    ])
    expect(selectDesktopPackageClosure(available).map(entry => entry.manifest.name)).toEqual([
      '@astro-one/base',
      '@astro-one/cli',
      '@astro-one/cordis',
      '@astro-one/desktop-host',
      '@deepseek-ai/platform-package',
    ])
  })

  it.each([
    '@astro-one/base', '@astro-one/cordis', '@astro-one/node-addon-system',
  ])('rejects required prepared package %s absent from the packed release inputs', (dependency) => {
    const available = new Map<string, PackedDesktopPackage>([
      ['@astro-one/cli', packed('@astro-one/cli', {
        dependencies: { [dependency]: '^1.0.0' },
      })],
      ['@astro-one/desktop-host', packed('@astro-one/desktop-host', {
        dependencies: { '@astro-one/cli': '^1.0.0' },
      })],
    ])
    expect(() => selectDesktopPackageClosure(available)).toThrow(/unpacked package/u)
    expect(() => selectDesktopPackageClosure(new Map([
      ['@astro-one/cli', packed('@astro-one/cli')],
    ]))).toThrow(/omit @astro-one\/desktop-host/u)
  })

  it('leaves independently published Office packages to npm resolution', () => {
    const available = new Map<string, PackedDesktopPackage>([
      ['@astro-one/cli', packed('@astro-one/cli', {
        dependencies: {
          '@deepseek-ai/libreoffice-kit': '0.0.1',
          '@deepseek-ai/libreoffice-kit-wasm': '0.0.1',
        },
      })],
      ['@astro-one/desktop-host', packed('@astro-one/desktop-host')],
    ])
    expect(selectDesktopPackageClosure(available).map(entry => entry.manifest.name)).toEqual([
      '@astro-one/cli', '@astro-one/desktop-host',
    ])
  })

  it('requires the Desktop Host entry', () => {
    const files = [
      'package/lib/index.js',
    ]
    expect(() => {
      assertDesktopHostPackageFiles(files)
    }).not.toThrow()
    expect(() => {
      assertDesktopHostPackageFiles(files.slice(1))
    }).toThrow(/lib\/index\.js/u)
  })
})
