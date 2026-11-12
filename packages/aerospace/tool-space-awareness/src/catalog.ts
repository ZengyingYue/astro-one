/**
 * Element-set catalogs: parsing of TLE text and CCSDS OMM JSON, bounded reads of workspace
 * catalog files through `ctx.fs`, and the ESA orbit-class taxonomy of each object.
 * @module @astro-one/tool-space-awareness/catalog
 */

import {
  DEG, gcrfToGeodetic, OMEGA_EARTH, ommFromRecord, parseOmm, parseTle, propagateSgp4, R_EARTH, sgp4MeanElements, temeToGcrf,
} from '@astro-one/astrodynamics'
import type { Sgp4Elements, Sgp4MeanElements, TimedState } from '@astro-one/astrodynamics'
import type { Context } from '@astro-one/cordis'
import type {} from '@astro-one/fs'
import type { ToolRunContext } from '@astro-one/tools'

/** One catalog object. */
export interface CatalogObject {
  /** Name line, OMM OBJECT_NAME, or the catalog number when the source names nothing. */
  readonly name: string
  /** Catalog number, zero-padded to five characters. */
  readonly catalogNumber: string
  /** Parsed element set. */
  readonly elements: Sgp4Elements
  /** SGP4 mean elements of the set. */
  readonly mean: Sgp4MeanElements
}

/** A catalog entry that did not yield a usable element set. */
export interface RejectedEntry {
  /** One-based entry position in the file. */
  readonly entry: number
  /** Entry name when known. */
  readonly name: string
  /** Parse or initialization failure. */
  readonly reason: string
}

/** Parsed catalog. */
export interface ParsedCatalog {
  /** Usable objects in file order. */
  readonly objects: CatalogObject[]
  /** Entries that failed to parse. */
  readonly rejected: RejectedEntry[]
}

/** Catalog file and size bounds. */
export interface CatalogBounds {
  /** Largest file size read, bytes. */
  readonly maxFileBytes: number
  /** Largest number of entries accepted. */
  readonly maxCatalogObjects: number
}

/**
 * Build a catalog object from an element set.
 * @param name - object name.
 * @param elements - element set.
 * @returns the catalog object.
 */
export function catalogObject(name: string, elements: Sgp4Elements): CatalogObject {
  return { name, catalogNumber: elements.catalogNumber.padStart(5, '0'), elements, mean: sgp4MeanElements(elements) }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Parse a catalog from TLE text or OMM JSON.
 * @param text - file contents.
 * @param maxObjects - largest entry count accepted.
 * @returns usable objects and rejected entries.
 * @throws When the text holds no entry, more entries than the bound, or malformed JSON.
 */
export function parseCatalog(text: string, maxObjects: number): ParsedCatalog {
  const catalog: ParsedCatalog = { objects: [], rejected: [] }
  let entries = 0
  const add = (name: string | undefined, parse: () => { name: string; elements: Sgp4Elements }): void => {
    entries += 1
    if (entries > maxObjects) throw new Error(`the catalog holds more than ${String(maxObjects)} entries`)
    try {
      const parsed = parse()
      catalog.objects.push(catalogObject(name ?? parsed.name, parsed.elements))
    } catch (error) {
      catalog.rejected.push({ entry: entries, name: name ?? '', reason: (error as Error).message })
    }
  }
  const trimmed = text.trimStart()
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    const parsed: unknown = JSON.parse(trimmed)
    const records: unknown[] = Array.isArray(parsed) ? parsed : [parsed]
    for (const record of records) {
      const fields = isRecord(record) ? record : undefined
      add(typeof fields?.OBJECT_NAME === 'string' ? fields.OBJECT_NAME : undefined, () => {
        if (fields === undefined) throw new Error('OMM record must be a JSON object')
        const omm = ommFromRecord(fields)
        return { name: omm.OBJECT_NAME, elements: parseOmm(omm) }
      })
    }
  } else {
    const lines = text.split('\n').map(line => line.trimEnd())
    let name: string | undefined
    for (let k = 0; k < lines.length; k++) {
      const line = lines[k] as string
      if (line.trim() === '') continue
      const next = lines[k + 1] ?? ''
      if (line.startsWith('1 ') && next.startsWith('2 ')) {
        add(name, () => {
          const elements = parseTle(line, next)
          return { name: elements.catalogNumber, elements }
        })
        name = undefined
        k += 1
      } else if (line.startsWith('1 ') || line.startsWith('2 ')) {
        add(name, () => { throw new Error(`line ${String(k + 1)} is a TLE line ${line[0] as string} without its partner`) })
        name = undefined
      } else {
        name = line.replace(/^0 /, '').trim()
      }
    }
  }
  if (entries === 0) throw new Error('the catalog holds no element sets')
  return catalog
}

/**
 * Read and parse a workspace catalog file.
 * @param ctx - context carrying `ctx.fs`.
 * @param exec - tool execution (session workspace and cancellation).
 * @param path - model-supplied path.
 * @param bounds - file and entry bounds.
 * @returns the parsed catalog.
 */
export async function readCatalog(ctx: Context, exec: ToolRunContext, path: string, bounds: CatalogBounds): Promise<ParsedCatalog> {
  const cwd = exec.agent?.session.header.cwd
  const target = await ctx.fs.resolve(path, { ...cwd !== undefined ? { cwd } : {}, signal: exec.signal })
  if ((await ctx.fs.stat(target, exec.signal))?.type !== 'file') throw new Error(`cannot read "${target.displayPath}": not a regular file`)
  const text = new TextDecoder().decode(await ctx.fs.readBytes(target, exec.signal, bounds.maxFileBytes))
  try {
    return parseCatalog(text, bounds.maxCatalogObjects)
  } catch (error) {
    throw new Error(`${target.displayPath}: ${(error as Error).message}`)
  }
}

/** ESA orbit classes, in the order their definitions are tested. */
export const REGIMES = ['GEO', 'IGO', 'EGO', 'NSO', 'GTO', 'MEO', 'GHO', 'LEO', 'HAO', 'MGO', 'HEO', 'LMO', 'UFO'] as const

/** One ESA orbit class. */
export type Regime = typeof REGIMES[number]

/**
 * Classify mean elements with the orbit classes of ESA's Annual Space Environment Report.
 * @param mean - SGP4 mean elements.
 * @returns the first matching class, or UFO when none matches.
 */
export function orbitRegime(mean: Sgp4MeanElements): Regime {
  const hp = mean.a * (1 - mean.e) - R_EARTH
  const ha = mean.a * (1 + mean.e) - R_EARTH
  const i = mean.i / DEG
  const inside = (x: number, lo: number, hi: number): boolean => x >= lo && x <= hi
  const geoBand = inside(mean.a, 37948, 46380) && mean.e <= 0.25
  if (i <= 25 && inside(hp, 35586, 35986) && inside(ha, 35586, 35986)) return 'GEO'
  if (geoBand) return i > 25 ? 'IGO' : 'EGO'
  if (inside(i, 50, 70) && inside(hp, 18100, 24300) && inside(ha, 18100, 24300)) return 'NSO'
  if (i <= 90 && hp <= 2000 && inside(ha, 31570, 40002)) return 'GTO'
  if (inside(hp, 2000, 31570) && inside(ha, 2000, 31570)) return 'MEO'
  if (inside(hp, 31570, 40002) && ha > 40002) return 'GHO'
  if (hp <= 2000 && ha <= 2000) return 'LEO'
  if (hp > 40002 && ha > 40002) return 'HAO'
  if (inside(hp, 2000, 31570) && inside(ha, 31570, 40002)) return 'MGO'
  if (hp <= 31570 && ha > 40002) return 'HEO'
  if (hp <= 2000 && inside(ha, 2000, 31570)) return 'LMO'
  return 'UFO'
}

/** Geosynchronous station-keeping view of one object. */
export interface GeoView {
  /** Sub-satellite east longitude at the set epoch, deg in (-180, 180]. */
  readonly longitudeDeg: number
  /** Mean longitude drift, deg/day (positive eastward). */
  readonly driftDegPerDay: number
}

/**
 * Longitude and drift of a geosynchronous-band object.
 * @param object - catalog object.
 * @returns the view at the set epoch.
 */
export function geoView(object: CatalogObject): GeoView {
  const epoch = object.elements.epoch
  const state = propagateSgp4(object.elements, [epoch])[0] as TimedState
  return {
    longitudeDeg: gcrfToGeodetic(temeToGcrf(state, epoch).r, epoch).lon / DEG,
    driftDegPerDay: ((object.mean.meanAnomalyRate + object.mean.argpRate + object.mean.raanRate - OMEGA_EARTH) * 86400) / DEG,
  }
}
