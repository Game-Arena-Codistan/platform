export const NORMALIZED_POSTGRES_MODEL='normalized-postgres-v1';

export function assertNormalizedPostgresRuntime(store,{required=false}={}){
  if(!required)return;
  if(store?.persistenceModel===NORMALIZED_POSTGRES_MODEL)return;
  throw new Error('Normalized PostgreSQL runtime is required for deployed environments. Complete issue #52 and set PostgresStore.persistenceModel to normalized-postgres-v1 only after legacy platform_state persistence has been removed and transactional repository tests pass.');
}
