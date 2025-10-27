import { NextResponse } from "next/server"

const REMOTE_IP_ADDRESS_API = "http://10.20.25.8:8000/api/v1/ip-addresses"

type PublicIpItem = {
  id: number
  ipAddress: string | null
  subnet: string | null
  customerName: string | null
  status: string | null
  description: string | null
  createdAt: string | null
  updatedAt: string | null
}

type NormalizedResponse = {
  status: "ok"
  items: PublicIpItem[]
}

async function fetchRemoteItems(): Promise<PublicIpItem[]> {
  const response = await fetch(REMOTE_IP_ADDRESS_API, { cache: "no-store" })
  if (!response.ok) {
    throw new Error(`API mengembalikan status ${response.status}`)
  }

  const payload = (await response.json()) as unknown
  const rawItems = extractIpItems(payload)
  return rawItems
    .map((item) => normalizeRemoteItem(item))
    .filter((item): item is PublicIpItem => item !== null)
}

function toStringOrNull(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim()
    return trimmed === "" ? null : trimmed
  }

  if (value === null || value === undefined) {
    return null
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value)
  }

  return null
}

function extractIpItems(payload: unknown): unknown[] {
  if (Array.isArray(payload)) {
    return payload
  }

  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>
    const candidateKeys = ["data", "items", "result", "ip_addresses", "ipAddresses"]

    for (const key of candidateKeys) {
      const value = record[key]
      if (Array.isArray(value)) {
        return value
      }
    }
  }

  return []
}

function normalizeRemoteItem(item: unknown): PublicIpItem | null {
  if (!item || typeof item !== "object") {
    return null
  }

  const record = item as Record<string, unknown>
  const idRaw = record.id ?? record.ID ?? record.Id
  const id = typeof idRaw === "number" ? idRaw : Number(idRaw)

  if (!Number.isFinite(id)) {
    return null
  }

  const ipAddress = toStringOrNull(record.ip_address ?? record.ipAddress ?? record.ip)
  const subnet = toStringOrNull(record.subnet)
  const customerName = toStringOrNull(record.nama_pelanggan ?? record.customer_name ?? record.customerName)
  const status = toStringOrNull(record.status)
  const description = toStringOrNull(record.description)

  const createdAtRaw = toStringOrNull(record.created_at ?? record.createdAt)
  const updatedAtRaw = toStringOrNull(record.updated_at ?? record.updatedAt)

  const normalizeTimestamp = (value: string | null) => {
    if (!value) {
      return null
    }
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) {
      return value
    }
    return date.toISOString()
  }

  return {
    id,
    ipAddress,
    subnet,
    customerName,
    status,
    description,
    createdAt: normalizeTimestamp(createdAtRaw),
    updatedAt: normalizeTimestamp(updatedAtRaw),
  }
}

export async function GET() {
  try {
    const items = await fetchRemoteItems()
    const result: NormalizedResponse = {
      status: "ok",
      items,
    }

    return NextResponse.json(result, { status: 200 })
  } catch (error) {
    console.error("[api/ip-addresses] failed to fetch data", error)
    return NextResponse.json(
      {
        status: "error",
        message: "Gagal mengambil data IP publik.",
      },
      { status: 500 },
    )
  }
}

function sanitizeRequiredString(property: string, value: unknown): string {
  if (typeof value === "string") {
    const trimmed = value.trim()
    if (trimmed) {
      return trimmed
    }
  }
  throw new Error(`${property} wajib diisi.`)
}

function sanitizeOptionalString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null
  }
  const trimmed = value.trim()
  return trimmed === "" ? null : trimmed
}

function parseIdParam(url: string): number {
  const { searchParams } = new URL(url)
  const idParam = searchParams.get("id")
  if (!idParam) {
    throw new Error("Parameter id wajib diisi.")
  }
  const id = Number(idParam)
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error("Parameter id tidak valid.")
  }
  return id
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>

    const ipAddress = sanitizeRequiredString("IP address", body.ipAddress ?? body.ip_address)
    const subnet = sanitizeOptionalString(body.subnet)
    const customerName = sanitizeRequiredString("Nama pelanggan", body.customerName ?? body.nama_pelanggan)
    const status = sanitizeOptionalString(body.status)
    const description = sanitizeOptionalString(body.description)

    const payload = {
      ip_address: ipAddress,
      subnet,
      nama_pelanggan: customerName,
      status,
      description,
    }

    const response = await fetch(REMOTE_IP_ADDRESS_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })

    if (!response.ok) {
      let message = `API mengembalikan status ${response.status}`
      try {
        const errorPayload = (await response.json()) as Record<string, unknown>
        const candidates = [errorPayload.message, errorPayload.error, errorPayload.detail]
        const resolved = candidates.find((item): item is string => typeof item === "string" && item.trim().length > 0)
        if (resolved) {
          message = resolved
        }
      } catch {
        // ignore parsing error and keep default message
      }
      throw new Error(message)
    }

    const items = await fetchRemoteItems()
    return NextResponse.json(
      {
        status: "ok",
        message: "IP publik berhasil ditambahkan.",
        items,
      },
      { status: 201 },
    )
  } catch (error) {
    console.error("[api/ip-addresses] failed to create data", error)
    return NextResponse.json(
      {
        status: "error",
        message: error instanceof Error ? error.message : "Gagal menambahkan IP publik.",
      },
      { status: 400 },
    )
  }
}

export async function DELETE(request: Request) {
  try {
    const id = parseIdParam(request.url)
    const endpoint = `${REMOTE_IP_ADDRESS_API}/${id}`

    const response = await fetch(endpoint, { method: "DELETE" })

    if (!response.ok) {
      let message = `API mengembalikan status ${response.status}`
      try {
        const errorPayload = (await response.json()) as Record<string, unknown>
        const resolved = [errorPayload.message, errorPayload.error, errorPayload.detail].find(
          (item): item is string => typeof item === "string" && item.trim().length > 0,
        )
        if (resolved) {
          message = resolved
        }
      } catch {
        // ignore
      }
      throw new Error(message)
    }

    const items = await fetchRemoteItems()
    return NextResponse.json(
      {
        status: "ok",
        message: "IP publik berhasil dihapus.",
        items,
      },
      { status: 200 },
    )
  } catch (error) {
    console.error("[api/ip-addresses] failed to delete data", error)
    return NextResponse.json(
      {
        status: "error",
        message: error instanceof Error ? error.message : "Gagal menghapus IP publik.",
      },
      { status: 400 },
    )
  }
}
