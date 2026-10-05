import { createHash, randomUUID } from "node:crypto";

const HEADERS={"Content-Type":"application/json","Cache-Control":"no-store"};
const fail=(code,status)=>new Response(JSON.stringify({ok:false,code}),{status,headers:HEADERS});
const MAX_FILE=5*1024*1024;
const ALLOWED=new Set(["application/pdf","image/jpeg","image/png"]);

async function authUser(request,url,anon){
  const match=(request.headers.get("authorization")||"").match(/^Bearer\\s+([A-Za-z0-9._~-]+)$/);
  if(!match) throw Object.assign(new Error("SUPABASE_AUTH_JWT_REQUIRED"),{status:401});
  const auth=await fetch(url+"/auth/v1/user",{headers:{apikey:anon,Authorization:"Bearer "+match[1]}});
  if(!auth.ok) throw Object.assign(new Error("INVALID_OR_EXPIRED_AUTH"),{status:401});
  const user=await auth.json();
  if(!user?.id) throw Object.assign(new Error("AUTH_SUBJECT_MISSING"),{status:401});
  return {token:match[1],user};
}

export default async function handler(request){
  if(process.env.BUSINESS_ONBOARDING_ENABLED!=="true") return fail("BUSINESS_ONBOARDING_DISABLED",503);
  if(request.method!=="POST") return fail("METHOD_NOT_ALLOWED",405);
  const url=process.env.SUPABASE_URL?.replace(/\\/$/,"");
  const anon=process.env.SUPABASE_ANON_KEY;
  const service=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!anon||!service) return fail("SUPABASE_SERVER_CONFIG_REQUIRED",503);

  try{
    const {user}=await authUser(request,url,anon);
    const form=await request.formData();
    const tenantId=String(form.get("tenant_id")||"").trim();
    const legalName=String(form.get("legal_name")||"").trim();
    const registrationNumber=String(form.get("business_registration_number")||"").trim();
    const representativeName=String(form.get("representative_name")||"").trim();
    const businessAddress=String(form.get("business_address")||"").trim();
    const website=String(form.get("website")||"").trim();
    const industry=String(form.get("industry")||"").trim();
    const bankName=String(form.get("bank_name")||"").trim();
    const accountHolder=String(form.get("account_holder")||"").trim();
    const bankAccount=String(form.get("bank_account")||"").replace(/\\s+/g,"");
    const certificate=form.get("certificate");

    if(!tenantId||!legalName||!registrationNumber||!representativeName||!businessAddress||!bankName||!accountHolder||!/^[0-9]{8,20}$/.test(bankAccount))
      return fail("INVALID_BUSINESS_PROFILE",400);
    if(!(certificate instanceof File)) return fail("BUSINESS_CERTIFICATE_REQUIRED",400);
    if(certificate.size<1||certificate.size>MAX_FILE||!ALLOWED.has(certificate.type)) return fail("INVALID_CERTIFICATE_FILE",400);

    const membershipUrl=url+"/rest/v1/tenant_memberships?tenant_id=eq."+encodeURIComponent(tenantId)+"&user_id=eq."+encodeURIComponent(user.id)+"&status=eq.active&select=tenant_id";
    const membership=await fetch(membershipUrl,{headers:{apikey:service,Authorization:"Bearer "+service}});
    const memberships=membership.ok?await membership.json():[];
    if(!Array.isArray(memberships)||memberships.length!==1) return fail("ACTIVE_TENANT_MEMBERSHIP_REQUIRED",403);

    const bytes=new Uint8Array(await certificate.arrayBuffer());
    const digest=createHash("sha256").update(bytes).digest("hex");
    const ext=certificate.type==="application/pdf"?"pdf":certificate.type==="image/png"?"png":"jpg";
    const path=tenantId+"/"+randomUUID()+"."+ext;
    const upload=await fetch(url+"/storage/v1/object/business-certificates/"+path,{
      method:"POST",
      headers:{
        apikey:service,
        Authorization:"Bearer "+service,
        "Content-Type":certificate.type,
        "x-upsert":"false"
      },
      body:bytes
    });
    if(!upload.ok) return fail("CERTIFICATE_UPLOAD_FAILED",503);

    // The raw bank account is sent only across the server-to-server boundary and
    // is encrypted by Postgres before persistence. It is never returned to the client.
    const rpc=await fetch(url+"/rest/v1/rpc/upsert_business_profile_atomic",{
      method:"POST",
      headers:{apikey:service,Authorization:"Bearer "+service,"Content-Type":"application/json"},
      body:JSON.stringify({
        p_tenant_id:tenantId,
        p_legal_name:legalName,
        p_business_registration_number:registrationNumber,
        p_representative_name:representativeName,
        p_business_address:businessAddress,
        p_website:website,
        p_industry:industry,
        p_bank_name:bankName,
        p_account_holder:accountHolder,
        p_bank_account_last4:bankAccount.slice(-4),
        p_bank_account_ciphertext:await encryptWithServerSecret(bankAccount,service),
        p_certificate_path:path,
        p_certificate_sha256:digest
      })
    });
    if(!rpc.ok){
      await fetch(url+"/storage/v1/object/business-certificates/"+path,{method:"DELETE",headers:{apikey:service,Authorization:"Bearer "+service}});
      return fail("BUSINESS_PROFILE_PERSIST_FAILED",503);
    }
    return new Response(JSON.stringify({ok:true,status:"SUBMITTED",tenant_id:tenantId,certificate_sha256:digest}),{status:201,headers:HEADERS});
  }catch(error){
    return fail(error?.message||"BUSINESS_ONBOARDING_FAILED",error?.status||503);
  }
}

async function encryptWithServerSecret(value,secret){
  const {createHmac}=await import("node:crypto");
  // Deterministic key derivation from the existing server-only secret; the
  // derived key is not persisted. pgcrypto-compatible PGP ciphertext is not
  // available in Node, so this returns a sealed envelope generated by AES-GCM.
  const {randomBytes,createCipheriv}=await import("node:crypto");
  const key=createHmac("sha256",secret).update("AIMPACT:BUSINESS_BANK_ACCOUNT:v1").digest();
  const iv=randomBytes(12);
  const cipher=createCipheriv("aes-256-gcm",key,iv);
  const encrypted=Buffer.concat([cipher.update(value,"utf8"),cipher.final()]);
  const tag=cipher.getAuthTag();
  return "v1:"+iv.toString("base64url")+":"+tag.toString("base64url")+":"+encrypted.toString("base64url");
}
