/**
 * Raster decoding: GeoTIFF (including Cloud-Optimized GeoTIFF) through geotiff.js with
 * georeferencing and no-data metadata, and PNG/JPEG/WebP through sharp. Every band is exposed
 * as a Float32Array in row-major order.
 * @module @astro-one/tool-remote-sensing/raster
 */

import { fromArrayBuffer } from 'geotiff'
import sharp from 'sharp'

/** Affine georeferencing of a north-up raster. */
export interface Georeference {
  /** Map coordinates of the upper-left corner of the upper-left pixel. */
  readonly origin: readonly [number, number]
  /** Pixel size in map units; the y component is negative for north-up rasters. */
  readonly pixelSize: readonly [number, number]
  /** EPSG code of the projected or geographic CRS, when the GeoKeys name one. */
  readonly epsg: number | null
  /** Whether the CRS is geographic (degrees) rather than projected. */
  readonly geographic: boolean
}

/** Decoded raster. */
export interface Raster {
  readonly width: number
  readonly height: number
  /** One array per band, length width × height. */
  readonly bands: Float32Array[]
  /** No-data value declared by the file (GDAL_NODATA), or null. */
  readonly noData: number | null
  /** Georeferencing, or null for plain images and TIFFs without geotags. */
  readonly geo: Georeference | null
}

function isTiff(bytes: Uint8Array): boolean {
  return (bytes[0] === 0x49 && bytes[1] === 0x49 && bytes[2] === 0x2a) || (bytes[0] === 0x4d && bytes[1] === 0x4d && bytes[3] === 0x2a)
}

/**
 * Decode a raster file.
 * @param bytes - file content.
 * @param maxPixels - largest accepted width × height.
 * @returns the raster.
 * @throws When the format is unsupported or the image exceeds `maxPixels`.
 */
export async function decodeRaster(bytes: Uint8Array, maxPixels: number): Promise<Raster> {
  if (isTiff(bytes)) {
    const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
    const image = await (await fromArrayBuffer(buffer)).getImage()
    const width = image.getWidth()
    const height = image.getHeight()
    checkSize(width, height, maxPixels)
    const rasters = await image.readRasters()
    const bands = Array.from({ length: rasters.length }, (_, b) => Float32Array.from(rasters[b] as ArrayLike<number>))
    let geo: Georeference | null = null
    const keys = image.getGeoKeys() as Record<string, number | undefined> | null
    if (keys !== null) {
      const [ox, oy] = image.getOrigin()
      const [sx, sy] = image.getResolution()
      const geographic = keys.GTModelTypeGeoKey === 2
      const code = geographic ? keys.GeographicTypeGeoKey : keys.ProjectedCSTypeGeoKey
      // 32767 marks a user-defined CRS; files may also omit the key (the test writer cannot).
      /* v8 ignore next */
      const epsg = code === undefined || code === 32767 ? null : code
      geo = { origin: [ox as number, oy as number], pixelSize: [sx as number, sy as number], epsg, geographic }
    }
    return { width, height, bands, noData: image.getGDALNoData(), geo }
  }
  let decoded: { data: Buffer; info: { width: number; height: number; channels: number } }
  try {
    decoded = await sharp(bytes).raw().toBuffer({ resolveWithObject: true })
  } catch (error) {
    throw new Error(`unsupported raster format (expected GeoTIFF, PNG, JPEG, or WebP): ${(error as Error).message}`)
  }
  const { width, height, channels } = decoded.info
  checkSize(width, height, maxPixels)
  const bands = Array.from({ length: channels }, () => new Float32Array(width * height))
  for (let i = 0; i < width * height; i++) {
    for (let c = 0; c < channels; c++) (bands[c] as Float32Array)[i] = decoded.data[i * channels + c] as number
  }
  return { width, height, bands, noData: null, geo: null }
}

function checkSize(width: number, height: number, maxPixels: number): void {
  if (width * height > maxPixels) throw new Error(`the image has ${String(width * height)} pixels; at most ${String(maxPixels)} are allowed`)
}

/**
 * Map coordinates of a (fractional) pixel position.
 * @param geo - georeference.
 * @param col - column, pixels from the left edge.
 * @param row - row, pixels from the top edge.
 * @returns x and y in map units.
 */
export function pixelToMap(geo: Georeference, col: number, row: number): [number, number] {
  return [geo.origin[0] + col * geo.pixelSize[0], geo.origin[1] + row * geo.pixelSize[1]]
}

/**
 * Ground area of one pixel.
 * @param geo - georeference.
 * @returns area in square map units.
 */
export function pixelArea(geo: Georeference): number {
  return Math.abs(geo.pixelSize[0] * geo.pixelSize[1])
}
