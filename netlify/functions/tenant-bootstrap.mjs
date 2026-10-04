const HEADERS={"Content-Type":"application/json","Cache-Control":"no-store"};
const fail=(code,status)=>new Response(JSON.stringify({ok:false,code}),{status,headers:HEADERS});
const SLUG=/^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/;

export default async function handler(request){
  if(request.method!=="POST")return fail("METHOD_NOT_ALLOWED",405);
  if(request.headers.get("content-type")?.toLowerCase().split(";")[0]!=="application/json")return fail("JSON_REQUIRED",400);
  const authorization=request.headers.get("authorization")||"";
  const match=authorization.match(/^Bearer\s+([A-Za-z0-9._~-]+)$/);
  if(!match)return fail("SUPABASE_AUTH_JWT_REQUIRED",401);
  const url=process.env.SUPABASE_URL?.replace(/\/$/,"");
  const anon=process.env.SUPABASE_ANON_KEY;
  const service=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!anon||!service)return fail("SUPABASE_SERVER_CONFIG_REQUIRED",503);
  const length=Number(request.headers.get("content-length")||0);
  if(length>4096)return fail("BODY_TOO_LARGE",413);
  let body;
  try{body=await request.json();}catch{return fail("INVALID_JSON",400);}
  if(!body||typeof body!=="object"||typeof body.name!=="string"||typeof body.slug!=="string")return fail("INVALID_TENANT_INPUT",400);
  const name=body.name.trim(),slug=body.slug.trim();
  if(name.length<1||name.length>160||!SLUG.test(slug))return fail("INVALID_TENANT_INPUT",400);
  try{
    // Ask Supabase Auth to validate the bearer token; never trust decoded JWT claims.
    const auth=await fetch(url+"/auth/v1/user",{headers:{apikey:anon,Authorization:"Bearer "+match[1]}});
    if(!auth.ok)return fail("INVALID_OR_EXPIRED_AUTH",401);
    const user=await auth.json();
    if(!user?.id||(!user.email_confirmed_at&&!user.phone_confirmed_at))return fail("CONFIRMED_ACCOUNT_REQUIRED",403);

    // The owner subject is derived only from the validated Auth response.
    const provision=await fetch(url+"/rest/v1/rpc/create_tenant_with_owner",{
      method:"POST",
      headers:{apikey:service,Authorization:"Bearer "+service,"Content-Type":"application/json"},
      body:JSON.stringify({p_name:name,p_slug:slug,p_owner_user_id:user.id})
    });
    if(!provision.ok){
      const detail=await provision.json().catch(()=>({}));
      if(detail?.code==="23505")return fail("TENANT_SLUG_UNAVAILABLE",409);
      if(detail?.code==="42501")return fail("TENANT_OWNER_BINDING_CONFLICT",409);
      return fail("TENANT_BOOTSTRAP_FAILED",503);
    }
    const result=await provision.json();
    if(!result?.tenant_id||result.owner_user_id!==user.id)return fail("TENANT_BOOTSTRAP_INVALID_RESPONSE",503);
    return new Response(JSON.stringify({ok:true,tenant_id:result.tenant_id,created:result.created===true}),{
      status:result.created===true?201:200,headers:HEADERS
    });
  }catch{
    return fail("TENANT_BOOTSTRAP_UNAVAILABLE",503);
  }
}
