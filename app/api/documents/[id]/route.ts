import { NextResponse } from "next/server";
import { getSql, isSqlConfigured } from "@/lib/db/sql";
import { DocumentNotFoundError, readDocument } from "@/lib/storage/documents";

export const runtime = "nodejs";

/**
 * Serves a stored vendor document for viewing.
 *
 * The path comes from the database row, never from the request, and the storage
 * layer confines it — a storage path is data, and data that reaches a
 * filesystem has to be constrained.
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

  try {
    const body = await readDocument(document.storage_path);
    return new NextResponse(new Uint8Array(body), {
      headers: {
        "content-type": document.mime_type,
        "content-disposition": `inline; filename="${document.filename.replace(/"/g, "")}"`,
        "cache-control": "private, max-age=300",
      },
    });
  } catch (error) {
    if (error instanceof DocumentNotFoundError) {
      return NextResponse.json({ error: "Document is not in storage." }, { status: 404 });
    }
    throw error;
  }
}
