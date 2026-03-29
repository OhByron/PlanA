import type { ShapeConfig } from './shapes';

export interface SyncClientConfig {
  /** Base URL of the Electric SQL sync service, e.g. http://localhost:3000 */
  url: string;
}

export interface ShapeStream<T> {
  /** Subscribe to shape data. Returns an unsubscribe function. */
  subscribe: (callback: (rows: T[]) => void) => () => void;
}

export interface SyncClient {
  subscribeToShape<T>(config: ShapeConfig): ShapeStream<T>;
}

/**
 * Creates a sync client backed by Electric SQL's HTTP streaming API.
 *
 * Phase 0: abstraction stub — wires up to Electric SQL client in Phase 1.
 * The shape subscription model is compatible with @electric-sql/client.
 */
export function createSyncClient(config: SyncClientConfig): SyncClient {
  return {
    subscribeToShape<T>(shapeConfig: ShapeConfig): ShapeStream<T> {
      return {
        subscribe(callback: (rows: T[]) => void): () => void {
          // TODO Phase 1: implement Electric SQL HTTP streaming subscription
          // Reference: https://electric-sql.com/docs/api/clients/typescript
          void config;
          void shapeConfig;
          void callback;
          return () => {};
        },
      };
    },
  };
}
