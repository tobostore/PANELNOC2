import { NextResponse } from "next/server"
import crypto from "crypto"

type TokenPayload = {
  userId: number
  username: string
  exp: number
}

const HEADER_B64 = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url")

export const AUTH_COOKIE_NAME = "auth-token"

function getSecret(): string {
  return process.env.AUTH_SECRET || "dev-secret-key"
}

export function signAuthToken(payload: { userId: number; username: string; ttlMs?: number }): string {
  const exp = Date.now() + (payload.ttlMs ?? 24 * 60 * 60 * 1000)
  const body = Buffer.from(
    JSON.stringify({ userId: payload.userId, username: payload.username, exp }),
  ).toString("base64url")
  const signature = crypto.createHmac("sha256", getSecret()).update(`${HEADER_B64}.${body}`).digest("base64url")
  return `${HEADER_B64}.${body}.${signature}`
}

export function verifyAuthToken(token?: string | null): TokenPayload | null {
  if (!token) return null
  const parts = token.split(".")
  if (parts.length !== 3) return null
  const [header, body, signature] = parts
  if (header !== HEADER_B64) return null
  const expected = crypto.createHmac("sha256", getSecret()).update(`${header}.${body}`).digest("base64url")
  if (!timingSafeEqual(expected, signature)) {
    return null
  }
  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as TokenPayload
    if (typeof payload.exp !== "number" || payload.exp < Date.now()) {
      return null
    }
    return payload
  } catch {
    return null
  }
}

function timingSafeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a)
  const bBuf = Buffer.from(b)
  if (aBuf.length !== bBuf.length) return false
  return crypto.timingSafeEqual(aBuf, bBuf)
}

export function setAuthCookie(response: NextResponse, payload: { userId: number; username: string }) {
  const token = signAuthToken(payload)
  response.cookies.set({
    name: AUTH_COOKIE_NAME,
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24,
  })
}

export function clearAuthCookie(response: NextResponse) {
  response.cookies.set({
    name: AUTH_COOKIE_NAME,
    value: "",
    maxAge: 0,
    path: "/",
  })
}
