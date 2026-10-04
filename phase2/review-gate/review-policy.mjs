const APPROVED="APPROVED";
export function assertReviewFirst({callerAuthenticated,tenantId,report}) {
  if(!callerAuthenticated) return {ok:false,code:"AUTH_REQUIRED"};
  if(!tenantId) return {ok:false,code:"TENANT_CONTEXT_REQUIRED"};
  if(!report) return {ok:false,code:"REPORT_NOT_FOUND"};
  if(report.tenant_id!==tenantId) return {ok:false,code:"TENANT_MISMATCH"};
  if(report.report_status!==APPROVED) return {ok:false,code:"REPORT_NOT_APPROVED"};
  if(report.review_decision!==APPROVED) return {ok:false,code:"REVIEW_NOT_APPROVED"};
  return {ok:true};
}
export function rejectBrowserAuthority(body={}) {
  if("tenant_id" in body || "reviewer_id" in body) return {ok:false,code:"CLIENT_AUTHORITY_FORBIDDEN"};
  return {ok:true};
}
