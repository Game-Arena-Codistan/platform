import {PostgresStore as NormalizedPostgresStore} from './normalized-postgres-store.mjs';

export class PostgresStore extends NormalizedPostgresStore{
  static async connect(options){
    const store=await NormalizedPostgresStore.connect(options);
    store.hitRateLimit=(key,limit,windowMs,now=Date.now())=>{
      const stored=store.rateLimits.get(key);
      const values=Array.isArray(stored)?stored:(stored?.timestamps??[]);
      const recent=values.filter(time=>time>now-windowMs);
      recent.push(now);
      store.rateLimits.set(key,{timestamps:recent});
      return recent.length>limit;
    };
    return store;
  }
}
