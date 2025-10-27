"use client"

import { useRouter } from "next/navigation"
import { useCallback, useState } from "react"

export function LoginForm() {
  const router = useRouter()
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      setError(null)
      setIsSubmitting(true)

      try {
        const response = await fetch("/api/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username, password }),
        })

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { message?: string } | null
          const message = payload?.message ?? "Gagal masuk. Silakan coba lagi."
          throw new Error(message)
        }

        router.replace("/")
        router.refresh()
      } catch (err) {
        setError(err instanceof Error ? err.message : "Terjadi kesalahan. Silakan coba lagi.")
        setIsSubmitting(false)
      }
    },
    [password, router, username],
  )

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <label htmlFor="username" className="text-sm font-medium text-foreground">
          Username
        </label>
        <input
          id="username"
          name="username"
          type="text"
          autoComplete="username"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
          placeholder="Masukkan username"
          disabled={isSubmitting}
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="password" className="text-sm font-medium text-foreground">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
          placeholder="Masukkan password"
          disabled={isSubmitting}
        />
      </div>

      {error ? <p className="text-sm text-red-500">{error}</p> : null}

      <button
        type="submit"
        disabled={isSubmitting || !username || !password}
        className="w-full rounded bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-70"
      >
        {isSubmitting ? "Memproses..." : "Masuk"}
      </button>
    </form>
  )
}
