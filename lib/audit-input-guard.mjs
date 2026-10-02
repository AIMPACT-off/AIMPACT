const MAX={industry:120,problem:3000,currentTools:1200,email:254,company:200};
const INJECTION_PATTERNS=[/ignore\\s+(all\\s+)?previous\\s+instructions/i,/system\\s+prompt/i,/developer\\s+message/i,/reveal\\s+(the\\s+)?(secret|api\\s*key|prompt)/i,/act\\s+as\\s+(an?\\s+)?(system|developer)/i,/<\\s*script/i,/\\b(jailbreak|prompt\\s+injection)\\b/i];
export function validateAuditInput(input){
 if(!input||typeof input!=="object"||Array.isArray(input))throw new Error("Invalid input");
 const out={};
 for(const [field,max] of Object.entries(MAX)){const value=String(input[field]??"").normalize("NFKC").trim();if(value.length>max)throw new Error(field+" exceeds maximum length");if(INJECTION_PATTERNS.some(p=>p.test(value)))throw new Error(field+" contains disallowed instruction-like content");out[field]=value;}
 if(!/^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/.test(out.email))throw new Error("Valid email is required");
 if(!out.problem)throw new Error("Business problem is required");
 return out;
}
export function createAuditAbuseKey({ip,email}){const domain=String(email??"").split("@").at(-1).toLowerCase();if(!ip||!domain||!domain.includes("."))throw new Error("IP and valid email domain are required");return{ipKey:"audit:ip:"+ip,domainKey:"audit:domain:"+domain};}
