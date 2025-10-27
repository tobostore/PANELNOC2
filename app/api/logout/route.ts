import { NextResponse } from "next/server"

import { clearAuthCookie } from "@/lib/auth"

export async function POST() {
  const response = NextResponse.json({ status: "ok" })
  clearAuthCookie(response)
  return response
}
