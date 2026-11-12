/**
 * Bounded text reads of model-named files through the `ctx.fs` seam, relative to the calling
 * session's workspace.
 * @module @astro-one/tool-gnss/files
 */

import type { Context } from '@astro-one/cordis'
import type {} from '@astro-one/fs'
import type { ToolRunContext } from '@astro-one/tools'

/**
 * Read a whole text file.
 * @param ctx - context carrying `ctx.fs`.
 * @param exec - tool execution (session cwd and cancellation).
 * @param path - model-supplied path.
 * @param maxBytes - inclusive size cap.
 * @returns the decoded text.
 * @throws When the file is missing, not a regular file, or larger than the cap.
 */
export async function readTextFile(ctx: Context, exec: ToolRunContext, path: string, maxBytes: number): Promise<string> {
  const cwd = exec.agent?.session.header.cwd
  const target = await ctx.fs.resolve(path, { ...cwd !== undefined ? { cwd } : {}, signal: exec.signal })
  const info = await ctx.fs.stat(target, exec.signal)
  if (info?.type !== 'file') throw new Error(`cannot read "${target.displayPath}": not a regular file`)
  const bytes = await ctx.fs.readBytes(target, exec.signal, maxBytes)
  return new TextDecoder().decode(bytes)
}
