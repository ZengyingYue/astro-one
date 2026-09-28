/**
 * TypeScript client SDK for the Astro One runtime: spawn the
 * same-version `astro-one --profile sdk` runtime as a subprocess and drive agent
 * turns over stdio JSON-RPC. `AstroOne` is the high-level run API;
 * `HarnessClient` is the lower-level protocol client. A pure library — it
 * registers nothing on a Cordis context; named profiles and ordered patch
 * files customize the runtime process it spawns.
 *
 * @module @astro-one/sdk-client
 */

export { AstroOne, HarnessSession } from './api.ts'
export type { RunOptions } from './api.ts'
export {
  HarnessClient,
  RequestTimeoutError,
  SdkProtocolError,
  TransportClosedError,
} from './client.ts'
export type { NotificationSubscription } from './client.ts'
export { JsonRpcResponseError } from '@astro-one/sdk-protocol'
export type {
  ContentBlock,
  SdkPromptContentBlock,
  AstroOneOptions,
  HarnessClientOptions,
  HarnessNotification,
  NotificationFilter,
  RunResult,
} from './types.ts'
