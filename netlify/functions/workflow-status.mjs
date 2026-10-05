const HEADERS={"Content-Type":"application/json","Cache-Control":"no-store"};
const fail=(code,status=400)=>new Response(JSON.stringify({ok:false,code}),{status,headers:HEADERS});

async function authUser(request,url,anon){
  const token=(request.headers.get("authorization")||"").replace(/^Bearer\\s+/i,"");
  if(!token)return null;
  const response=await fetch(url+"/auth/v1/user",{headers:{apikey:anon,Authorization:"Bearer "+token}});
  if(!response.ok)return null;
  const user=await response.json();
  return user?.id?user:null;
}

export default async function handler(request){
  if(request.method!=="GET")return fail("METHOD_NOT_ALLOWED",405);
  if(process.env.WORKFLOW_PORTAL_ENABLED!=="true")return fail("WORKFLOW_PORTAL_DISABLED",503);
  const url=process.env.SUPABASE_URL?.replace(/\/$/,"");
  const anon=process.env.SUPABASE_ANON_KEY;
  const service=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!anon||!service)return fail("SUPABASE_SERVER_CONFIG_REQUIRED",503);
  const user=await authUser(request,url,anon);
  if(!user)return fail("INVALID_OR_EXPIRED_AUTH",401);
  const tenantId=new URL(request.url).searchParams.get("tenant_id");
  if(!tenantId)return fail("TENANT_ID_REQUIRED",400);

  const membershipParams=new URLSearchParams({
    tenant_id:"eq."+tenantId,user_id:"eq."+user.id,status:"eq.active",select:"tenant_id,role",limit:"1"
  });
  const membership=await fetch(url+"/rest/v1/tenant_memberships?"+membershipParams,{headers:{apikey:service,Authorization:"Bearer "+service}});
  if(!membership.ok)return fail("TENANT_MEMBERSHIP_LOOKUP_FAILED",503);
  const members=await membership.json();
  if(!Array.isArray(members)||members.length!==1)return fail("ACTIVE_TENANT_MEMBERSHIP_REQUIRED",403);

  const workflowParams=new URLSearchParams({
    tenant_id:"eq."+tenantId,
    select:"id,report_id,status,workflow_name,current_step,started_at,completed_at,last_error_code,created_at,updated_at",
    order:"updated_at.desc",limit:"20"
  });
  const workflows=await fetch(url+"/rest/v1/workflow_runs?"+workflowParams,{headers:{apikey:service,Authorization:"Bearer "+service}});
  if(!workflows.ok)return fail("WORKFLOW_LOOKUP_FAILED",503);
  const workflowRows=await workflows.json();
  const ids=workflowRows.map(row=>row.id);
  let outcomes=[];
  if(ids.length){
    const outcomeParams=new URLSearchParams({
      tenant_id:"eq."+tenantId,
      workflow_id:"in.("+ids.join(",")+")",
      select:"id,workflow_id,metric_name,baseline_value,current_value,unit,measurement_period_start,measurement_period_end,verified,created_at,updated_at",
      order:"created_at.desc"
    });
    const response=await fetch(url+"/rest/v1/outcome_metrics?"+outcomeParams,{headers:{apikey:service,Authorization:"Bearer "+service}});
    if(!response.ok)return fail("OUTCOME_LOOKUP_FAILED",503);
    outcomes=await response.json();
  }
  return new Response(JSON.stringify({ok:true,tenant_id:tenantId,workflows:workflowRows,outcomes}),{status:200,headers:HEADERS});
}
