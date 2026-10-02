import { parentPort, workerData } from "node:worker_threads";

const WORKFLOWS = new Set([
  "mock-01", "mock-02", "mock-03", "mock-04",
  "mock-05", "mock-06", "mock-07", "mock-08"
]);

if (!WORKFLOWS.has(workerData?.workflowId)) {
  throw new Error("MOCK_WORKFLOW_NOT_REGISTERED");
}

const result = {
  workflowId: workerData.workflowId,
  tenantId: workerData.tenantId,
  status: "DRY_RUN_COMPLETED",
  accepted: true,
  inputKeys: Object.keys(workerData.payload ?? {}),
  executedAt: new Date().toISOString()
};
parentPort.postMessage(result);
