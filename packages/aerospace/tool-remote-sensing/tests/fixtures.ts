// Test fixtures: 8-bit GeoTIFFs, PNGs, and a hand-encoded ONNX model whose single output is a
// constant YOLO-OBB tensor, so the ONNX Runtime path runs without shipping model weights.
import { writeArrayBuffer } from 'geotiff'
import sharp from 'sharp'

/** Encode an 8-bit multi-band GeoTIFF (UTM zone 50N, 10 m pixels). */
export function geotiff(
  width: number, height: number, bands: ((x: number, y: number) => number)[], georef = true, noData?: number,
): Uint8Array {
  const values: number[] = []
  const clamp = (v: number): number => Math.max(0, Math.min(255, Math.round(v)))
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) for (const b of bands) values.push(clamp(b(x, y)))
  const meta: Record<string, unknown> = { width, height, SamplesPerPixel: bands.length }
  const utm = {
    ModelPixelScale: [10, 10, 0],
    ModelTiepoint: [0, 0, 0, 500000, 4400000, 0],
    ProjectedCSTypeGeoKey: 32650,
    GTModelTypeGeoKey: 1,
  }
  if (georef) Object.assign(meta, utm)
  if (noData !== undefined) meta.GDAL_NODATA = String(noData)
  return new Uint8Array(writeArrayBuffer(values, meta))
}

/** Encode an RGB PNG. */
export async function png(width: number, height: number, rgb: (x: number, y: number) => [number, number, number]): Promise<Uint8Array> {
  const raw = Buffer.alloc(width * height * 3)
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) raw.set(rgb(x, y), (y * width + x) * 3)
  return new Uint8Array(await sharp(raw, { raw: { width, height, channels: 3 } }).png().toBuffer())
}

function varint(n: number): number[] {
  const out: number[] = []
  let v = n
  while (v > 127) {
    out.push((v & 127) | 128)
    v = Math.floor(v / 128)
  }
  out.push(v)
  return out
}

function field(num: number, wire: number, payload: number[]): number[] {
  return [...varint((num << 3) | wire), ...payload]
}

function bytes(num: number, data: number[]): number[] {
  return field(num, 2, [...varint(data.length), ...data])
}

function str(num: number, s: string): number[] {
  return bytes(num, [...Buffer.from(s, 'utf8')])
}

function int(num: number, v: number): number[] {
  return field(num, 0, varint(v))
}

function valueInfo(name: string, dims: number[]): number[] {
  const shape = dims.flatMap(d => bytes(1, int(1, d)))
  const tensor = [...int(1, 1), ...bytes(2, shape)]
  return [...str(1, name), ...bytes(2, bytes(1, tensor))]
}

/**
 * An ONNX model with input `images` [1, 3, size, size] and output `output` equal to a constant
 * [1, channels, anchors] tensor.
 */
export function constantModel(size: number, output: number[][]): Uint8Array {
  const channels = output.length
  const anchors = (output[0] as number[]).length
  const raw = Buffer.alloc(4 * channels * anchors)
  output.forEach((row, c) => {
    row.forEach((v, j) => {
      raw.writeFloatLE(v, 4 * (c * anchors + j))
    })
  })
  const tensor = [...int(1, 1), ...int(1, channels), ...int(1, anchors), ...int(2, 1), ...str(8, 'det'), ...bytes(9, [...raw])]
  const node = [...str(1, 'det'), ...str(2, 'output'), ...str(4, 'Identity')]
  const graph = [
    ...bytes(1, node), ...str(2, 'constant-obb'), ...bytes(5, tensor),
    ...bytes(11, valueInfo('images', [1, 3, size, size])), ...bytes(12, valueInfo('output', [1, channels, anchors])),
  ]
  const opset = [...str(1, ''), ...int(2, 17)]
  return new Uint8Array([...int(1, 8), ...bytes(7, graph), ...bytes(8, opset)])
}
