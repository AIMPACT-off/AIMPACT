import { randomUUID } from "node:crypto";
import { verifyTenantContext } from "../../phase2/auth/tenant-context.mjs";

const HEADERS={"Content-Type":"application/json","Cache-Control":"no-store"},MAX=12000;
const fail=(code,status=400)=>new Response(JSON.stringify({ok:false,code}),{status,headers:HEADERS});

export default async function handler(request){
  if(process.env.DIAGNOSIS_INGEST_ENABLED!=="true")return fail("INGEST_DISABLED",503);
  if(request.method!=="POST")return fail("METHOD_NOT_ALLOWED",405);
  if(request.headers.get("content-type")?.toLowerCase().split(";")[0]!=="application/json")return fail("JSON_REQUIRED");
  const ctx=verifyTenantContext(request.headers.get("x-aimpact-tenant-context"),process.env.TENANT_CONTEXT_HMAC_SECRET);
  if(!ctx)return fail("TRUSTED_TENANT_CONTEXT_REQUIRED",401);
  const length=Number(request.headers.get("content-length")||0);if(length>MAX)return fail("BODY_TOO_LARGE",413);
  let body;try{body=await request.json();}catch{return fail("INVALID_JSON");}
  if(!body || typeof body!=="object" || body.schema_version!=="1.0.0" || !body.answers || typeof body.answers!=="object" || Array.isArray(body.answers))return fail("INVALID_DIAGNOSIS_PAYLOAD");
  if(JSON.stringify(body).length>MAX)return fail("BODY_TOO_LARGE",413);
  const url=process.env.SUPABASE_URL?.replace(/\/$/,""),key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key)return fail("SUPABASE_SERVER_CONFIG_REQUIRED",503);
  const idem=request.headers.get("idempotency-key")||randomUUID();
  const rpcPayload={
    p_tenant_id:ctx.tenant_id,
    p_idempotency_key:idem,
    p_schema_version:body.schema_version,
    p_raw_answers:body.answers,
    p_consent_notice_version:body.consent_notice_version||"2026-10-04",
    p_consented_at:body.consented_at||new Date().toISOString(),
    p_submitted_by:ctx.subject||null
  };
  try{
    const response=await fetch(url+"/rest/v1/rpc/create_diagnosis_intake_atomic",{
      method:"POST",
      headers:{apikey:key,Authorization:"Bearer "+key,"Content-Type":"application/json"},
      body:JSON.stringify(rpcPayload)
    });
    if(!response.ok)return fail("DIAGNOSIS_ATOMIC_INGEST_REJECTED",503);
    const result=await response.json();
    if(!result?.submission_id||!result?.job_id||result.queued!==true)return fail("DIAGNOSIS_ATOMIC_INGEST_INVALID_RESPONSE",503);
    return new Response(JSON.stringify({
      ok:true,
      duplicate:result.duplicate===true,
      queued:true,
      submission_id:result.submission_id,
      job_id:result.job_id
    }),{status:202,headers:HEADERS});
  }catch{
    return fail("DIAGNOSIS_ATOMIC_INGEST_UNAVAILABLE",503);
  }
}
