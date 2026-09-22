import { NextResponse } from "next/server";
import { isSqlConfigured } from "@/lib/db/sql";
import { buildComparisonCsv } from "@/lib/exports/csv";

export const runtime = "nodejs";

/** Exports the comparison. CSV today; XLSX and the PDF brief follow. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isSqlConfigured()) {
    return NextResponse.json({ error: "Database is not configured." }, { status: 503 });
  }

  const format = new URL(request.url).searchParams.get("format") ?? "csv";
  if (format !== "csv") {
    return NextResponse.json(
      { error: `Export format "${format}" is not implemented yet.` },
      { status: 501 },
    );
  }

  const csv = await buildComparisonCsv(id);
  if (!csv) return NextResponse.json({ error: "RFx not found." }, { status: 404 });

  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="commercial-comparison.csv"`,
    },
  });
}
