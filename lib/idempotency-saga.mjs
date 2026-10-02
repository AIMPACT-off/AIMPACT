import { createHash, randomUUID } from "node:crypto";
export function createIdempotencyKey(context, requestId=randomUUID()) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) throw new Error("requestId must be UUIDv4");
  const contextHash=createHash("sha256").update(JSON.stringify(context)).digest("hex");
  return {key:requestId+"."+contextHash,contextHash,requestId};
}
export async function executeIdempotently({store,key,operation,ttlSeconds=86400}) {
  if (!store?.runOnce || typeof operation!=="function") throw new Error("Atomic durable store.runOnce and operation are required");
  return store.runOnce(key,ttlSeconds,operation);
}
export async function runSaga(steps,{onCompensationFailure=async()=>{}}={}) {
  const completed=[];
  try {
    for (const step of steps) {
      if (typeof step.execute!=="function" || typeof step.compensate!=="function") throw new Error("Every saga step requires execute and compensate");
      const result=await step.execute();
      completed.push({step,result});
    }
    return completed.map(x=>x.result);
  } catch(error) {
    const compensationErrors=[];
    for (const item of completed.reverse()) {
      try { await item.step.compensate(item.result); }
      catch(compensationError) { compensationErrors.push(compensationError); await onCompensationFailure({step:item.step.name,error:compensationError,originalError:error}); }
    }
    error.compensationErrors=compensationErrors;
    error.compensatedSteps=completed.length;
    throw error;
  }
}
