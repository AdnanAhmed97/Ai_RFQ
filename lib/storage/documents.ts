import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env, isStorageConfigured } from "@/lib/config/env";

/**
 * Document storage.
 *
 * Two backends, one interface. Supabase Storage when it is configured — which
 * is what a deployed instance needs, since a serverless filesystem holds nothing
 * a user uploaded. The repository's own `fixtures/` directory otherwise, so a
 * fresh clone runs with no cloud account at all.
 *
 * A storage path is data. It is resolved against a fixed root and never trusted
 * to escape it.
 */
let cached: SupabaseClient | null = null;

function storageClient(): SupabaseClient {
  if (cached) return cached;
  cached = createClient(env.SUPABASE_URL!, env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}

export function fixturesRoot(): string {
  return path.resolve(process.cwd(), "fixtures");
}

export class DocumentNotFoundError extends Error {
  constructor(readonly storagePath: string) {
    super(`No document at ${storagePath}.`);
    this.name = "DocumentNotFoundError";
  }
}

/** Reads a document, from whichever backend holds it. */
export async function readDocument(storagePath: string): Promise<Buffer> {
  if (isStorageConfigured()) {
    const { data, error } = await storageClient()
      .storage.from(env.SUPABASE_STORAGE_BUCKET)
      .download(storagePath);

    if (!error && data) return Buffer.from(await data.arrayBuffer());
    // Fall through to disk: a seeded instance may hold fixtures locally even
    // when storage is configured for uploads.
  }

  const root = fixturesRoot();
  const resolved = path.resolve(root, storagePath);
  // A path from the database must not reach outside the fixtures root.
  if (!resolved.startsWith(root + path.sep)) throw new DocumentNotFoundError(storagePath);

  try {
    return await readFile(resolved);
  } catch {
    throw new DocumentNotFoundError(storagePath);
  }
}

export async function uploadDocument(params: {
  storagePath: string;
  body: Buffer;
  contentType: string;
}): Promise<void> {
  if (!isStorageConfigured()) {
    throw new Error("Supabase Storage is not configured; cannot upload.");
  }

  const { error } = await storageClient()
    .storage.from(env.SUPABASE_STORAGE_BUCKET)
    .upload(params.storagePath, params.body, {
      contentType: params.contentType,
      upsert: true,
    });

  if (error) throw new Error(`Upload failed for ${params.storagePath}: ${error.message}`);
}

/** Creates the bucket if it is absent. Private: documents are commercially sensitive. */
export async function ensureBucket(): Promise<"created" | "exists"> {
  if (!isStorageConfigured()) throw new Error("Supabase Storage is not configured.");

  const client = storageClient();
  const { data } = await client.storage.getBucket(env.SUPABASE_STORAGE_BUCKET);
  if (data) return "exists";

  const { error } = await client.storage.createBucket(env.SUPABASE_STORAGE_BUCKET, {
    public: false,
    fileSizeLimit: `${env.MAX_UPLOAD_MB}MB`,
  });
  if (error) throw new Error(`Could not create bucket: ${error.message}`);
  return "created";
}

/** A short-lived URL for viewing one document. Never a public link. */
export async function signedDocumentUrl(
  storagePath: string,
  expiresInSeconds = 300,
): Promise<string | null> {
  if (!isStorageConfigured()) return null;
  const { data } = await storageClient()
    .storage.from(env.SUPABASE_STORAGE_BUCKET)
    .createSignedUrl(storagePath, expiresInSeconds);
  return data?.signedUrl ?? null;
}
