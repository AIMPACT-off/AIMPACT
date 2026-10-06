const HEADERS={"Content-Type":"application/json","Cache-Control":"no-store"};
const fail=(code,status=400)=>new Response(JSON.stringify({ok:false,code}),{status,headers:HEADERS});
async function auth(request,url,anon){
  const token=(request.headers.get("authorization")||"").replace(/^Bearer\\s+/i,"");
  if(!token)return null; const r=await fetch(url+"/auth/v1/user",{headers:{apikey:anon,Authorization:"Bearer "+token}});
  if(!r.ok)return null; const u=await r.json(); return u?.id?u:null;
}
export default async function handler(request){
  if(request.method!=="POST")return fail("METHOD_NOT_ALLOWED",405);
  if(process.env.WORKFLOW_PORTAL_ENABLED!=="true")return fail("WORKFLOW_PORTAL_DISABLED",503);
  const url=process.env.SUPABASE_URL?.replace(/\/$/,""),anon=process.env.SUPABASE_ANON_KEY,service=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!anon||!service)return fail("SUPABASE_SERVER_CONFIG_REQUIRED",503);
  const u=await auth(request,url,anon); if(!u)return fail("INVALID_OR_EXPIRED_AUTH",401);
  let b;try{b=await request.json();}catch{return fail("INVALID_JSON");}
  const tenantId=String(b?.tenant_id||""),workflowId=String(b?.workflow_id||""),metricName=String(b?.metric_name||"").trim();
  if(!tenantId||!workflowId||!metricName)return fail("OUTCOME_FIELDS_REQUIRED",400);
  if(metricName.length>120)return fail("METRIC_NAME_TOO_LONG",400);
  const member=await fetch(url+"/rest/v1/tenant_memberships?"+new URLSearchParams({tenant_id:"eq."+tenantId,user_id:"eq."+u.id,status:"eq.active",select:"tenant_id",limit:"1"}),{headers:{apikey:service,Authorization:"Bearer "+service}});
  if(!member.ok)return fail("TENANT_MEMBERSHIP_LOOKUP_FAILED",503); if((await member.json()).length!==1)return fail("ACTIVE_TENANT_MEMBERSHIP_REQUIRED",403);
  const workflow=await fetch(url+"/rest/v1/workflow_runs?"+new URLSearchParams({tenant_id:"eq."+tenantId,id:"eq."+workflowId,select:"id,status",limit:"1"}),{headers:{apikey:service,Authorization:"Bearer "+service}});
  if(!workflow.ok)return fail("WORKFLOW_LOOKUP_FAILED",503); if((await workflow.json()).length!==1)return fail("WORKFLOW_NOT_FOUND",404);
  const insert=await fetch(url+"/rest/v1/outcome_metrics",{method:"POST",headers:{apikey:service,Authorization:"Bearer "+service,"Content-Type":"application/json","Prefer":"return=representation"},body:JSON.stringify({tenant_id:tenantId,workflow_id:workflowId,metric_name:metricName,baseline_value:Number.isFinite(Number(b.baseline_value))?Number(b.baseline_value):null,current_value:Number.isFinite(Number(b.current_value))?Number(b.current_value):null,unit:b.unit?String(b.unit).slice(0,40):null,measurement_period_start:b.measurement_period_start||null,measurement_period_end:b.measurement_period_end||null,verified:false})});
  if(!insert.ok)return fail("OUTCOME_CREATE_FAILED",503); const rows=await insert.json();
  return new Response(JSON.stringify({ok:true,outcome:rows[0]||null}),{status:201,headers:HEADERS});
}
