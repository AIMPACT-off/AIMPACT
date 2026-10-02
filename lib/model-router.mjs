/**
 * Deterministic model fallback guard. Pricing and context limits must come
 * from a freshly verified capability registry; this module never guesses.
 */
export function estimateCostUsd({inputTokens, outputTokens=0, pricing}) {
  if (!pricing || !Number.isFinite(pricing.inputPerMillion) || !Number.isFinite(pricing.outputPerMillion)) throw new Error("MODEL_PRICING_UNVERIFIED");
  return (inputTokens*pricing.inputPerMillion + outputTokens*pricing.outputPerMillion)/1_000_000;
}
export function preparePayload({messages, target, pricing, maxCostUsd, reserveOutputTokens=1024, summarize}) {
  if (!target || !Number.isInteger(target.contextWindow) || target.contextWindow<1) throw new Error("MODEL_CONTEXT_UNVERIFIED");
  if (!pricing || pricing.verified!==true || !Number.isFinite(pricing.inputPerMillion) || !Number.isFinite(pricing.outputPerMillion)) throw new Error("MODEL_PRICING_UNVERIFIED");
  if (!Array.isArray(messages) || messages.length===0) throw new Error("EMPTY_PAYLOAD");
  const clone=messages.map(m=>({role:String(m.role),content:String(m.content)}));
  const estimate=target.countTokens;
  if (typeof estimate!=="function") throw new Error("TOKENIZER_REQUIRED");
  let tokens=estimate(clone);
  const capacity=target.contextWindow-reserveOutputTokens;
  if (capacity<=0) throw new Error("INVALID_OUTPUT_RESERVE");
  if(tokens>capacity) {
    if(typeof summarize!=="function") throw new Error("PAYLOAD_EXCEEDS_CONTEXT");
    const compact=summarize(clone,{maxInputTokens:capacity,model:target.id});
    if(!Array.isArray(compact)) throw new Error("ADAPTIVE_CONVERSION_INVALID");
    tokens=estimate(compact);
    if(tokens>capacity) throw new Error("ADAPTIVE_PAYLOAD_STILL_TOO_LARGE");
    return finalize(compact,tokens,target,pricing,maxCostUsd);
  }
  return finalize(clone,tokens,target,pricing,maxCostUsd);
}
function finalize(messages,inputTokens,target,pricing,maxCostUsd) {
  const estimatedCostUsd=estimateCostUsd({inputTokens,pricing});
  if(!Number.isFinite(maxCostUsd)||maxCostUsd<0||estimatedCostUsd>maxCostUsd) throw new Error("MODEL_COST_CAP_EXCEEDED");
  return {model:target.id,messages,inputTokens,estimatedCostUsd};
}
