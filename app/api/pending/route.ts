import { NextResponse } from "next/server"

import { createPendingItem, deletePendingItem, fetchPendingItems } from "@/lib/db"

type PendingItem = {
  id: number
  customerName: string
  description: string
  address: string
  kabupaten: string
  createdAt: string
}

function normalizePendingRow(row: Awaited<ReturnType<typeof fetchPendingItems>>[number]): PendingItem {
  return {
    id: row.id,
    customerName: row.customer_name,
    description: row.description,
    address: row.address,
    kabupaten: row.kabupaten,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
  }
}

function toApiResponse(items: PendingItem[]) {
  return {
    status: "ok",
    items,
  }
}

export async function GET() {
  try {
    const rows = await fetchPendingItems()
    return NextResponse.json(toApiResponse(rows.map(normalizePendingRow)), { status: 200 })
  } catch (error) {
    console.error("[api/pending] failed to fetch data", error)
    return NextResponse.json(
      {
        status: "error",
        message: "Gagal mengambil data pendingan.",
      },
      { status: 500 },
    )
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>
    const customerName = typeof body.customerName === "string" ? body.customerName.trim() : ""
    const description = typeof body.description === "string" ? body.description.trim() : ""
    const address = typeof body.address === "string" ? body.address.trim() : ""
    const kabupatenRaw = typeof body.kabupaten === "string" ? body.kabupaten.trim().toLowerCase() : ""

    if (!customerName || !description || !address || !kabupatenRaw) {
      throw new Error("Nama pelanggan, keterangan, alamat, dan kabupaten wajib diisi.")
    }

    await createPendingItem({
      customerName,
      description,
      address,
      kabupaten: kabupatenRaw,
    })

    const rows = await fetchPendingItems()
    return NextResponse.json(
      {
        ...toApiResponse(rows.map(normalizePendingRow)),
        message: "Pendingan berhasil ditambahkan.",
      },
      { status: 201 },
    )
  } catch (error) {
    console.error("[api/pending] failed to create", error)
    return NextResponse.json(
      {
        status: "error",
        message: error instanceof Error ? error.message : "Gagal menambahkan pendingan.",
      },
      { status: 400 },
    )
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const idParam = searchParams.get("id")
    const id = idParam ? Number(idParam) : NaN
    if (!Number.isFinite(id) || id <= 0) {
      throw new Error("ID pendingan tidak valid.")
    }

    await deletePendingItem(id)
    const rows = await fetchPendingItems()
    return NextResponse.json(
      {
        ...toApiResponse(rows.map(normalizePendingRow)),
        message: "Pendingan berhasil dihapus.",
      },
      { status: 200 },
    )
  } catch (error) {
    console.error("[api/pending] failed to delete", error)
    return NextResponse.json(
      {
        status: "error",
        message: error instanceof Error ? error.message : "Gagal menghapus pendingan.",
      },
      { status: 400 },
    )
  }
}
