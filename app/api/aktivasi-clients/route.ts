import { cookies } from "next/headers"
import { NextResponse } from "next/server"

import { AUTH_COOKIE_NAME, verifyAuthToken } from "@/lib/auth"

const REMOTE_AKTIVASI_CLIENT_API = "http://10.20.25.8:8000/api/v1/aktivasi-clients"

const REQUIRED_FIELDS = [
  "nama_pelanggan",
  "nama_layanan",
  "kapasitas_layanan",
  "vlan_id",
  "nama_metro",
  "site_metro",
  "kapasitas_metro",
  "ip_address",
  "ip_gateway",
  "router_gateway",
] as const

type RemoteAktivasiPayload = Record<(typeof REQUIRED_FIELDS)[number], unknown>

type AktivasiClientItem = {
  id: number | null
  namaPelanggan: string
  namaLayanan: string
  kapasitasLayanan: string
  vlanId: string
  namaMetro: string
  siteMetro: string
  kapasitasMetro: string
  ipAddress: string
  ipGateway: string
  routerGateway: string
  createdBy: string | null
  createdAt: string | null
  updatedAt: string | null
}

function normalizeItem(item: unknown): AktivasiClientItem | null {
  if (!item || typeof item !== "object") {
    return null
  }
  const record = item as Record<string, unknown>
  const idRaw = record.id ?? record.ID ?? record.Id
  const id = typeof idRaw === "number" ? idRaw : Number(idRaw)

  const get = (key: string) => (typeof record[key] === "string" ? (record[key] as string).trim() : null)

  return {
    id: Number.isFinite(id) ? Number(id) : null,
    namaPelanggan: get("nama_pelanggan") ?? "-",
    namaLayanan: get("nama_layanan") ?? "-",
    kapasitasLayanan: get("kapasitas_layanan") ?? "-",
    vlanId: get("vlan_id") ?? "-",
    namaMetro: get("nama_metro") ?? "-",
    siteMetro: get("site_metro") ?? "-",
    kapasitasMetro: get("kapasitas_metro") ?? "-",
    ipAddress: get("ip_address") ?? "-",
    ipGateway: get("ip_gateway") ?? "-",
    routerGateway: get("router_gateway") ?? "-",
    createdBy: get("created_by"),
    createdAt: get("created_at"),
    updatedAt: get("updated_at"),
  }
}

function toApiResponse(items: AktivasiClientItem[]) {
  return {
    status: "ok",
    items,
  }
}

function sanitize(body: Partial<Record<string, unknown>>): RemoteAktivasiPayload {
  const result: Record<string, string> = {}
  for (const field of REQUIRED_FIELDS) {
    const value = body[field]
    if (typeof value !== "string" || !value.trim()) {
      throw new Error(`Field ${field} wajib diisi.`)
    }
    result[field] = value.trim()
  }
  return result as RemoteAktivasiPayload
}

export async function GET() {
  try {
    const response = await fetch(REMOTE_AKTIVASI_CLIENT_API, { cache: "no-store" })
    if (!response.ok) {
      throw new Error(`API mengembalikan status ${response.status}`)
    }

    const payload = (await response.json()) as unknown
    const dataArray = Array.isArray(payload)
      ? payload
      : Array.isArray((payload as Record<string, unknown>).data)
        ? (payload as Record<string, unknown>).data
        : []

    const items = dataArray
      .map((item) => normalizeItem(item))
      .filter((item): item is AktivasiClientItem => item !== null)

    return NextResponse.json(toApiResponse(items), { status: 200 })
  } catch (error) {
    console.error("[api/aktivasi-clients] failed to fetch data", error)
    return NextResponse.json(
      {
        status: "error",
        message: "Gagal mengambil data aktivasi reseller.",
      },
      { status: 500 },
    )
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<Record<string, unknown>>
    const payload = sanitize(body)

    const token = cookies().get(AUTH_COOKIE_NAME)?.value ?? null
    const auth = verifyAuthToken(token)
    if (!auth) {
      throw new Error("Anda belum login.")
    }

    const requestPayload = {
      ...payload,
      created_by: auth.username,
    }

    const response = await fetch(REMOTE_AKTIVASI_CLIENT_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestPayload),
    })

    if (!response.ok) {
      const errorPayload = await response.json().catch(() => null)
      const message =
        typeof errorPayload?.message === "string" && errorPayload.message.trim().length > 0
          ? errorPayload.message
          : `API mengembalikan status ${response.status}`
      throw new Error(message)
    }

    const result = await response.json().catch(() => ({ status: "ok" }))

    const refreshed = await fetch(REMOTE_AKTIVASI_CLIENT_API, { cache: "no-store" })
    const refreshedPayload = (await refreshed.json().catch(() => ({ data: [] }))) as unknown
    const refreshedArray = Array.isArray(refreshedPayload)
      ? refreshedPayload
      : Array.isArray((refreshedPayload as Record<string, unknown>).data)
        ? (refreshedPayload as Record<string, unknown>).data
        : []
    const items = refreshedArray
      .map((item) => normalizeItem(item))
      .filter((item): item is AktivasiClientItem => item !== null)

    return NextResponse.json(
      {
        ...toApiResponse(items),
        message: result?.message ?? "Aktivasi reseller berhasil disimpan.",
      },
      { status: 201 },
    )
  } catch (error) {
    console.error("[api/aktivasi-clients] failed to create", error)
    return NextResponse.json(
      {
        status: "error",
        message: error instanceof Error ? error.message : "Gagal menyimpan data aktivasi reseller.",
      },
      { status: 400 },
    )
  }
}
