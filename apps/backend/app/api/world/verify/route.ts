import { NextResponse } from "next/server";

/** World is retired from the active submission; never mint permissions for immutable legacy gates. */
export async function POST() {
  return NextResponse.json({
    error: "World verification has been retired. New campaigns use public funding and CRE release review.",
  }, { status: 410, headers: { "cache-control": "no-store" } });
}
