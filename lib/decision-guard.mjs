export class DecisionGuardError extends Error {
  constructor(code, message) { super(message); this.name="DecisionGuardError"; this.code=code; }
}
export async function enforceDecision({decision, validateSchema, circuitBreaker, minConfidence=0.85, onHumanReview=async()=>{}}) {
  if (!decision || typeof decision !== "object") throw new DecisionGuardError("INVALID_DECISION","Decision must be an object");
  const confidence=decision.confidence;
  if (typeof confidence!=="number" || !Number.isFinite(confidence) || confidence<0 || confidence>1) {
    await onHumanReview({reason:"INVALID_CONFIDENCE",decision});
    throw new DecisionGuardError("INVALID_CONFIDENCE","Confidence must be a finite number between 0 and 1");
  }
  if (confidence<minConfidence) {
    await onHumanReview({reason:"LOW_CONFIDENCE",decision,threshold:minConfidence});
    throw new DecisionGuardError("HUMAN_REVIEW_REQUIRED","Decision confidence is below the execution threshold");
  }
  if (typeof validateSchema!=="function") throw new DecisionGuardError("SCHEMA_VALIDATOR_REQUIRED","A strict schema validator is required");
  const validate=()=>validateSchema(decision);
  try {
    if (circuitBreaker?.execute) return await circuitBreaker.execute(validate,{idempotent:false});
    const result=await validate();
    if (result===false || result?.success===false) throw new DecisionGuardError("SCHEMA_INVALID","Decision failed strict schema validation");
    return decision;
  } catch(error) {
    if (error.code==="SCHEMA_INVALID") throw error;
    if (circuitBreaker?.recordFailure) circuitBreaker.recordFailure(error);
    throw new DecisionGuardError("SCHEMA_INVALID",error.message||"Decision schema validation failed");
  }
}
