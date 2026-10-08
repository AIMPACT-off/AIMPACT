import fs from "node:fs";

const policy = JSON.parse(fs.readFileSync(new URL("./policy.json", import.meta.url), "utf8"));

export const REQUIRED_GATES = Object.freeze(policy.certification.required);

export function evaluateCertification(input = {}) {
  const gates = Object.fromEntries(REQUIRED_GATES.map(name => [name, input[name] === true]));
  const failed = Object.entries(gates).filter(([, ok]) => !ok).map(([name]) => name);
  return {
    state: failed.length === 0 ? "COMPLETED" : "NOT_VERIFIED_COMPLETE",
    verified: failed.length === 0,
    gates,
    failed
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const source = process.env.AIMPACT_CERTIFICATION_GATES
    ? JSON.parse(process.env.AIMPACT_CERTIFICATION_GATES)
    : {};
  const result = evaluateCertification(source);
  console.log(JSON.stringify(result, null, 2));
  if (!result.verified) process.exitCode = 2;
}
