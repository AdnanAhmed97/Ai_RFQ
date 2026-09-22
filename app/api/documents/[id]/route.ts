import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { getSql, isSqlConfigured } from "@/lib/db/sql";
import { fixturesRoot } from "@/lib/documents/ingest";

export const runtime = "nodejs";

/**
 * Serves a stored vendor document for viewing.
 *
 * The path is resolved from the database row, never from the request, and the
 * result is confined to the fixtures root — a storage path is data, and data
 * that reaches the filesystem has to be constrained.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isSqlConfigured()) {
    return NextResponse.json({ error: "Database is not configured." }, { status: 503 });
  }

  const sql = getSql();
  const [document] = await sql<{ filename: string; mime_type: string; storage_path: string }[]>`
    select filename, mime_type, storage_path from documents where id = ${id}
  `;
  if (!document) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const root = fixturesRoot();
  const resolved = path.resolve(root, document.storage_path);
  if (!resolved.startsWith(root + path.sep)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  try {
    const body = await readFile(resolved);
    return new NextResponse(new Uint8Array(body), {
      headers: {
        "content-type": document.mime_type,
        "content-disposition": `inline; filename="${document.filename.replace(/"/g, "")}"`,
        "cache-control": "private, max-age=300",
      },
    });
  } catch {
    return NextResponse.json({ error: "File missing on disk." }, { status: 404 });
  }
}
