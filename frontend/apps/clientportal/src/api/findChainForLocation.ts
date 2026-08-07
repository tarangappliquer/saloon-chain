import { catalogApi } from './client';
import type { Chain, Location } from './types';

export interface ChainLocationMatch {
  chain: Chain;
  locations: Location[];
}

// Resolves which chain owns a given location id. Chains are few, so every chain's locations are
// fetched in parallel rather than probing chain-by-chain with a sequential await in a loop.
export async function findChainForLocation(chains: Chain[], locationId: number): Promise<ChainLocationMatch | null> {
  const results = await Promise.all(
    chains.map(async (chain) => {
      const { data } = await catalogApi.apiCatalogLocationsGet(chain.id);
      return { chain, locations: data as unknown as Location[] };
    }),
  );
  return results.find((r) => r.locations.some((l) => l.id === locationId)) ?? null;
}
