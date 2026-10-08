import fs from "node:fs";

const policy = JSON.parse(fs.readFileSync(new URL("./policy.json", import.meta.url), "utf8"));

const requiredStates = [
  "FACT","HYPOTHESIS","VERIFIED","BLOCKED",
  "APPROVAL_REQUIRED","FAILED","RECOVERING","LIVE"
];

const requiredDClasses = ["D0","D1","D2","D3"];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(policy.company === "AIMPACT", "company identity mismatch");
assert(policy.principal?.name === "Kim Hyung Nam", "principal identity missing");
assert(policy.principal?.final_decision_maker === true, "final authority is not explicitly locked");
assert(requiredStates.every(s => policy.states.includes(s)), "required state missing");
assert(requiredDClasses.every(s => Array.isArray(policy.decision_classes?.[s])), "decision class missing");
assert(policy.control_loop.length >= 8, "control loop incomplete");
assert(policy.error_loop.includes("ROOT_CAUSE"), "root cause control missing");
assert(policy.commercial_truth_rules.revenue_requires_transaction === true, "revenue truth gate missing");
assert(policy.commercial_truth_rules.outcome_requires_measurement === true, "outcome truth gate missing");
assert(policy.certification.default_state === "NOT_CERTIFIED", "certification default must be NOT_CERTIFIED");
assert(policy.certification.required.length >= 16, "certification gate incomplete");
assert(policy.certification.completion_rule === "ALL_REQUIRED_GATES_PASS", "strict completion rule missing");

console.log("AIMPACT CENTRAL CONTROL POLICY: VALID");
console.log("Principal:", policy.principal.name);
console.log("Decision classes:", requiredDClasses.join(", "));
console.log("Certification:", policy.certification.default_state);
