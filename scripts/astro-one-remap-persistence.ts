/**
 * Recompute committed persistence digests after `scripts/astro-one-rename.py` changes their inputs.
 *
 * The rename rewrites the digest domain strings and any names inside schema nodes, so every node key, root digest,
 * and finalization record digest in the upstream history stops matching its content. This script rebuilds each
 * committed schema snapshot from its own node graph, applies the old-to-new digest map to the acknowledgement
 * documents, and reseals the finalized checkpoints. `docs/persistence-schema.json` comes from
 * `pnpm run gen-persistence-catalog` instead.
 *
 * Usage: `tsx scripts/astro-one-remap-persistence.ts`, then `pnpm run verify-persistence-changes`.
 */
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { loadPersistenceHistory, parseHistoricalPersistenceSnapshot, type PersistenceHistoryEntry } from './persistence-changes.ts'
import {
  canonicalizeSchema, renderPersistenceSnapshot, SCHEMA_NODE_KEY_LENGTH, schemaDigest, schemaTableEntry,
  type CanonicalSchema, type PersistenceRoot, type PersistenceSchemaInventory, type PersistenceType,
  type SchemaNode, type SerializedSchemaNode,
} from './persistence-schema-model.ts'

const HISTORY = 'docs/persistence-changes'
const CHECKPOINTS = `${HISTORY}/finalized`
/** Shortest hex run treated as a digest prefix; schema node keys and rendered anchors are at least this long. */
const MINIMUM_PREFIX = 12

interface RawSnapshot {
  formatVersion: PersistenceSchemaInventory['formatVersion']
  roots: Omit<PersistenceRoot, 'schema'>[]
  types: Omit<PersistenceType, 'schema'>[]
  nodes: Record<string, SerializedSchemaNode>
}

function tracked(pathspec: string): string[] {
  return execFileSync('git', ['ls-files', '-z', pathspec], { encoding: 'utf8' }).split('\0').filter(path => path !== '')
}

function nodeOf(node: SerializedSchemaNode, index: (key: string) => number): SchemaNode {
  switch (node.kind) {
    case 'array': return { kind: 'array', element: index(node.element) }
    case 'tuple': return { kind: 'tuple', elements: node.elements.map(element => ({ ...element, type: index(element.type) })) }
    case 'object': return {
      kind: 'object',
      properties: node.properties.map(property => ({ ...property, type: index(property.type) })),
      indices: node.indices.map(entry => ({ key: index(entry.key), value: index(entry.value) })),
    }
    case 'union': return { kind: 'union', types: node.types.map(index) }
    default: return node
  }
}

/** Rebuild one snapshot and record every digest it renames. */
function remapSnapshot(path: string, digests: Map<string, string>): void {
  const raw = JSON.parse(readFileSync(path, 'utf8')) as RawSnapshot
  const keys = Object.keys(raw.nodes)
  const positions = new Map(keys.map((key, position) => [key, position]))
  const index = (key: string): number => {
    const position = positions.get(key)
    if (position === undefined) throw new Error(`${path}: unknown schema node ${key}`)
    return position
  }
  const graph = keys.map(key => nodeOf(raw.nodes[key] as SerializedSchemaNode, index))
  const table = new Map<string, SerializedSchemaNode>()
  for (const position of keys.keys()) {
    const [key, node] = schemaTableEntry(graph, position)
    table.set(key, node)
  }
  const remapped = <Entry extends { digest: string }>(entry: Entry): Entry & { schema: CanonicalSchema } => {
    const schema = canonicalizeSchema(graph, index(entry.digest.slice(0, SCHEMA_NODE_KEY_LENGTH)))
    const next = schemaDigest(schema)
    const known = digests.get(entry.digest)
    if (known !== undefined && known !== next) throw new Error(`${path}: digest ${entry.digest} maps to both ${known} and ${next}`)
    digests.set(entry.digest, next)
    return { ...entry, digest: next, schema }
  }
  const inventory: PersistenceSchemaInventory = {
    formatVersion: raw.formatVersion, roots: raw.roots.map(remapped), types: raw.types.map(remapped),
  }
  const text = renderPersistenceSnapshot(inventory, table)
  parseHistoricalPersistenceSnapshot(text)
  writeFileSync(path, text)
}

/** Replace full digests and their rendered prefixes in one document. */
function remapDocument(path: string, prefixes: Map<string, [string, string]>): void {
  const text = readFileSync(path, 'utf8')
  const next = text.replace(/\b[0-9a-f]{12,64}\b/gu, (token) => {
    const entry = prefixes.get(token.slice(0, MINIMUM_PREFIX))
    return entry?.[0].startsWith(token) === true ? entry[1].slice(0, token.length) : token
  })
  if (next !== text) writeFileSync(path, next)
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function identity(root: PersistenceRoot): Record<string, unknown> {
  return { kind: root.kind, digest: root.digest,
    ...(root.event === undefined ? {} : { event: root.event }),
    ...(root.surface === undefined ? {} : { surface: root.surface }) }
}

/** Mirror of the private finalization record digest in `persistence-finalization.ts`. */
function recordDigest(entry: PersistenceHistoryEntry): string {
  const record = entry.record
  const semantic = { record: { schemaVersion: record.schemaVersion, id: record.id, baseline: record.baseline,
    changes: [...record.changes].sort((a, b) => compare(a.root, b.root)).map(change => ({
      root: change.root, previous: change.previous, after: change.after, decision: change.decision,
    })) }, snapshot: { formatVersion: entry.snapshot.formatVersion,
    roots: [...entry.snapshot.roots].sort((a, b) => compare(a.key, b.key)).map(root => ({
      key: root.key, ...identity(root), schema: root.schema,
    })) } }
  return createHash('sha256').update('astro-one-persistence-finalization-record-v1\n').update(JSON.stringify(semantic)).digest('hex')
}

/** Reseal each checkpoint's accepted records against the remapped history. */
function resealCheckpoints(): void {
  const entries = new Map(loadPersistenceHistory('.').entries.map(entry => [entry.record.id, entry]))
  for (const path of tracked(`${CHECKPOINTS}/*.json`)) {
    const checkpoint = JSON.parse(readFileSync(path, 'utf8')) as { acceptedRecords: Record<string, string> }
    for (const id of Object.keys(checkpoint.acceptedRecords)) {
      const entry = entries.get(id)
      if (entry === undefined) throw new Error(`${path}: unknown accepted record ${id}`)
      checkpoint.acceptedRecords[id] = recordDigest(entry)
    }
    writeFileSync(path, `${JSON.stringify(checkpoint, null, 2)}\n`)
  }
}

const digests = new Map<string, string>()
for (const path of tracked(`${HISTORY}/**.schema.json`)) remapSnapshot(path, digests)
const prefixes = new Map([...digests].map(([before, after]) => [before.slice(0, MINIMUM_PREFIX), [before, after] as [string, string]]))
const documents = tracked(`${HISTORY}/**`).filter(path => !path.endsWith('.schema.json') && !path.endsWith('.i18n.yaml'))
for (const path of documents) remapDocument(path, prefixes)
resealCheckpoints()
console.log(`astro-one-remap-persistence: remapped ${String(digests.size)} digests across ${String(documents.length)} documents.`)
