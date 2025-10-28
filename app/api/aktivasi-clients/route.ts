import { cookies } from "next/headers"
import { NextResponse } from "next/server"

import { AUTH_COOKIE_NAME, verifyAuthToken } from "@/lib/auth"

const REMOTE_AKTIVASI_CLIENT_API = "http://10.20.25.8:8000/api/v1/aktivasi-clients"

const CAMEL_TO_SNAKE_MAP: Record<string, string> = {
  namaPelanggan: "nama_pelanggan",
  namaLayanan: "nama_layanan",
  kapasitasLayanan: "kapasitas_layanan",
  vlanId: "vlan_id",
  namaMetro: "nama_metro",
  siteMetro: "site_metro",
  kapasitasMetro: "kapasitas_metro",
  ipAddress: "ip_address",
  ipGateway: "ip_gateway",
  routerGateway: "router_gateway",
} as const

type RemoteAktivasiPayload = Record<(typeof CAMEL_TO_SNAKE_MAP)[keyof typeof CAMEL_TO_SNAKE_MAP], string>

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
  for (const camelKey in CAMEL_TO_SNAKE_MAP) {
    const value = body[camelKey]
    if (typeof value !== "string" || !value.trim()) {
      throw new Error(`Field ${camelKey} wajib diisi.`)
    }
    result[CAMEL_TO_SNAKE_MAP[camelKey]] = value.trim()
  }
  return result as RemoteAktivasiPayload
}

async function fetchAllItems(): Promise<AktivasiClientItem[]> {
    const response = await fetch(REMOTE_AKTIVASI_CLIENT_API, { cache: "no-store" })
    if (!response.ok) {
      console.error("[api/aktivasi-clients] failed to fetch all items, remote API error", { status: response.status })
      throw new Error(`API mengembalikan status ${response.status}`)
    }

    const payload = (await response.json()) as unknown
    const dataArray = Array.isArray(payload)
      ? payload
      : Array.isArray((payload as Record<string, unknown>).data)
        ? (payload as Record<string, unknown>).data
        : []

    return dataArray
      .map((item) => normalizeItem(item))
      .filter((item): item is AktivasiClientItem => item !== null)
}

export async function GET() {
  try {
    const items = await fetchAllItems()
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
        return NextResponse.json({ status: "error", message: "Anda belum login." }, { status: 401 })
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
    const items = await fetchAllItems()

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

export async function PUT(request: Request) {
    try {
      const body = (await request.json()) as Partial<Record<string, unknown> & { id: number | string }>
      const { id, ...data } = body
  
      if (!id) {
        throw new Error("ID aktivasi tidak valid atau tidak tersedia.")
      }
  
      const payload = sanitize(data)
  
      const token = cookies().get(AUTH_COOKIE_NAME)?.value ?? null
      const auth = verifyAuthToken(token)
      if (!auth) {
        return NextResponse.json({ status: "error", message: "Anda belum login." }, { status: 401 })
      }
  
      const response = await fetch(`${REMOTE_AKTIVASI_CLIENT_API}/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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
      const items = await fetchAllItems()
  
      return NextResponse.json(
        {
          ...toApiResponse(items),
          message: result?.message ?? "Aktivasi reseller berhasil diperbarui.",
        },
        { status: 200 },
      )
    } catch (error) {
      console.error("[api/aktivasi-clients] failed to update", error)
      return NextResponse.json(
        {
          status: "error",
          message: error instanceof Error ? error.message : "Gagal memperbarui data aktivasi reseller.",
        },
        { status: 400 },
      )
    }
  }
  
  export async function DELETE(request: Request) {
    try {
      const { searchParams } = new URL(request.url)
      const id = searchParams.get("id")
  
      if (!id) {
        throw new Error("ID aktivasi tidak ditemukan.")
      }
  
      const token = cookies().get(AUTH_COOKIE_NAME)?.value ?? null
      const auth = verifyAuthToken(token)
      if (!auth) {
        return NextResponse.json({ status: "error", message: "Anda belum login." }, { status: 401 })
      }
  
      const response = await fetch(`${REMOTE_AKTIVASI_CLIENT_API}/${id}`, {
        method: "DELETE",
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
      const items = await fetchAllItems()
  
      return NextResponse.json(
        {
          ...toApiResponse(items),
          message: result?.message ?? "Aktivasi reseller berhasil dihapus.",
        },
        { status: 200 },
      )
    } catch (error) {
      console.error("[api/aktivasi-clients] failed to delete", error)
      return NextResponse.json(
        {
          status: "error",
          message: error instanceof Error ? error.message : "Gagal menghapus data aktivasi reseller.",
        },
        { status: 400 },
      )
    }
  }