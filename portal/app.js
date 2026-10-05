const views=[...document.querySelectorAll(".view")];
const nav=[...document.querySelectorAll(".nav")];
const heading=document.getElementById("heading");
const crumb=document.getElementById("crumb");
const authPanel=document.getElementById("authPanel");
const authNote=document.getElementById("authNote");
const tenantSelect=document.getElementById("tenantSelect");
const connectTenant=document.getElementById("connectTenant");
const signoutButton=document.getElementById("signoutButton");
const signoutTop=document.getElementById("signoutTop");
const config=window.AIMPACT_CONFIG||{};
let supabaseClient=null;
let session=null;
let tenantContext=null;
let authReady=false;
let requestController=null;
const DRAFT_KEY="aimpact:diagnosis-draft:v1";
const DRAFT_TTL_MS=30*60*1000;
let draftSaveTimer=null;
let submissionKey=null;
let submissionFingerprint=null;
let submitting=false;
function diagnosisForm(){return document.getElementById("diagnosisForm");}
function currentAnswers(){
  const data=new FormData(diagnosisForm());
  return Object.fromEntries(["outcome","current_workflow","bottleneck","systems","success_measure"].map(key=>[key,String(data.get(key)||"")]));
}
function clearDraft(){
  if(draftSaveTimer)clearTimeout(draftSaveTimer);
  draftSaveTimer=null;
  try{sessionStorage.removeItem(DRAFT_KEY);}catch{}
}
function saveDraft(){
  if(!session||!tenantContext||!authReady||submitting)return;
  const answers=currentAnswers();
  if(!Object.values(answers).some(value=>value.trim())){clearDraft();return;}
  const payload={version:1,userId:session.user.id,tenantId:tenantSelect.value||"",savedAt:Date.now(),answers};
  try{sessionStorage.setItem(DRAFT_KEY,JSON.stringify(payload));}
  catch{note(document.getElementById("formnote"),"Temporary save is unavailable in this browser. Keep this tab open until submission.","blocked");}
}
function scheduleDraftSave(){
  if(draftSaveTimer)clearTimeout(draftSaveTimer);
  draftSaveTimer=setTimeout(saveDraft,500);
}
function restoreDraft(){
  try{
    const raw=sessionStorage.getItem(DRAFT_KEY);
    if(!raw)return;
    const draft=JSON.parse(raw);
    const valid=draft?.version===1&&draft.userId===session?.user?.id&&draft.tenantId===(tenantSelect.value||"")&&Number.isFinite(draft.savedAt)&&Date.now()-draft.savedAt<=DRAFT_TTL_MS&&draft.answers&&typeof draft.answers==="object";
    if(!valid){clearDraft();return;}
    for(const [name,value] of Object.entries(draft.answers)){
      const field=diagnosisForm().elements.namedItem(name);
      if(field&&typeof value==="string")field.value=value;
    }
    note(document.getElementById("formnote"),"Your unsent draft was restored in this tab. It expires after 30 minutes.","success");
  }catch{clearDraft();}
}
diagnosisForm().addEventListener("input",scheduleDraftSave);
diagnosisForm().addEventListener("change",scheduleDraftSave);

async function safeFetch(url,options={},timeoutMs=12000){
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),timeoutMs);
  try{return await fetch(url,{...options,signal:controller.signal});}
  catch(error){
    if(error.name==="AbortError")throw new Error("REQUEST_TIMEOUT");
    if(!navigator.onLine)throw new Error("NETWORK_OFFLINE");
    throw new Error("NETWORK_UNAVAILABLE");
  }finally{clearTimeout(timer);}
}
function friendlyError(code){
  const messages={
    REQUEST_TIMEOUT:"The request took too long. Your entries are still on this page; please try again.",
    NETWORK_OFFLINE:"You appear to be offline. Reconnect and try again. Your entries are still on this page.",
    NETWORK_UNAVAILABLE:"The service could not be reached. Please try again; your entries remain on this page.",
    SIGN_IN_REQUIRED:"Your session has expired. Please sign in again.",
    ACTIVE_TENANT_MEMBERSHIP_REQUIRED:"Your workspace access is no longer active. Choose another workspace or contact your administrator.",
    TENANT_CONTEXT_REJECTED:"Workspace verification failed. Please reconnect your workspace.",
    TENANT_MEMBERSHIP_RECHECK_FAILED:"We could not verify workspace access. No diagnosis was submitted. Please retry shortly.",
    TENANT_MEMBERSHIP_RECHECK_UNAVAILABLE:"Workspace verification is temporarily unavailable. No diagnosis was submitted. Please retry."
  };
  return messages[code]||String(code||"Something went wrong. Please try again.").replaceAll("_"," ").toLowerCase();
}
function setBusy(button,busy,label){
  if(!button)return;
  if(busy){button.dataset.originalLabel=button.textContent;button.textContent=label||"PLEASE WAIT…";button.disabled=true;}
  else{button.textContent=button.dataset.originalLabel||button.textContent;button.disabled=false;delete button.dataset.originalLabel;}
}

function note(element,message,state=""){
  element.textContent=message;
  element.dataset.state=state;
}
function show(id){
  if(!authReady && id!=="overview")id="overview";
  if(authReady && !tenantContext && id!=="overview"){
    note(authNote,"Connect a verified workspace before opening customer data.","error");
    id="overview";
  }
  views.forEach(v=>v.classList.toggle("active",v.id===id));
  nav.forEach(b=>b.classList.toggle("active",b.dataset.view===id));
  crumb.textContent="AIMPACT / "+id.toUpperCase();
  heading.textContent={overview:"Business Command Center",diagnosis:"Business Diagnosis",reports:"Approved Reports",workflows:"Workflow Operations",roi:"Outcome & ROI",billing:"Billing & Entitlements"}[id]||"AIMPACT";
  window.scrollTo({top:0,behavior:"smooth"});
}
nav.forEach(b=>b.addEventListener("click",()=>{show(b.dataset.view);const loaders={reports:loadApprovedReports,billing:loadBillingState,workflows:loadWorkflowState};if(loaders[b.dataset.view])loaders[b.dataset.view]().catch(error=>note(authNote,"Data is temporarily unavailable: "+friendlyError(error.message),"error"));}));
document.querySelectorAll("[data-view-target]").forEach(b=>b.addEventListener("click",()=>show(b.dataset.viewTarget)));

function setWorkspaceLocked(locked,{showAuth=locked,clearContext=locked}={}){
  authPanel.hidden=!showAuth;
  document.getElementById("tenant").textContent=locked?"Not authenticated":"Workspace verified";
  document.getElementById("connection").textContent=locked?"BACKEND LOCKED":"TENANT VERIFIED";
  document.getElementById("status").textContent=locked?"SIGN IN REQUIRED":"TENANT CONNECTED";
  document.getElementById("diagnosisForm").querySelectorAll("input,textarea,button").forEach(el=>el.disabled=locked);
  if(clearContext)tenantContext=null;
  if(locked){
    signoutButton.hidden=!session;
    if(signoutTop)signoutTop.hidden=!session;
  }else{
    signoutButton.hidden=false;
    if(signoutTop)signoutTop.hidden=false;
  }
}

async function getSession(){
  const {data,error}=await supabaseClient.auth.getSession();
  if(error)throw error;
  session=data.session;
  return session;
}
async function loadMemberships(){
  const token=session?.access_token;
  if(!token)throw new Error("SIGN_IN_REQUIRED");
  const response=await safeFetch("/.netlify/functions/tenant-context",{
    method:"POST",
    headers:{"Authorization":"Bearer "+token,"Content-Type":"application/json","Accept":"application/json"},
    body:JSON.stringify({})
  });
  const data=await response.json().catch(()=>({}));
  if(response.ok && data.tenant_context){
    tenantContext=data.tenant_context;
    authReady=true;
    tenantSelect.innerHTML="";
    const option=document.createElement("option");
    option.value=data.tenant.id;
    option.textContent=data.tenant.id+" · "+data.tenant.role;
    tenantSelect.append(option);
    tenantSelect.disabled=true;
    connectTenant.disabled=true;
    setWorkspaceLocked(false);
    document.getElementById("tenant").textContent=data.tenant.id;
    restoreDraft();
    note(authNote,"Workspace membership verified. Secure tenant session is active.","success");
    Promise.allSettled([loadApprovedReports(),loadBillingState(),loadWorkflowState()]);
    return;
  }
  if(response.status===409 && data.code==="TENANT_SELECTION_REQUIRED" && Array.isArray(data.memberships)){
    tenantContext=null;
    authReady=false;
    tenantSelect.innerHTML='<option value="">Choose a workspace</option>';
    data.memberships.forEach(item=>{
      const option=document.createElement("option");
      option.value=item.tenant_id;
      option.textContent=item.tenant_id+" · "+item.role;
      tenantSelect.append(option);
    });
    tenantSelect.disabled=false;
    connectTenant.disabled=false;
    setWorkspaceLocked(true,{showAuth:true,clearContext:true});
    tenantSelect.disabled=false;
    connectTenant.disabled=false;
    signoutButton.hidden=false;
    if(signoutTop)signoutTop.hidden=false;
    note(authNote,"More than one active workspace found. Select the workspace you want to open.","success");
    return;
  }
  tenantContext=null;
  authReady=false;
  tenantSelect.innerHTML='<option value="">No active workspace found</option>';
  tenantSelect.disabled=true;
  connectTenant.disabled=true;
  setWorkspaceLocked(true);
  signoutButton.hidden=false;
  note(authNote,data.code==="TENANT_SETUP_REQUIRED"
    ?"Your account is signed in, but no active workspace is linked. Create a workspace below."
    :"Workspace verification blocked: "+(data.code||"UNKNOWN_ERROR"),"error");
}

async function connectSelectedTenant(){
  const tenantId=tenantSelect.value;
  if(!tenantId)throw new Error("SELECT_WORKSPACE");
  const response=await safeFetch("/.netlify/functions/tenant-context",{
    method:"POST",
    headers:{"Authorization":"Bearer "+session.access_token,"Content-Type":"application/json","Accept":"application/json"},
    body:JSON.stringify({tenant_id:tenantId})
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok||!data.tenant_context)throw new Error(data.code||"TENANT_CONTEXT_REJECTED");
  tenantContext=data.tenant_context;
  authReady=true;
  setWorkspaceLocked(false);
  document.getElementById("tenant").textContent=data.tenant.id;
  restoreDraft();
  note(authNote,"Selected workspace verified. Secure tenant session is active.","success");
  Promise.allSettled([loadApprovedReports(),loadBillingState(),loadWorkflowState()]);
}

async function refreshSession(){
  await getSession();
  if(!session){
    setWorkspaceLocked(true);
    note(authNote,"Sign in to access your AIMPACT workspace.");
    return;
  }
  await loadMemberships();
}

document.getElementById("loginForm").addEventListener("submit",async event=>{
  event.preventDefault();
  const form=new FormData(event.currentTarget);
  note(authNote,"Signing in securely…");
  const {error}=await supabaseClient.auth.signInWithPassword({
    email:String(form.get("email")).trim(),
    password:String(form.get("password"))
  });
  if(error){note(authNote,error.message,"error");return;}
  try{await refreshSession();}catch(error){note(authNote,error.message,"error");}
});

document.getElementById("signupButton").addEventListener("click",async()=>{
  const form=new FormData(document.getElementById("loginForm"));
  const email=String(form.get("email")||"").trim();
  const password=String(form.get("password")||"");
  if(!email||password.length<8){note(authNote,"Enter an email and a password of at least 8 characters first.","error");return;}
  const {error}=await supabaseClient.auth.signUp({email,password});
  if(error){note(authNote,error.message,"error");return;}
  note(authNote,"Account request submitted. Complete the email confirmation if required, then sign in.","success");
});

document.getElementById("oauthButton").addEventListener("click",async()=>{
  const {error}=await supabaseClient.auth.signInWithOAuth({
    provider:"google",
    options:{redirectTo:window.location.origin+"/portal/"}
  });
  if(error)note(authNote,error.message,"error");
});

connectTenant.addEventListener("click",async()=>{
  try{
    note(authNote,"Verifying selected workspace…");
    await connectSelectedTenant();
  }catch(error){note(authNote,"Workspace connection blocked: "+error.message,"error");}
});

document.getElementById("tenantForm").addEventListener("submit",async event=>{
  event.preventDefault();
  if(!session?.access_token){note(authNote,"Sign in before creating a workspace.","error");return;}
  const form=new FormData(event.currentTarget);
  note(authNote,"Creating workspace through the verified server boundary…");
  try{
    const response=await safeFetch("/.netlify/functions/tenant-bootstrap",{
      method:"POST",
      headers:{"Authorization":"Bearer "+session.access_token,"Content-Type":"application/json","Accept":"application/json"},
      body:JSON.stringify({name:String(form.get("name")).trim(),slug:String(form.get("slug")).trim()})
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.code||"TENANT_CREATE_REJECTED");
    await loadMemberships();
    if(!tenantContext && data.tenant_id){
      tenantSelect.innerHTML="";
      const option=document.createElement("option");
      option.value=data.tenant_id;
      option.textContent=data.tenant_id+" · owner";
      tenantSelect.append(option);
      tenantSelect.disabled=true;
      await connectSelectedTenant();
    }
    note(authNote,"Workspace created and membership verified.","success");
  }catch(error){note(authNote,"Workspace creation blocked: "+error.message,"error");}
});

async function loadApprovedReports(){
  if(!session?.access_token || !tenantContext || !authReady)return;
  const response=await safeFetch("/.netlify/functions/diagnosis-portal?tenant_id="+encodeURIComponent(tenantSelect.value||""),{
    method:"GET",
    headers:{"Authorization":"Bearer "+session.access_token,"Accept":"application/json"}
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.code||"REPORT_LOAD_FAILED");
  const reports=data.reports||[];
  document.getElementById("metricReports").textContent=String(reports.length);
  renderApprovedReports(reports);
}
function renderApprovedReports(reports){
  const panel=document.getElementById("reportsPanel");
  if(!panel)return;
  if(!reports.length){panel.innerHTML='<b>NO APPROVED REPORTS</b><p>Your workspace has no customer-visible report approved by the review gate yet.</p>';return;}
  panel.innerHTML=reports.map(report=>{
    const candidates=Array.isArray(report.solution_candidates)?report.solution_candidates:[];
    const workflow=report.workflow_recommendation&&typeof report.workflow_recommendation==="object"?report.workflow_recommendation:{};
    const evidence=Array.isArray(report.evidence)?report.evidence:[];
    return '<article class="report-card"><small>APPROVED · '+escapeHtml(report.created_at||"")+'</small><h3>'+escapeHtml(report.problem_category||"Business Diagnosis")+'</h3><p>'+escapeHtml(report.problem_statement||"")+'</p><strong>RECOMMENDATION</strong><pre>'+escapeHtml(JSON.stringify(workflow,null,2))+'</pre><strong>SOLUTION CANDIDATES</strong><pre>'+escapeHtml(JSON.stringify(candidates,null,2))+'</pre><strong>EVIDENCE</strong><pre>'+escapeHtml(JSON.stringify(evidence,null,2))+'</pre><span>CONFIDENCE · '+escapeHtml(String(report.confidence??"—"))+'</span></article>';
  }).join("");
}
function escapeHtml(value){return String(value).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");}
async function loadBillingState(){
  if(!session?.access_token || !tenantContext || !authReady)return;
  const tenantId=encodeURIComponent(tenantSelect.value||"");
  const response=await safeFetch("/.netlify/functions/billing-status?tenant_id="+tenantId,{headers:{"Authorization":"Bearer "+session.access_token,"Accept":"application/json"}});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.code||"BILLING_LOAD_FAILED");
  const entitlement=data.entitlement;
  document.getElementById("billingPlan").textContent=entitlement?.plan||"NOT ACTIVE";
  document.getElementById("billingStatus").textContent=entitlement?.status||"No entitlement";
  document.getElementById("billingRenewal").textContent=entitlement?.current_period_end?new Date(entitlement.current_period_end).toLocaleDateString():"—";
  document.getElementById("billingPanel").innerHTML=entitlement?"<b>"+escapeHtml(entitlement.plan)+" · "+escapeHtml(entitlement.status)+"</b><p>Entitlement is verified server-side for this workspace. Live billing remains disabled.</p>":"<b>NO ACTIVE ENTITLEMENT</b><p>Choose a plan through the test billing path when enabled. No production access is granted by this screen.</p>";
}
async function loadWorkflowState(){
  if(!session?.access_token || !tenantContext || !authReady)return;
  const tenantId=encodeURIComponent(tenantSelect.value||"");
  const response=await safeFetch("/.netlify/functions/workflow-status?tenant_id="+tenantId,{headers:{"Authorization":"Bearer "+session.access_token,"Accept":"application/json"}});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(data.code||"WORKFLOW_LOAD_FAILED");
  const workflows=data.workflows||[], outcomes=data.outcomes||[];
  document.getElementById("metricWorkflows").textContent=String(workflows.filter(item=>!["COMPLETED","FAILED"].includes(item.status)).length);
  const panel=document.getElementById("workflowPanel");
  if(!workflows.length){panel.innerHTML="<b>NO WORKFLOW RUNS</b><p>Approved reports can be converted into server-controlled workflow runs after the implementation gate is enabled.</p>";document.getElementById("metricRoi").textContent="—";return;}
  panel.innerHTML=workflows.map(item=>{const related=outcomes.filter(outcome=>outcome.workflow_id===item.id);return "<article class='report-card'><small>"+escapeHtml(item.status)+" · "+escapeHtml(item.current_step)+"</small><h3>"+escapeHtml(item.workflow_name)+"</h3><p>Workflow "+escapeHtml(item.id)+" · report "+escapeHtml(item.report_id)+"</p><strong>VERIFIED OUTCOMES</strong><pre>"+escapeHtml(JSON.stringify(related,null,2))+"</pre></article>";}).join("");
  const verified=outcomes.filter(item=>item.verified).length;document.getElementById("metricRoi").textContent=verified?String(verified):"—";
}

\nasync function signOut(){
  await supabaseClient.auth.signOut();
  session=null;
  authReady=false;
  clearDraft();
  submissionKey=null;
  submissionFingerprint=null;
  setWorkspaceLocked(true);
  tenantSelect.innerHTML='<option value="">Sign in to load workspaces</option>';
  note(authNote,"Signed out. Customer data is locked.");
}
signoutButton.addEventListener("click",signOut);
if(signoutTop)signoutTop.addEventListener("click",signOut);

document.getElementById("diagnosisForm").addEventListener("submit",async event=>{
  event.preventDefault();
  const noteElement=document.getElementById("formnote");
  if(!tenantContext){note(noteElement,"Submission blocked: connect a verified workspace first.","blocked");return;}
  const form=new FormData(event.currentTarget);
  const answers={
    outcome:String(form.get("outcome")||"").trim(),
    current_workflow:String(form.get("current_workflow")||"").trim(),
    bottleneck:String(form.get("bottleneck")||"").trim(),
    systems:String(form.get("systems")||"").trim(),
    success_measure:String(form.get("success_measure")||"").trim()
  };
  if(Object.values(answers).some(value=>!value)){note(noteElement,"Complete every diagnosis field before submitting.","blocked");return;}
  if(submitting)return;
  submitting=true;
  const submitButton=diagnosisForm().querySelector('button[type="submit"]');
  setBusy(submitButton,true,"SUBMITTING…");
  const fingerprint=JSON.stringify(answers);
  if(!submissionKey||submissionFingerprint!==fingerprint){submissionKey=crypto.randomUUID();submissionFingerprint=fingerprint;}
  note(noteElement,"Submitting securely to your verified workspace…");
  try{
    const response=await safeFetch("/.netlify/functions/diagnosis-intake",{
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        "Accept":"application/json",
        "X-AIMPACT-Tenant-Context":tenantContext,
        "Idempotency-Key":submissionKey
      },
      body:JSON.stringify({schema_version:"1.0.0",answers})
    });
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(data.code||"INGEST_REJECTED");
    note(noteElement,"Diagnosis accepted and queued. Reference: "+data.submission_id,"accepted");
    event.currentTarget.reset();
    clearDraft();
    submissionKey=null;
    submissionFingerprint=null;
  }catch(error){
    note(noteElement,friendlyError(error.message)+" Your entries remain available for retry. The same request key will be reused.","blocked");
  }finally{
    submitting=false;
    setBusy(submitButton,false);
  }
});

async function boot(){
  if(!window.supabase?.createClient||!config.supabaseUrl||!config.supabaseKey){
    setWorkspaceLocked(true);
    note(authNote,"Secure sign-in is unavailable because public Supabase configuration could not be loaded.","error");
    return;
  }
  supabaseClient=window.supabase.createClient(config.supabaseUrl,config.supabaseKey,{
    auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}
  });
  supabaseClient.auth.onAuthStateChange((_event,newSession)=>{
    session=newSession;
    if(newSession)queueMicrotask(()=>refreshSession().catch(error=>note(authNote,friendlyError(error.message),"error")));
    else{authReady=false;tenantContext=null;clearDraft();submissionKey=null;submissionFingerprint=null;setWorkspaceLocked(true);}
  });
  try{await refreshSession();}catch(error){setWorkspaceLocked(true);note(authNote,"Session check failed: "+error.message,"error");}
}
setWorkspaceLocked(true);
boot();
