import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { Sql } from "postgres";

import {
  LINE_ITEMS,
  RFX_CATEGORY,
  RFX_GEOGRAPHY,
  RFX_OBJECTIVE,
  RFX_SCOPE,
  RFX_TITLE,
} from "./rfx/corrugated-fy27";
import { COMMERCIAL_TERMS, EVALUATION_CRITERIA, QUESTIONNAIRE } from "./rfx/questionnaire";
import { VENDOR_KEYS, VENDOR_PROFILES } from "./vendors/profiles";
import { EXPECTED_DOCUMENTS } from "./generate";

/**
 * Loads the demo RFx, its vendors, and their documents into Postgres.
 *
 * What this does NOT do: call a model, or write a single price, normalized
 * value, match or questionnaire verdict. Those are extraction outputs, and
 * seeding them would mean the demo's numbers came from this file rather than
 * from reading the documents — the exact failure the spec prohibits (§53).
 *
 * The documents are registered; reading them is Slice 4's job. A queued
 * extraction job per document is created so that pipeline has a work list.
 */

const DEMO_USER = {
  email: "buyer@northfieldconsumer.co.in",
  displayName: "Category Buyer",
};

const MIME_BY_EXTENSION: Record<string, { mime: string; kind: string }> = {
  ".xlsx": {
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    kind: "XLSX",
  },
  ".pdf": { mime: "application/pdf", kind: "PDF" },
  ".docx": {
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    kind: "DOCX",
  },
  ".jpg": { mime: "image/jpeg", kind: "IMAGE" },
  ".jpeg": { mime: "image/jpeg", kind: "IMAGE" },
  ".png": { mime: "image/png", kind: "IMAGE" },
  ".txt": { mime: "text/plain", kind: "TEXT" },
};

export interface SeedResult {
  rfqId: string;
  lineItemCount: number;
  questionCount: number;
  vendorCount: number;
  documentCount: number;
  jobCount: number;
}

/**
 * Removes every trace of the demo dataset.
 *
 * Deleting the RFx cascades through line items, vendors, responses, documents,
 * jobs, quotes, evidence, scenarios and conversations — the foreign keys make
 * reseeding safe without a schema drop.
 */
export async function clearDemoData(sql: Sql): Promise<void> {
  await sql`delete from rfqs where title = ${RFX_TITLE}`;
  await sql`delete from users where email = ${DEMO_USER.email}`;
}

export async function seedDemoData(sql: Sql, fixturesRoot: string): Promise<SeedResult> {
  return sql.begin(async (tx) => {
    await tx`delete from rfqs where title = ${RFX_TITLE}`;
    await tx`delete from users where email = ${DEMO_USER.email}`;

    const [user] = await tx<{ id: string }[]>`
      insert into users (email, display_name, role)
      values (${DEMO_USER.email}, ${DEMO_USER.displayName}, 'BUYER')
      returning id
    `;

    const [rfq] = await tx<{ id: string }[]>`
      insert into rfqs (
        owner_id, title, category, objective, scope, geography,
        status, creation_state, commercial_terms
      ) values (
        ${user!.id}, ${RFX_TITLE}, ${RFX_CATEGORY}, ${RFX_OBJECTIVE}, ${RFX_SCOPE},
        ${RFX_GEOGRAPHY},
        -- Responses are in; nothing has been extracted or analysed yet.
        'RESPONSES', 'APPROVED', ${tx.json(COMMERCIAL_TERMS)}
      )
      returning id
    `;
    const rfqId = rfq!.id;

    for (const line of LINE_ITEMS) {
      await tx`
        insert into rfq_line_items (
          rfq_id, position, sku_code, description, specifications, quantity, unit, currency, notes
        ) values (
          ${rfqId}, ${line.position}, ${line.skuCode}, ${line.description},
          ${tx.json(line.specifications)}, ${line.quantity}, ${line.unit},
          ${COMMERCIAL_TERMS.currency}, ${line.notes ?? null}
        )
      `;
    }

    for (const question of QUESTIONNAIRE) {
      await tx`
        insert into questionnaire_questions (
          rfq_id, position, question, type, required, mandatory_for_eligibility, options
        ) values (
          ${rfqId}, ${question.position}, ${question.question}, ${question.type},
          ${question.required}, ${question.mandatoryForEligibility},
          ${question.options ?? null}
        )
      `;
    }

    for (const criterion of EVALUATION_CRITERIA) {
      await tx`
        insert into evaluation_criteria (rfq_id, label, weight, description)
        values (${rfqId}, ${criterion.label}, ${criterion.weight}, ${criterion.description})
      `;
    }

    let documentCount = 0;
    let jobCount = 0;

    for (const vendorKey of VENDOR_KEYS) {
      const profile = VENDOR_PROFILES[vendorKey];

      const [vendor] = await tx<{ id: string }[]>`
        insert into vendors (rfq_id, name, short_label, contact_email, country)
        values (
          ${rfqId}, ${`${profile.name} ${profile.legalSuffix}`}, ${profile.shortLabel},
          ${profile.contactEmail}, 'India'
        )
        returning id
      `;

      const documents = EXPECTED_DOCUMENTS[vendorKey];
      const channel = documents.some((d) => d.endsWith(".txt")) ? "EMAIL" : "UPLOAD";

      const [response] = await tx<{ id: string }[]>`
        insert into vendor_responses (
          rfq_id, vendor_id, received_at, channel, status, expected_line_count
        ) values (
          ${rfqId}, ${vendor!.id}, ${profile.quotationDate}::date, ${channel},
          -- Nothing has been read yet. quoted_line_count stays null until the
          -- pipeline determines it by actually reading the documents.
          'QUEUED', ${LINE_ITEMS.length}
        )
        returning id
      `;

      for (const relativePath of documents) {
        const absolutePath = path.join(fixturesRoot, relativePath);
        const info = await stat(absolutePath);
        const extension = path.extname(relativePath).toLowerCase();
        const descriptor = MIME_BY_EXTENSION[extension];
        if (!descriptor) throw new Error(`No MIME mapping for ${relativePath}`);

        const [document] = await tx<{ id: string }[]>`
          insert into documents (
            vendor_response_id, filename, kind, mime_type, byte_size, storage_path, uploaded_at
          ) values (
            ${response!.id}, ${path.basename(relativePath)}, ${descriptor.kind},
            ${descriptor.mime}, ${info.size}, ${relativePath},
            ${profile.quotationDate}::date
          )
          returning id
        `;
        documentCount += 1;

        await tx`
          insert into extraction_jobs (rfq_id, vendor_response_id, document_id, state)
          values (${rfqId}, ${response!.id}, ${document!.id}, 'QUEUED')
        `;
        jobCount += 1;
      }
    }

    return {
      rfqId,
      lineItemCount: LINE_ITEMS.length,
      questionCount: QUESTIONNAIRE.length,
      vendorCount: VENDOR_KEYS.length,
      documentCount,
      jobCount,
    };
  });
}

/** Confirms every fixture referenced by the seed exists and is readable. */
export async function verifyFixtureFiles(fixturesRoot: string): Promise<string[]> {
  const missing: string[] = [];
  for (const vendorKey of VENDOR_KEYS) {
    for (const relativePath of EXPECTED_DOCUMENTS[vendorKey]) {
      const absolutePath = path.join(fixturesRoot, relativePath);
      try {
        const buffer = await readFile(absolutePath);
        if (buffer.byteLength === 0) missing.push(`${relativePath} (empty)`);
      } catch {
        missing.push(`${relativePath} (unreadable)`);
      }
    }
  }
  return missing;
}
