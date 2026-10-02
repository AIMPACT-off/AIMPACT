import { z } from "zod";
import { randomUUID } from "node:crypto";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { validateAuditInput } from "../lib/audit-input-guard.mjs";
import { calculateAuditRoi } from "../lib/audit-roi.mjs";

const DecisionSchema = z.object({
  workflowId: z.string().regex(/^mock-0[1-8]$/),
  rationale: z.string().min(1).max(1000),
  confidence: z.number().min(0).max(1)
}).strict();

export async function generateAuditPdf({ company, decision, execution, roi }) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const lines = [
    "AIMPACT | BUSINESS AI AUDIT",
    "Company: " + company,
    "Decision: " + decision.rationale,
    "Workflow status: " + execution.output.status,
    "ROI evidence: " + roi.confidence,
    "Monthly hours saved (estimate): " + roi.monthlyHoursSaved,
    "Monthly net savings (estimate): " + roi.monthlyNetSavings,
    roi.disclaimer
  ];
  let y = 790;
  for (const line of lines) {
    page.drawText(line.slice(0, 110), { x: 48, y, size: 11, font });
    y -= 28;
  }
  return await pdf.save();
}

export async function runAuditPipeline({ input, dispatcher, roiOptions = {} }) {
  if (!dispatcher?.dispatch) throw new TypeError("A server dispatcher is required");
  // Treat all submitted text as untrusted data; validation is a filter, not a complete prompt-injection defense.
  const sanitized = validateAuditInput(input);
  const decision = DecisionSchema.parse({
    workflowId: "mock-01",
    rationale: "Prepare a non-executing diagnostic dry-run for the stated business problem.",
    confidence: 0.5
  });
  const execution = await dispatcher.dispatch({
    requestId: crypto.randomUUID(),
    tenantId: "audit-" + sanitized.email.toLowerCase(),
    workflowId: decision.workflowId,
    payload: { company: sanitized.company, industry: sanitized.industry, problem: sanitized.problem, currentTools: sanitized.currentTools }
  });
  const roi = calculateAuditRoi(roiOptions);
  const pdf = await generateAuditPdf({ company: sanitized.company, decision, execution, roi });
  return {
    stage: "COMPLETED",
    sanitizedInput: sanitized,
    decision,
    execution,
    roi,
    report: { contentType: "application/pdf", bytes: pdf, byteLength: pdf.length }
  };
}
