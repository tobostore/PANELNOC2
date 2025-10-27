import type { ReactNode } from "react"
import { cookies } from "next/headers"
import { redirect } from "next/navigation"

import { AUTH_COOKIE_NAME, verifyAuthToken } from "@/lib/auth"

export default function ProtectedLayout({ children }: { children: ReactNode }) {
  const cookieStore = cookies()
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value ?? null

  const payload = verifyAuthToken(token)
  if (!payload) {
    redirect("/login")
  }

  return <>{children}</>
}
