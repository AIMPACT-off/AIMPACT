import { randomUUID } from "node:crypto";

export class StoreUnavailableError extends Error {
  constructor(message = "Persistent execution store unavailable") {
    super(message); this.name = "StoreUnavailableError"; this.status = 503; this.code = "EXECUTION_STORE_UNAVAILABLE";
  }
}
function required(value, name) { if (!value) throw new TypeError(name + " is required"); return value; }

export class UpstashRedisAdapter {
  constructor({ url, token, fetchImpl = fetch, namespace = "aimpact:v1" }) {
    this.url = required(url, "Upstash URL").replace(/\/$/, "");
    this.token = required(token, "Upstash token");
    this.fetchImpl = fetchImpl; this.namespace = namespace;
  }
  async command(...args) {
    try {
      const response = await this.fetchImpl(this.url, {
        method: "POST", headers: { Authorization: "Bearer " + this.token, "Content-Type": "application/json" },
        body: JSON.stringify(args)
      });
      if (!response.ok) throw new Error("Redis HTTP " + response.status);
      const body = await response.json();
      if (body.error) throw new Error(body.error);
      return body.result;
    } catch (error) { throw new StoreUnavailableError(error.message); }
  }
  async withLock(key, operation, { ttlMs = 30000, signal, heartbeatMs = 10000, onLockLost } = {}) {
    const lockKey = this.namespace + ":lock:" + key, owner = randomUUID();
    const claimed = await this.command("SET", lockKey, owner, "NX", "PX", String(ttlMs));
    if (claimed !== "OK") return { acquired: false };
    let heartbeatError = null;
    const heartbeat = setInterval(() => {
      void this.command("EVAL", "if redis.call('get',KEYS[1])==ARGV[1] then return redis.call('pexpire',KEYS[1],ARGV[2]) else return 0 end", "1", lockKey, owner, String(ttlMs))
        .then(ok => { if (Number(ok) !== 1) throw new Error("Redis lock ownership lost"); })
        .catch(error => { heartbeatError = error; onLockLost?.(error); });
    }, heartbeatMs);
    heartbeat.unref?.();
    try {
      const result = await operation();
      if (heartbeatError) throw new StoreUnavailableError(heartbeatError.message);
      return { acquired: true, result };
    } finally {
      clearInterval(heartbeat);
      await this.command("EVAL", "if redis.call('get',KEYS[1])==ARGV[1] then return redis.call('del',KEYS[1]) else return 0 end", "1", lockKey, owner);
    }
  }
  async claimIdempotency(key, contextHash, ttlSeconds = 86400) {
    const redisKey = this.namespace + ":idem:" + key;
    const result = await this.command("SET", redisKey, JSON.stringify({ contextHash, state: "RUNNING" }), "NX", "EX", String(ttlSeconds));
    return result === "OK";
  }
  async readIdempotency(key) {
    const raw = await this.command("GET", this.namespace + ":idem:" + key);
    return raw ? JSON.parse(raw) : null;
  }
  async completeIdempotency(key, contextHash, result, ttlSeconds = 86400) {
    await this.command("SET", this.namespace + ":idem:" + key, JSON.stringify({ contextHash, state: "COMPLETED", result }), "EX", String(ttlSeconds));
  }
  async releaseIdempotency(key, contextHash) {
    const redisKey = this.namespace + ":idem:" + key;
    await this.command("EVAL", "local v=redis.call('get',KEYS[1]); if not v then return 0 end; local d=cjson.decode(v); if d.contextHash==ARGV[1] and d.state=='RUNNING' then return redis.call('del',KEYS[1]) end; return 0", "1", redisKey, contextHash);
  }
}

export class SupabaseRpcAdapter {
  constructor({ url, serviceRoleKey, fetchImpl = fetch }) {
    this.url = required(url, "Supabase URL").replace(/\/$/, "");
    this.key = required(serviceRoleKey, "Supabase server key");
    this.fetchImpl = fetchImpl;
  }
  async rpc(name, args) {
    try {
      const response = await this.fetchImpl(this.url + "/rest/v1/rpc/" + name, {
        method: "POST",
        headers: { apikey: this.key, Authorization: "Bearer " + this.key, "Content-Type": "application/json" },
        body: JSON.stringify(args)
      });
      if (!response.ok) throw new Error("Supabase RPC " + name + " HTTP " + response.status);
      return await response.json();
    } catch (error) { throw new StoreUnavailableError(error.message); }
  }
  async withLock(key, operation, { ttlSeconds = 30, signal, heartbeatMs = 10000, onLockLost } = {}) {
    const owner = randomUUID();
    const claimed = await this.rpc("aimpact_claim_execution_lock", { p_lock_key: key, p_owner: owner, p_ttl_seconds: ttlSeconds });
    if (claimed !== true) return { acquired: false };
    let heartbeatError = null;
    const heartbeat = setInterval(() => {
      void this.rpc("aimpact_renew_execution_lock", { p_lock_key: key, p_owner: owner, p_ttl_seconds: ttlSeconds })
        .then(ok => { if (ok !== true) throw new Error("Supabase lock ownership lost"); })
        .catch(error => { heartbeatError = error; onLockLost?.(error); });
    }, heartbeatMs);
    heartbeat.unref?.();
    try {
      const result = await operation();
      if (heartbeatError) throw new StoreUnavailableError(heartbeatError.message);
      return { acquired: true, result };
    } finally {
      clearInterval(heartbeat);
      await this.rpc("aimpact_release_execution_lock", { p_lock_key: key, p_owner: owner });
    }
  }
  async claimIdempotency(key, contextHash, ttlSeconds = 86400) {
    return await this.rpc("aimpact_claim_idempotency", { p_idempotency_key: key, p_context_hash: contextHash, p_ttl_seconds: ttlSeconds }) === true;
  }
  async readIdempotency(key) {
    return await this.rpc("aimpact_read_idempotency", { p_idempotency_key: key });
  }
  async completeIdempotency(key, contextHash, result, ttlSeconds = 86400) {
    await this.rpc("aimpact_complete_idempotency", {
      p_idempotency_key: key, p_context_hash: contextHash, p_result: result, p_ttl_seconds: ttlSeconds
    });
  }
  async releaseIdempotency(key, contextHash) {
    await this.rpc("aimpact_release_idempotency", { p_idempotency_key: key, p_context_hash: contextHash });
  }
}
