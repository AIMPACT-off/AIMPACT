import { z } from "zod";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { validateAuditInput } from "../lib/audit-input-guard.mjs";
import { calculateAuditRoi } from "../lib/audit-roi.mjs";

const DecisionSchema = z.object({
  workflowId: z.string().regex(/^mock-0[1-8]$/),
  rationale: z.string().min(1).max(1000),
  confidence: z.number().min(0).max(1)
}).strict();

export async function generateAuditPdf({ company, decision, execution, roi }) {
  const fontUrl = new URL("../node_modules/@fontsource/noto-sans-kr/files/noto-sans-kr-korean-400-normal.woff2", import.meta.url);
  const fontBytes = await readFile(fontUrl);
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const font = await pdf.embedFont(fontBytes, { subset: true });
  let page = pdf.addPage([595, 842]);
  const margin = 48, maxWidth = 499, fontSize = 10.5, lineHeight = 19;
  let y = 790;
  const drawLine = line => {
    if (y < 60) { page = pdf.addPage([595, 842]); y = 790; }
    page.drawText(line, { x: margin, y, size: fontSize, font });
    y -= lineHeight;
  };
  const lines = [
    "AIMPACT | 기업 AI 진단 보고서",
    "기업명: " + company,
    "진단 결정: " + decision.rationale,
    "워크플로 상태: " + execution.output.status,
    "ROI 근거 수준: " + roi.confidence,
    "월간 절감 예상 시간: " + roi.monthlyHoursSaved,
    "월간 순절감 예상액: " + roi.monthlyNetSavings,
    "산정 안내: " + roi.disclaimer
  ];
  for (const sourceLine of lines) {
    let line = "";
    for (const character of Array.from(String(sourceLine))) {
      const candidate = line + character;
      if (line && font.widthOfTextAtSize(candidate, fontSize) > maxWidth) {
        drawLine(line); line = character;
      } else line = candidate;
    }
    if (line) drawLine(line);
    y -= 8;
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
    requestId: randomUUID(),
    tenantId: "audit-" + randomUUID(),
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
