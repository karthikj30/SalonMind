import { NextResponse } from "next/server";
import versions from "../../../../apps/version.json";
import { APK_PATH, DESKTOP_RELEASES } from "@/lib/domain/apps";

/** Latest app-shell versions (apps/version.json). The desktop app and the update banner check this. */
export function GET() {
  return NextResponse.json({ ...versions, downloads: { android: APK_PATH, desktop: DESKTOP_RELEASES } }, { headers: { "cache-control": "no-store" } });
}
