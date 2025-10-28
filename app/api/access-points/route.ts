// app/api/access-points/route.ts
import { NextResponse } from "next/server"
import {
  fetchRemoteAccessPoints,
  buildRemotePayload,
  handleRemoteError,
  parseUpsertPayload,
  parseIdParam,
  toApiResponse,
  REMOTE_ACCESS_POINT_API,
} from "./utils"

export async function GET() {
  try {
    const accessPoints = await fetchRemoteAccessPoints()
    return NextResponse.json(toApiResponse(accessPoints), { status: 200 })
  } catch (error) {
    console.error("[api/access-points] GET error:", error)
    return NextResponse.json({ status: "error", message: "Gagal mengambil data access point." }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>
    const payload = parseUpsertPayload(body)
    const response = await fetch(REMOTE_ACCESS_POINT_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildRemotePayload(payload)),
    })
    if (!response.ok) await handleRemoteError(response)

    const accessPoints = await fetchRemoteAccessPoints()
    return NextResponse.json(
      { ...toApiResponse(accessPoints), message: "Access point berhasil ditambahkan." },
      { status: 201 },
    )
  } catch (error) {
    console.error("[api/access-points] POST error:", error)
    return NextResponse.json(
      { status: "error", message: error instanceof Error ? error.message : "Gagal menambahkan access point." },
      { status: 400 },
    )
  }
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>
    const idRaw = body.id ?? body.ID ?? body.Id
    const id = typeof idRaw === "number" ? idRaw : Number(idRaw)
    if (!Number.isFinite(id) || id <= 0) throw new Error("ID access point tidak valid.")
    const payload = parseUpsertPayload(body)
    const endpoint = `${REMOTE_ACCESS_POINT_API}/${id}`

    const response = await fetch(endpoint, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildRemotePayload(payload)),
    })
    if (!response.ok) await handleRemoteError(response)

    const accessPoints = await fetchRemoteAccessPoints()
    return NextResponse.json(
      { ...toApiResponse(accessPoints), message: "Access point berhasil diperbarui." },
      { status: 200 },
    )
  } catch (error) {
    console.error("[api/access-points] PUT error:", error)
    return NextResponse.json(
      { status: "error", message: error instanceof Error ? error.message : "Gagal memperbarui access point." },
      { status: 400 },
    )
  }
}

export async function DELETE(request: Request) {
  try {
    const id = parseIdParam(request.url)
    const endpoint = `${REMOTE_ACCESS_POINT_API}/${id}`
    const response = await fetch(endpoint, { method: "DELETE" })
    if (!response.ok) await handleRemoteError(response)

    const accessPoints = await fetchRemoteAccessPoints()
    return NextResponse.json(
      { ...toApiResponse(accessPoints), message: "Access point berhasil dihapus." },
      { status: 200 },
    )
  } catch (error) {
    console.error("[api/access-points] DELETE error:", error)
    return NextResponse.json(
      { status: "error", message: error instanceof Error ? error.message : "Gagal menghapus access point." },
      { status: 400 },
    )
  }
}
