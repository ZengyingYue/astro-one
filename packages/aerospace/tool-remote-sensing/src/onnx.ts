/**
 * ONNX Runtime (CPU) backing for the {@link Detector} interface. The session loads lazily on
 * the first call and is released by the owner.
 * @module @astro-one/tool-remote-sensing/onnx
 */

import { InferenceSession, Tensor } from 'onnxruntime-node'
import type { Detector } from './detect.ts'

/** A detector whose ONNX session can be released. */
export interface OnnxDetector extends Detector {
  /** Release the native session if it was created. */
  release(): Promise<void>
}

/**
 * Create a lazily loaded ONNX detector.
 * @param modelPath - absolute path of an exported YOLO OBB model (`[1, 3, S, S]` input).
 * @param inputSize - square input size S.
 * @param classNames - class names in model order.
 * @returns detector.
 */
export function onnxDetector(modelPath: string, inputSize: number, classNames: readonly string[]): OnnxDetector {
  let session: Promise<InferenceSession> | undefined
  const load = (): Promise<InferenceSession> => {
    session ??= InferenceSession.create(modelPath)
    return session
  }
  return {
    inputSize,
    classNames,
    async run(input) {
      const s = await load()
      const feeds = { [s.inputNames[0] as string]: new Tensor('float32', input, [1, 3, inputSize, inputSize]) }
      const result = await s.run(feeds)
      const out = result[s.outputNames[0] as string] as Tensor
      return { data: out.data as Float32Array, dims: out.dims }
    },
    async release() {
      if (session === undefined) return
      const s = await session
      session = undefined
      await s.release()
    },
  }
}
