import { NextResponse } from "next/server"

import { verifyAdminCredentials } from "@/lib/db"
import { clearAuthCookie, setAuthCookie } from "@/lib/auth"

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>
    const username = typeof body.username === "string" ? body.username.trim() : ""
    const password = typeof body.password === "string" ? body.password : ""

    if (!username || !password) {
      return NextResponse.json(
        { status: "error", message: "Username dan password wajib diisi." },
        { status: 400 },
      )
    }

    const user = await verifyAdminCredentials(username, password)
    if (!user) {
      return NextResponse.json(
        { status: "error", message: "Username atau password salah." },
        { status: 401 },
      )
    }

    const response = NextResponse.json({ status: "ok", user: { id: user.id, username: user.username } })
    setAuthCookie(response, { userId: user.id, username: user.username })
    return response
  } catch (error) {
    console.error("[api/login] error", error)
    return NextResponse.json(
      { status: "error", message: "Terjadi kesalahan pada server." },
      { status: 500 },
    )
  }
}

export async function DELETE() {
  const response = NextResponse.json({ status: "ok" })
  clearAuthCookie(response)
  return response
}
