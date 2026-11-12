import {
  createSnapshotStore, type SnapshotStore,
} from '@astro-one/client-store'

/**
 * Create the browser-wide trajectory duration preference source.
 * @returns a persisted source shared by every session view in one plugin lifecycle.
 */
export function createTrajectoryDurationStore(): SnapshotStore<boolean> {
  return createSnapshotStore(false, {
    persist: { name: 'astro-one.trajectory.duration' },
  })
}
