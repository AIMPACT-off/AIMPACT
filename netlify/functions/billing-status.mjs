const HEADERS={"Content-Type":"application/json","Cache-Control":"no-store"};
const fail=(code,status=400)=>new Response(JSON.stringify({ok:false,code}),{status,headers:HEADERS});

async function verifiedUser(request,url,anon){
  const token=(request.headers.get("authorization")||"").replace(/^Bearer\\s+/i,"");
  if(!token)return null;
  const response=await fetch(url+"/auth/v1/user",{headers:{apikey:anon,Authorization:"Bearer "+token}});
  if(!response.ok)return null;
  const user=await response.json();
  return user?.id?{id:user.id}:null;
}

export default async function handler(request){
  if(request.method!=="GET")return fail("METHOD_NOT_ALLOWED",405);
  if(process.env.BILLING_TEST_ENABLED!=="true")return fail("BILLING_DISABLED",503);
  const url=process.env.SUPABASE_URL?.replace(/\\/$/,"");
  const anon=process.env.SUPABASE_ANON_KEY;
  const service=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!anon||!service)return fail("SUPABASE_SERVER_CONFIG_REQUIRED",503);

  const user=await verifiedUser(request,url,anon);
  if(!user)return fail("INVALID_OR_EXPIRED_AUTH",401);
  const tenantId=new URL(request.url).searchParams.get("tenant_id");
  if(!tenantId)return fail("TENANT_ID_REQUIRED",400);

  const membershipParams=new URLSearchParams({
    tenant_id:"eq."+tenantId,user_id:"eq."+user.id,status:"eq.active",
    select:"tenant_id,role",limit:"1"
  });
  const membership=await fetch(url+"/rest/v1/tenant_memberships?"+membershipParams,{
    headers:{apikey:service,Authorization:"Bearer "+service}
  });
  if(!membership.ok)return fail("TENANT_MEMBERSHIP_LOOKUP_FAILED",503);
  const members=await membership.json();
  if(!Array.isArray(members)||members.length!==1)return fail("ACTIVE_TENANT_MEMBERSHIP_REQUIRED",403);

  const params=new URLSearchParams({
    tenant_id:"eq."+tenantId,select:"tenant_id,plan,status,stripe_customer_id,stripe_subscription_id,current_period_end,updated_at,created_at",limit:"1"
  });
  const entitlement=await fetch(url+"/rest/v1/tenant_entitlements?"+params,{
    headers:{apikey:service,Authorization:"Bearer "+service}
  });
  if(!entitlement.ok)return fail("ENTITLEMENT_LOOKUP_FAILED",503);
  const rows=await entitlement.json();
  return new Response(JSON.stringify({ok:true,tenant_id:tenantId,entitlement:rows[0]||null}),{status:200,headers:HEADERS});
}
