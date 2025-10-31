import { cookies } from "next/headers"
import { redirect } from "next/navigation"
import Image from "next/image"

import { AUTH_COOKIE_NAME, verifyAuthToken } from "@/lib/auth"

import { LoginForm } from "./login-form"

export default function LoginPage() {
  const token = cookies().get(AUTH_COOKIE_NAME)?.value ?? null
  if (token && verifyAuthToken(token)) {
    redirect("/")
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#EEF2FF]">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-8 shadow-xl">
        <div className="mb-6 text-center">
          {/* Logo */}
          <div className="mb-4 flex justify-center">
            <Image 
              src="/resouce/logo/logo_global.png" 
              alt="Logo NOC Panel" 
              width={420} 
              height={420} 
              className="rounded-lg object-cover"
            />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Masuk ke NOC Panel</h1>
          <p className="mt-1 text-sm text-muted-foreground"></p>
        </div>
        <LoginForm />
      </div>
    </main>
  )
}
