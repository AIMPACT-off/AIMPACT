const JSON_HEADERS = {"Content-Type":"application/json","Cache-Control":"no-store"};

export default async function handler() {
  // Fail closed until the canonical auth -> tenant membership model and
  // server-side Supabase integration are verified in TEST.
  if (process.env.DIAGNOSIS_PORTAL_ENABLED !== "true") {
    return new Response(JSON.stringify({
      ok:false,
      code:"PORTAL_DISABLED",
      message:"AIMPACT client portal backend is not enabled."
    }),{status:503,headers:JSON_HEADERS});
  }

  // Intentionally no anonymous data path. A future implementation must:
  // 1) authenticate the caller server-side,
  // 2) derive tenant_id from trusted membership,
  // 3) query only APPROVED reports for that tenant,
  // 4) never accept tenant_id/reviewer_id from browser input.
  return new Response(JSON.stringify({
    ok:false,
    code:"AUTH_INTEGRATION_REQUIRED",
    message:"Tenant authentication and membership verification are required before customer data can be returned."
  }),{status:503,headers:JSON_HEADERS});
}