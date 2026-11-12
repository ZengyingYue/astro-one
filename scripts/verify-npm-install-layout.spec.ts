import { describe, expect, it } from 'vitest'
import type { NpmPackageLock, RegistryIndex } from './benchmark-npm-resolution.ts'
import {
  assertDualAstroOneInstallLayout,
  assertResolutionWorkBudget,
  buildDualAstroOneRegistry,
  MAX_RESOLUTION_WORK_UNITS,
} from './verify-npm-install-layout.ts'

function validLayout(): NpmPackageLock {
  return {
    lockfileVersion: 3,
    packages: {
      '': { dependencies: { '@astro-one/cli': '0.2.0', 'astro-one-previous': 'npm:@astro-one/cli@0.1.0' } },
      'node_modules/@astro-one/cordis': { version: '4.0.1' },
      'node_modules/@astro-one/cli': {
        version: '0.2.0',
        dependencies: { '@astro-one/child': '^0.2.0' },
        peerDependencies: { '@astro-one/cordis': '^4.0.1' },
      },
      'node_modules/@astro-one/child': {
        version: '0.2.0',
        dependencies: { '@astro-one/leaf': '^0.2.0' },
      },
      'node_modules/@astro-one/leaf': { version: '0.2.0' },
      'node_modules/astro-one-previous': {
        name: '@astro-one/cli',
        version: '0.1.0',
        dependencies: { '@astro-one/child': '^0.1.0' },
        peerDependencies: { '@astro-one/cordis': '^4.0.1' },
      },
      'node_modules/astro-one-previous/node_modules/@astro-one/child': {
        version: '0.1.0',
        dependencies: { '@astro-one/leaf': '^0.1.0' },
      },
      'node_modules/astro-one-previous/node_modules/@astro-one/leaf': { version: '0.1.0' },
    },
  }
}

describe('npm install layout verifier', () => {
  it('creates two incompatible versions of every Astro One package', () => {
    const index: RegistryIndex = new Map([
      ['@astro-one/cli', new Map([['0.1.1-rc.2', {
        name: '@astro-one/cli',
        version: '0.1.1-rc.2',
        dependencies: { '@astro-one/child': '^0.1.1-rc.2' },
        peerDependencies: { '@astro-one/cordis': '^4.0.1' },
      }]])],
      ['@astro-one/child', new Map([['0.1.1-rc.2', {
        name: '@astro-one/child',
        version: '0.1.1-rc.2',
      }]])],
      ['@astro-one/cordis', new Map([['4.0.1', {
        name: '@astro-one/cordis',
        version: '4.0.1',
      }]])],
    ])

    const dual = buildDualAstroOneRegistry(index, '0.1.1-rc.2')

    expect([...dual.get('@astro-one/cli')?.keys() ?? []]).toEqual(['0.1.0', '0.2.0'])
    expect(dual.get('@astro-one/cli')?.get('0.1.0')).toMatchObject({
      version: '0.1.0',
      dependencies: { '@astro-one/child': '^0.1.0' },
      peerDependencies: { '@astro-one/cordis': '^4.0.1' },
    })
    expect(dual.get('@astro-one/cli')?.get('0.2.0')).toMatchObject({
      version: '0.2.0',
      dependencies: { '@astro-one/child': '^0.2.0' },
    })
    expect(dual.get('@astro-one/cordis')).toBe(index.get('@astro-one/cordis'))
  })

  it('accepts isolated Astro One releases with one shared Cordis installation', () => {
    expect(assertDualAstroOneInstallLayout(validLayout())).toEqual({
      astroOnePackagesPerVersion: 3,
      checkedAstroOneEdges: 4,
    })
  })

  it.each([
    ['react', 'node_modules/react'],
    ['react-dom', 'node_modules/react-dom'],
    ['react', 'node_modules/astro-one-previous/node_modules/react'],
    ['react-dom', 'node_modules/astro-one-previous/node_modules/react-dom'],
  ])('rejects browser runtime %s installed at %s in the Astro One-only consumer', (name, path) => {
    const layout = validLayout()
    const packages = { ...layout.packages, [path]: { version: '18.3.1' } }
    expect(() => assertDualAstroOneInstallLayout({ ...layout, packages })).toThrow(
      `${path}: ${name} is a browser build input`,
    )
  })

  it('rejects an internal edge that crosses release versions', () => {
    const layout = validLayout()
    const packages = { ...layout.packages }
    Reflect.deleteProperty(packages, 'node_modules/astro-one-previous/node_modules/@astro-one/leaf')

    expect(() => assertDualAstroOneInstallLayout({ ...layout, packages })).toThrow(
      'node_modules/astro-one-previous/node_modules/@astro-one/child: dependencies '
      + '@astro-one/leaf resolves to node_modules/@astro-one/leaf@0.2.0, expected 0.1.0',
    )
  })

  it('rejects a second Cordis installation', () => {
    const layout = validLayout()
    const packages = {
      ...layout.packages,
      'node_modules/astro-one-previous/node_modules/@astro-one/cordis': { version: '4.0.1' },
    }

    expect(() => assertDualAstroOneInstallLayout({ ...layout, packages })).toThrow(
      'expected one shared @astro-one/cordis',
    )
  })
})

describe('resolution work budget', () => {
  it.each([
    [277, 2524, 699_148],
    [316, 2780, 878_480],
    [316, 2786, 880_376],
    [317, 2786, 883_162],
    [320, 2836, 907_520],
  ])('accepts the measured dual-release graph with %i packages and %i edges', (packages, edges, units) => {
    expect(assertResolutionWorkBudget({ astroOnePackagesPerVersion: packages, checkedAstroOneEdges: edges }))
      .toBe(units)
  })

  it('accepts a graph exactly at the budget and rejects one internal edge above it', () => {
    const packages = 320
    const edgesAtBudget = Math.floor(MAX_RESOLUTION_WORK_UNITS / packages)

    expect(packages * edgesAtBudget).toBe(MAX_RESOLUTION_WORK_UNITS)
    expect(assertResolutionWorkBudget({ astroOnePackagesPerVersion: packages, checkedAstroOneEdges: edgesAtBudget }))
      .toBe(MAX_RESOLUTION_WORK_UNITS)
    expect(() => assertResolutionWorkBudget({
      astroOnePackagesPerVersion: packages,
      checkedAstroOneEdges: edgesAtBudget + 1,
    })).toThrow(`= ${String(MAX_RESOLUTION_WORK_UNITS + packages)} unit(s), budget ${String(MAX_RESOLUTION_WORK_UNITS)} unit(s)`)
  })

  it('accepts the headroom and rejects a runaway graph with its own measured counts', () => {
    expect(assertResolutionWorkBudget({ astroOnePackagesPerVersion: 350, checkedAstroOneEdges: 3200 }))
      .toBe(1_120_000)
    expect(() => assertResolutionWorkBudget({ astroOnePackagesPerVersion: 400, checkedAstroOneEdges: 3000 }))
      .toThrow(`400 package(s) per release x 3000 internal edge(s) = 1200000 unit(s), budget ${String(MAX_RESOLUTION_WORK_UNITS)} unit(s)`)
  })
})
