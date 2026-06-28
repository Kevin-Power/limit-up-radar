import { NextResponse } from "next/server";
import { listDailyDates } from "@/lib/data-files";

export async function GET() {
  return NextResponse.json({ dates: listDailyDates() });
}
