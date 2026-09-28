/**
 * The identity, timestamp, link, mutation, and durability-sink guarantees
 * MemoryVfs owes its consumers, asserted directly rather than through the
 * `node:fs` bridge.
 *
 * `astro-one-fs-local` builds a version token from `dev:ino:size:mtimeNs:ctimeNs` and
 * refuses a write whose token moved since it read. Two properties carry that:
 * `ino` identifies the entry at a path, and `mtimeMs` moves on every write. The
 * timestamp cases freeze the clock, because these writes are in memory and two
 * revisions routinely land in the same millisecond — a real-clock test passes
 * whether or not the strict increment exists.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemoryVfs } from '../../src/storage/memory.ts'
import type { VfsBigIntStats, VfsMutation, VfsMutationSink, VfsStats } from '../../src/storage/types.ts'

const identity = (vfs: MemoryVfs, path: string): bigint =>
  (vfs.statSync(path, { bigint: true }) as VfsBigIntStats).ino

const linkCount = (vfs: MemoryVfs, path: string): bigint =>
  (vfs.statSync(path, { bigint: true }) as VfsBigIntStats).nlink

const modified = (vfs: MemoryVfs, path: string): number => (vfs.statSync(path) as VfsStats).mtimeMs

afterEach(() => { vi.restoreAllMocks() })

describe('entry identity', () => {
  it('distinguishes paths and holds each identity across repeated stats', () => {
    const vfs = new MemoryVfs()
    vfs.seed('/astro-one/one.txt', 'one')
    vfs.seed('/astro-one/two.txt', 'two')
    const first = identity(vfs, '/astro-one/one.txt')
    expect(identity(vfs, '/astro-one/two.txt')).not.toBe(first)
    expect(identity(vfs, '/astro-one/one.txt')).toBe(first)
  })

  it('forgets the identities under a directory removed as a subtree', () => {
    const vfs = new MemoryVfs()
    vfs.seed('/astro-one/skills/git/SKILL.md', '# git\n')
    const before = identity(vfs, '/astro-one/skills/git/SKILL.md')
    vfs.rmSync('/astro-one/skills', { recursive: true })
    vfs.seed('/astro-one/skills/git/SKILL.md', '# git rebuilt\n')
    expect(identity(vfs, '/astro-one/skills/git/SKILL.md')).not.toBe(before)
  })

  it('moves the source identity when a file replaces another path', () => {
    const vfs = new MemoryVfs()
    vfs.seed('/astro-one/from.txt', 'moved')
    vfs.seed('/astro-one/to.txt', 'replaced')
    const [source, destination] = [identity(vfs, '/astro-one/from.txt'), identity(vfs, '/astro-one/to.txt')]
    vfs.renameSync('/astro-one/from.txt', '/astro-one/to.txt')
    const renamed = identity(vfs, '/astro-one/to.txt')
    expect(vfs.readFileSync('/astro-one/to.txt', 'utf8')).toBe('moved')
    expect([renamed === source, renamed === destination]).toEqual([true, false])
  })
})

describe('modification time', () => {
  it('hydrates explicit metadata without confusing timestamps with permission bits', () => {
    const vfs = new MemoryVfs()
    vfs.seed('/astro-one/restored', 'value', { mode: 0o600, mtimeMs: 1_600_000_000_000 })
    vfs.seedDirectory('/astro-one/restored-directory', { mode: 0o700, mtimeMs: 1_600_000_000_001 })
    const stats = vfs.statSync('/astro-one/restored') as VfsStats
    const directory = vfs.statSync('/astro-one/restored-directory') as VfsStats
    expect([stats.mode & 0o777, stats.mtimeMs]).toEqual([0o600, 1_600_000_000_000])
    expect([directory.mode & 0o777, directory.mtimeMs]).toEqual([0o700, 1_600_000_000_001])
  })

  it('advances on every write even while the clock stands still', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000)
    const vfs = new MemoryVfs()
    vfs.seed('/astro-one/log.jsonl', 'first\n')
    const seeded = modified(vfs, '/astro-one/log.jsonl')
    vfs.writeFileSync('/astro-one/log.jsonl', 'second\n')
    const written = modified(vfs, '/astro-one/log.jsonl')
    vfs.appendFileSync('/astro-one/log.jsonl', 'third\n')
    const appended = modified(vfs, '/astro-one/log.jsonl')
    vfs.truncateSync('/astro-one/log.jsonl', 6)
    const truncated = modified(vfs, '/astro-one/log.jsonl')
    expect([written > seeded, appended > written, truncated > appended]).toEqual([true, true, true])
    // One millisecond per revision: the increment is the minimum that separates
    // two tokens, not a coarser bump that would skew a real timestamp.
    expect(truncated - seeded).toBe(3)
  })

  it('takes the clock once the clock has passed the entry', () => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000)
    const vfs = new MemoryVfs()
    vfs.seed('/astro-one/log.jsonl', 'first\n')
    clock.mockReturnValue(1_700_000_005_000)
    vfs.writeFileSync('/astro-one/log.jsonl', 'second\n')
    expect(modified(vfs, '/astro-one/log.jsonl')).toBe(1_700_000_005_000)
  })

  it('extends truncation with zero bytes', async () => {
    const vfs = new MemoryVfs()
    vfs.seed('/astro-one/file', new Uint8Array([1, 2]))
    vfs.truncateSync('/astro-one/file', 5)
    expect([...vfs.readFileSync('/astro-one/file') as Uint8Array]).toEqual([1, 2, 0, 0, 0])
    const handle = vfs.open('/astro-one/file', 'r+')
    await handle.truncate(7)
    expect([...vfs.readFileSync('/astro-one/file') as Uint8Array]).toEqual([1, 2, 0, 0, 0, 0, 0])
  })

  it('advances a directory only when its immediate entry set changes', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000)
    const vfs = new MemoryVfs()
    vfs.seedDirectory('/astro-one/workspace')
    const empty = modified(vfs, '/astro-one/workspace')
    vfs.writeFileSync('/astro-one/workspace/file.txt', 'one')
    const created = modified(vfs, '/astro-one/workspace')
    vfs.writeFileSync('/astro-one/workspace/file.txt', 'two')
    const rewritten = modified(vfs, '/astro-one/workspace')
    vfs.rmSync('/astro-one/workspace/file.txt')
    const removed = modified(vfs, '/astro-one/workspace')
    expect([created > empty, rewritten === created, removed > rewritten]).toEqual([true, true, true])
  })
})

describe('mutation publication', () => {
  it('publishes only committed runtime changes and keeps image seeding silent', () => {
    const vfs = new MemoryVfs()
    const mutations: VfsMutation[] = []
    vfs.subscribe((mutation) => { mutations.push(mutation) })
    vfs.seed('/astro-one/seeded.txt', 'seeded')
    expect(mutations).toEqual([])
    vfs.writeFileSync('/astro-one/seeded.txt', 'changed')
    vfs.mkdirSync('/astro-one/created')
    vfs.chmodSync('/astro-one/created', 0o700)
    vfs.renameSync('/astro-one/seeded.txt', '/astro-one/renamed.txt')
    vfs.rmSync('/astro-one/created', { recursive: true })
    expect(mutations.map(mutation => ({
      kind: mutation.kind,
      path: mutation.path,
      ...mutation.kind === 'write' ? { entryChanged: mutation.entryChanged } : {},
      ...mutation.kind === 'chmod' ? { mode: mutation.mode } : {},
    }))).toEqual([
      { kind: 'write', path: '/astro-one/seeded.txt', entryChanged: false },
      { kind: 'mkdir', path: '/astro-one/created' },
      { kind: 'chmod', path: '/astro-one/created', mode: 0o700 },
      { kind: 'remove', path: '/astro-one/seeded.txt' },
      { kind: 'write', path: '/astro-one/renamed.txt', entryChanged: true },
      { kind: 'remove', path: '/astro-one/created' },
    ])
    const renamed = mutations[4]
    expect(renamed?.kind === 'write' && new TextDecoder().decode(renamed.bytes)).toBe('changed')
    expect(() => { vfs.writeFileSync('/missing/file', 'no') }).toThrow(/ENOENT/)
    expect(mutations).toHaveLength(6)
  })

  it('contains a faulty observer and lets disposal stop later notifications', () => {
    const vfs = new MemoryVfs()
    vfs.seedDirectory('/astro-one')
    const reported = vi.spyOn(console, 'error').mockImplementation(() => {})
    const first = vfs.subscribe(() => { throw new Error('observer failed') })
    const seen: string[] = []
    const second = vfs.subscribe((mutation) => { seen.push(mutation.path) })
    vfs.writeFileSync('/astro-one/one', '1')
    first()
    second()
    vfs.writeFileSync('/astro-one/two', '2')
    expect(seen).toEqual(['/astro-one/one'])
    expect(reported).toHaveBeenCalledOnce()
  })

  it('feeds the same complete mutations to a durable sink and live subscribers', async () => {
    const recorded: VfsMutation[] = []
    let flushes = 0
    const sink: VfsMutationSink = {
      record: (mutation) => { recorded.push(mutation) },
      flush: async () => { flushes += 1 },
    }
    const vfs = new MemoryVfs({ sink })
    vfs.seedDirectory('/astro-one')
    const observed: VfsMutation[] = []
    vfs.subscribe((mutation) => { observed.push(mutation) })
    vfs.writeFileSync('/astro-one/log', 'a')
    vfs.appendFileSync('/astro-one/log', 'bc')
    await vfs.flush()
    expect(observed).toEqual(recorded)
    expect(observed[0]).toBe(recorded[0])
    expect(recorded[0]).toMatchObject({ kind: 'write', path: '/astro-one/log', mode: 0o644, entryChanged: true })
    expect(recorded[1]).toMatchObject({ kind: 'write', path: '/astro-one/log', mode: 0o644, entryChanged: false, appendedFrom: 1 })
    expect(recorded[1]?.kind === 'write' && new TextDecoder().decode(recorded[1].bytes)).toBe('abc')
    expect(flushes).toBe(1)
  })

  it('publishes descriptor writes at the file identity current path', () => {
    const mutations: VfsMutation[] = []
    const vfs = new MemoryVfs()
    vfs.seed('/astro-one/source', 'old')
    const descriptor = vfs.openFileSync('/astro-one/source', 'r+')
    vfs.subscribe((mutation) => { mutations.push(mutation) })
    vfs.renameSync('/astro-one/source', '/astro-one/destination')
    mutations.length = 0
    descriptor.write(0, new TextEncoder().encode('new'))
    expect(mutations.map(mutation => mutation.path)).toEqual(['/astro-one/destination'])
    expect(vfs.readFileSync('/astro-one/destination', 'utf8')).toBe('new')
    vfs.unlinkSync('/astro-one/destination')
    mutations.length = 0
    descriptor.write(0, new TextEncoder().encode('detached'))
    expect(mutations).toEqual([])
    expect(new TextDecoder().decode(descriptor.read(0, descriptor.stat().size))).toBe('detached')
  })

  it('reports the path identity through a BigInt file handle stat', async () => {
    const vfs = new MemoryVfs()
    vfs.seed('/astro-one/session.lock', '')
    const handle = vfs.open('/astro-one/session.lock', 'w')
    const held = await handle.stat({ bigint: true }) as VfsBigIntStats
    const current = vfs.statSync('/astro-one/session.lock', { bigint: true }) as VfsBigIntStats

    expect([held.dev, held.ino]).toEqual([current.dev, current.ino])
    await handle.chmod(0o600)
    expect((vfs.statSync('/astro-one/session.lock') as VfsStats).mode & 0o777).toBe(0o600)
    await handle.close()
  })

  it('decomposes a directory rename into replayable destination state', () => {
    const recorded: VfsMutation[] = []
    const vfs = new MemoryVfs({
      sink: { record: (mutation) => { recorded.push(mutation) }, flush: () => Promise.resolve() },
    })
    vfs.seedDirectory('/astro-one/staging/nested', { mode: 0o700 })
    vfs.seed('/astro-one/staging/nested/file', 'value', { mode: 0o600 })
    vfs.renameSync('/astro-one/staging', '/astro-one/published')

    expect(recorded.map(mutation => [mutation.kind, mutation.path])).toEqual([
      ['remove', '/astro-one/staging'],
      ['mkdir', '/astro-one/published'],
      ['mkdir', '/astro-one/published/nested'],
      ['write', '/astro-one/published/nested/file'],
    ])
    expect(recorded[3]).toMatchObject({ kind: 'write', mode: 0o600, entryChanged: true })
    expect(recorded[3]?.kind === 'write' && new TextDecoder().decode(recorded[3].bytes)).toBe('value')
  })
})

describe('directory rename', () => {
  it('rejects file, non-empty directory, and missing-parent destinations before mutation', () => {
    const vfs = new MemoryVfs()
    vfs.seed('/astro-one/source/nested/file', 'source')
    vfs.seed('/astro-one/file', 'destination')
    vfs.seed('/astro-one/non-empty/child', 'destination')
    const mutations: VfsMutation[] = []
    vfs.subscribe((mutation) => { mutations.push(mutation) })

    expect(() => { vfs.renameSync('/astro-one/source', '/astro-one/file') })
      .toThrow(expect.objectContaining({ code: 'ENOTDIR' }))
    expect(() => { vfs.renameSync('/astro-one/source', '/astro-one/non-empty') })
      .toThrow(expect.objectContaining({ code: 'ENOTEMPTY' }))
    expect(() => { vfs.renameSync('/astro-one/source', '/missing/destination') })
      .toThrow(expect.objectContaining({ code: 'ENOENT' }))

    expect(vfs.readFileSync('/astro-one/source/nested/file', 'utf8')).toBe('source')
    expect(vfs.readFileSync('/astro-one/file', 'utf8')).toBe('destination')
    expect(vfs.readFileSync('/astro-one/non-empty/child', 'utf8')).toBe('destination')
    expect(mutations).toEqual([])
  })

  it('replaces an empty directory with the source subtree', () => {
    const vfs = new MemoryVfs()
    vfs.seedDirectory('/astro-one/source/nested', { mode: 0o700 })
    vfs.seed('/astro-one/source/nested/file', 'source')
    vfs.seedDirectory('/astro-one/destination', { mode: 0o711 })

    vfs.renameSync('/astro-one/source', '/astro-one/destination')

    expect(vfs.existsSync('/astro-one/source')).toBe(false)
    expect(vfs.readFileSync('/astro-one/destination/nested/file', 'utf8')).toBe('source')
    expect((vfs.statSync('/astro-one/destination') as VfsStats).mode & 0o777).toBe(0o755)
    expect((vfs.statSync('/astro-one/destination/nested') as VfsStats).mode & 0o777).toBe(0o700)
  })
})

describe('hard links', () => {
  it('shares identity, bytes, and mode until one name is removed', () => {
    const vfs = new MemoryVfs()
    vfs.seed('/astro-one/session.jsonl', 'committed\n')
    vfs.linkSync('/astro-one/session.jsonl', '/astro-one/session-latest.jsonl')
    vfs.linkSync('/astro-one/session-latest.jsonl', '/astro-one/session-archive.jsonl')
    expect(identity(vfs, '/astro-one/session-latest.jsonl')).toBe(identity(vfs, '/astro-one/session.jsonl'))
    expect(linkCount(vfs, '/astro-one/session.jsonl')).toBe(3n)
    expect(vfs.readFileSync('/astro-one/session-latest.jsonl', 'utf8')).toBe('committed\n')
    const changedPaths: string[] = []
    vfs.subscribe((mutation) => { changedPaths.push(mutation.path) })
    vfs.appendFileSync('/astro-one/session.jsonl', 'appended\n')
    expect(changedPaths).toEqual([
      '/astro-one/session.jsonl',
      '/astro-one/session-latest.jsonl',
      '/astro-one/session-archive.jsonl',
    ])
    expect(vfs.readFileSync('/astro-one/session.jsonl', 'utf8')).toBe('committed\nappended\n')
    expect(vfs.readFileSync('/astro-one/session-latest.jsonl', 'utf8')).toBe('committed\nappended\n')
    vfs.chmodSync('/astro-one/session-latest.jsonl', 0o600)
    expect((vfs.statSync('/astro-one/session.jsonl') as VfsStats).mode & 0o777).toBe(0o600)
    vfs.unlinkSync('/astro-one/session-latest.jsonl')
    expect(linkCount(vfs, '/astro-one/session.jsonl')).toBe(2n)
    vfs.unlinkSync('/astro-one/session-archive.jsonl')
    expect(linkCount(vfs, '/astro-one/session.jsonl')).toBe(1n)
    expect(vfs.readFileSync('/astro-one/session.jsonl', 'utf8')).toBe('committed\nappended\n')
  })

  it('treats rename between names of the same node as a no-op', () => {
    const vfs = new MemoryVfs()
    vfs.seed('/astro-one/source', 'value')
    vfs.linkSync('/astro-one/source', '/astro-one/alias')
    const mutations: VfsMutation[] = []
    vfs.subscribe((mutation) => { mutations.push(mutation) })

    vfs.renameSync('/astro-one/source', '/astro-one/alias')

    expect(vfs.readFileSync('/astro-one/source', 'utf8')).toBe('value')
    expect(vfs.readFileSync('/astro-one/alias', 'utf8')).toBe('value')
    expect(linkCount(vfs, '/astro-one/source')).toBe(2n)
    expect(mutations).toEqual([])
  })

  it('retargets linked names through file replacement and directory moves', () => {
    const vfs = new MemoryVfs()
    vfs.seed('/astro-one/replacement', 'replacement')
    vfs.seed('/astro-one/target', 'old')
    vfs.linkSync('/astro-one/target', '/astro-one/target-alias')
    const replaced = vfs.openFileSync('/astro-one/target', 'r+')
    vfs.renameSync('/astro-one/replacement', '/astro-one/target')
    const mutations: VfsMutation[] = []
    vfs.subscribe((mutation) => { mutations.push(mutation) })

    replaced.write(0, new TextEncoder().encode('changed'))
    expect(mutations.map(mutation => mutation.path)).toEqual(['/astro-one/target-alias'])
    expect(vfs.readFileSync('/astro-one/target', 'utf8')).toBe('replacement')
    expect(vfs.readFileSync('/astro-one/target-alias', 'utf8')).toBe('changed')
    expect(linkCount(vfs, '/astro-one/target-alias')).toBe(1n)

    vfs.seed('/astro-one/tree/file', 'tree')
    vfs.linkSync('/astro-one/tree/file', '/astro-one/outside')
    const moved = vfs.openFileSync('/astro-one/tree/file', 'r+')
    vfs.renameSync('/astro-one/tree', '/astro-one/moved')
    mutations.length = 0
    moved.write(0, new TextEncoder().encode('moved'))
    expect(mutations.map(mutation => mutation.path)).toEqual(['/astro-one/outside', '/astro-one/moved/file'])
    expect(linkCount(vfs, '/astro-one/moved/file')).toBe(2n)

    vfs.rmSync('/astro-one/moved', { recursive: true })
    mutations.length = 0
    moved.write(0, new TextEncoder().encode('kept!'))
    expect(mutations.map(mutation => mutation.path)).toEqual(['/astro-one/outside'])
    expect(vfs.readFileSync('/astro-one/outside', 'utf8')).toBe('kept!')
    expect(linkCount(vfs, '/astro-one/outside')).toBe(1n)
  })

  it('rejects renaming a file over an existing directory', () => {
    const vfs = new MemoryVfs()
    vfs.seed('/astro-one/file', 'value')
    vfs.seedDirectory('/astro-one/directory')
    expect(() => { vfs.renameSync('/astro-one/file', '/astro-one/directory') }).toThrow(expect.objectContaining({ code: 'EISDIR' }))
    expect(vfs.readFileSync('/astro-one/file', 'utf8')).toBe('value')
    expect(vfs.statSync('/astro-one/directory').isDirectory()).toBe(true)
  })
})
