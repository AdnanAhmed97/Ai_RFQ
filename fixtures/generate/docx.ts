import { writeFile } from "node:fs/promises";
import path from "node:path";
import {
  AlignmentType,
  BorderStyle,
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";

import { QUESTIONNAIRE } from "../rfx/questionnaire";
import { VENDOR_PROFILES } from "../vendors/profiles";
import { QUESTIONNAIRE_ANSWERS } from "../vendors/questionnaire-answers";
import type { EvidenceRecord, GeneratedDocument } from "./types";
import { stabilizeOoxml } from "./determinism";

const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };

/**
 * Vendor B returned the questionnaire as a Word document — the form typed up
 * in a table, which is how most suppliers actually send these back.
 */
export async function generateVendorBQuestionnaire(root: string): Promise<GeneratedDocument> {
  const profile = VENDOR_PROFILES["vendor-b"];
  const answers = QUESTIONNAIRE_ANSWERS["vendor-b"];
  const evidence: EvidenceRecord[] = [];

  const headerParagraphs = [
    new Paragraph({
      children: [new TextRun({ text: profile.name, bold: true, size: 32, color: "1A3A5C" })],
    }),
    new Paragraph({
      children: [new TextRun({ text: profile.legalSuffix, size: 16, color: "444444" })],
    }),
    new Paragraph({
      children: [new TextRun({ text: profile.addressLine, size: 16, color: "555555" })],
    }),
    new Paragraph({
      children: [
        new TextRun({
          text: `GSTIN: ${profile.gstin}  |  T: ${profile.phone}  |  ${profile.contactEmail}`,
          size: 16,
          color: "555555",
        }),
      ],
      spacing: { after: 240 },
    }),
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({ text: "Supplier Questionnaire — Corrugated Packaging FY27", bold: true, size: 24 }),
      ],
      spacing: { after: 160 },
    }),
    new Paragraph({
      children: [
        new TextRun({ text: `Submitted by: ${profile.contactName}`, size: 18 }),
        new TextRun({ text: `\t\tDate: ${profile.quotationDate}`, size: 18 }),
      ],
      spacing: { after: 200 },
    }),
  ];

  const rows: TableRow[] = [
    new TableRow({
      tableHeader: true,
      children: ["Ref", "Question", "Response"].map(
        (label, i) =>
          new TableCell({
            width: { size: i === 0 ? 8 : i === 1 ? 46 : 46, type: WidthType.PERCENTAGE },
            shading: { fill: "EEF1F5" },
            children: [
              new Paragraph({ children: [new TextRun({ text: label, bold: true, size: 18 })] }),
            ],
          }),
      ),
    }),
  ];

  for (const question of QUESTIONNAIRE) {
    const answer = answers.find((a) => a.ref === question.ref);
    if (!answer) continue;

    rows.push(
      new TableRow({
        children: [
          new TableCell({
            children: [
              new Paragraph({ children: [new TextRun({ text: question.ref, bold: true, size: 18 })] }),
            ],
          }),
          new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: question.question, size: 18 })] })],
          }),
          new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: answer.answerText, size: 18 })] })],
          }),
        ],
      }),
    );

    evidence.push({
      field: `questionnaire:${question.ref}`,
      sourceText: answer.answerText,
    });
  }

  const doc = new Document({
    creator: `${profile.name} ${profile.legalSuffix}`,
    title: "Supplier Questionnaire — Corrugated Packaging FY27",
    sections: [
      {
        children: [
          ...headerParagraphs,
          new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows }),
          new Paragraph({
            spacing: { before: 360 },
            children: [new TextRun({ text: `For ${profile.name} ${profile.legalSuffix}`, size: 18 })],
            border: { top: NO_BORDER },
          }),
          new Paragraph({
            spacing: { before: 360 },
            children: [new TextRun({ text: profile.contactName, size: 18 })],
          }),
          new Paragraph({
            children: [new TextRun({ text: "Authorised Signatory", size: 14, color: "666666" })],
          }),
        ],
      },
    ],
  });

  const relativePath = "vendors/vendor-b/questionnaire.docx";
  await writeFile(path.join(root, relativePath), await stabilizeOoxml(await Packer.toBuffer(doc)));

  return {
    relativePath,
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    kind: "DOCX",
    evidence,
  };
}
