import { NextResponse } from "next/server"

import type { ClientRow, RouterRow } from "@/lib/db"
import { createClient, deleteClient, fetchClients, fetchRouters, updateClient, updateClientStatus } from "@/lib/db"

type ClientItem = {
  id: number
  username: string
  ipAddress: string | null
  type: string | null
  status: string | null
  profile: string | null
  originalProfile: string | null
  comment: string | null
  routerId: number | null
  routerName: string | null
}

type PaginationMeta = {
  page: number
  pageSize: number
  totalItems: number
  totalPages: number
  hasNext: boolean
  hasPrevious: boolean
  search: string
  routerId: number | null
}

type FetchClientsPayload = Awaited<ReturnType<typeof fetchClients>>

type ApiResponseExtras = {
  routers?: RouterRow[]
}

function normalizeClientRow(row: ClientRow): ClientItem {
  return {
    id: row.id,
    username: row.username,
    ipAddress: row.ip_address,
    type: row.type,
    status: row.status,
    profile: row.profile,
    originalProfile: row.profile_asli,
    comment: row.comment,
    routerId: row.router_id,
    routerName: row.router_name,
  }
}

function toApiResponse(payload: FetchClientsPayload, extras: ApiResponseExtras = {}) {
  const { items, page, pageSize, totalItems, totalPages, search, routerId } = payload
  const pagination: PaginationMeta = {
    page,
    pageSize,
    totalItems,
    totalPages,
    hasNext: totalPages > 0 && page < totalPages,
    hasPrevious: totalPages > 0 && page > 1,
    search,
    routerId,
  }

  return {
    status: "ok",
    items: items.map(normalizeClientRow),
    pagination,
    ...extras,
  }
}

function parseNumeric(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value
  }
  if (typeof value === "string") {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) {
      return parsed
    }
  }
  return undefined
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const page = parseNumeric(searchParams.get("page"))
    const pageSize = parseNumeric(searchParams.get("pageSize"))
    const searchParam = searchParams.get("search")
    const routerIdParam = parseNumeric(searchParams.get("routerId"))
    const routerId = routerIdParam !== undefined && routerIdParam > 0 ? routerIdParam : undefined

    const [result, routers] = await Promise.all([
      fetchClients({
        page,
        pageSize,
        search: searchParam ?? undefined,
        routerId,
      }),
      fetchRouters(),
    ])
    return NextResponse.json(toApiResponse(result, { routers }), { status: 200 })
  } catch (error) {
    console.error("[api/clients] failed to fetch data", error)
    return NextResponse.json(
      {
        status: "error",
        message: "Gagal mengambil data client.",
      },
      { status: 500 },
    )
  }
}

export async function PATCH(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>
    const id = typeof body.id === "number" ? body.id : Number(body.id)
    const status = typeof body.status === "string" ? body.status.trim().toLowerCase() : ""
    const page = parseNumeric(body.page)
    const pageSize = parseNumeric(body.pageSize)
    const search = typeof body.search === "string" ? body.search : undefined
    const routerIdBody = parseNumeric(body.routerId)
    const routerId = routerIdBody !== undefined && routerIdBody > 0 ? routerIdBody : undefined

    if (!Number.isFinite(id) || id <= 0) {
      throw new Error("ID client tidak valid.")
    }
    if (status !== "aktif" && status !== "nonaktif") {
      throw new Error("Status tidak valid.")
    }

    await updateClientStatus(id, status)
    const [result, routers] = await Promise.all([fetchClients({ page, pageSize, search, routerId }), fetchRouters()])
    return NextResponse.json(
      {
        ...toApiResponse(result, { routers }),
        message: "Status client berhasil diperbarui.",
      },
      { status: 200 },
    )
  } catch (error) {
    console.error("[api/clients] failed to update", error)
    return NextResponse.json(
      {
        status: "error",
        message: error instanceof Error ? error.message : "Gagal memperbarui status client.",
      },
      { status: 400 },
    )
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>
    const username = typeof body.username === "string" ? body.username.trim() : ""
    if (!username) {
      throw new Error("Username wajib diisi.")
    }

    const ipAddressRaw = typeof body.ipAddress === "string" ? body.ipAddress.trim() : null
    const typeRaw = typeof body.type === "string" ? body.type.trim() : null
    const statusRaw = typeof body.status === "string" ? body.status.trim().toLowerCase() : "aktif"
    const profileRaw = typeof body.profile === "string" ? body.profile.trim() : null
    const commentRaw = typeof body.comment === "string" ? body.comment.trim() : null
    const clientRouterIdParam = parseNumeric(body.routerId)
    const clientRouterId =
      clientRouterIdParam !== undefined && clientRouterIdParam > 0 ? clientRouterIdParam : null

    const filterRouterIdParam = parseNumeric(body.filterRouterId ?? body.activeRouterId)
    const filterRouterId =
      filterRouterIdParam !== undefined && filterRouterIdParam > 0 ? filterRouterIdParam : undefined

    const page = parseNumeric(body.page)
    const pageSize = parseNumeric(body.pageSize)
    const search = typeof body.search === "string" ? body.search : undefined

    await createClient({
      username,
      ipAddress: ipAddressRaw,
      type: typeRaw,
      status: statusRaw === "nonaktif" ? "nonaktif" : "aktif",
      profile: profileRaw,
      comment: commentRaw,
      routerId: clientRouterId,
    })

    const [result, routers] = await Promise.all([
      fetchClients({
        page,
        pageSize,
        search,
        routerId: filterRouterId,
      }),
      fetchRouters(),
    ])

    return NextResponse.json(
      {
        ...toApiResponse(result, { routers }),
        message: "Client berhasil ditambahkan.",
      },
      { status: 201 },
    )
  } catch (error) {
    console.error("[api/clients] failed to create", error)
    return NextResponse.json(
      {
        status: "error",
        message: error instanceof Error ? error.message : "Gagal menambahkan client baru.",
      },
      { status: 400 },
    )
  }
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as Record<string, unknown>
    const id = typeof body.id === "number" ? body.id : Number(body.id)
    if (!Number.isFinite(id) || id <= 0) {
      throw new Error("ID client tidak valid.")
    }

    const username = typeof body.username === "string" ? body.username.trim() : undefined
    const ipAddressValue = body.ipAddress
    const ipAddress =
      ipAddressValue === null ? null : typeof ipAddressValue === "string" ? ipAddressValue.trim() : undefined
    const type = typeof body.type === "string" ? body.type.trim() : undefined
    const statusRaw = typeof body.status === "string" ? body.status.trim().toLowerCase() : undefined
    const status =
      statusRaw === undefined ? undefined : statusRaw === "nonaktif" ? "nonaktif" : statusRaw === "aktif" ? "aktif" : undefined
    const profileValue = body.profile
    const profile =
      profileValue === null ? null : typeof profileValue === "string" ? profileValue.trim() : undefined
    const commentValue = body.comment
    const comment =
      commentValue === null ? null : typeof commentValue === "string" ? commentValue.trim() : undefined
    const routerIdParam = parseNumeric(body.routerId)
    const routerId =
      routerIdParam === undefined ? undefined : routerIdParam > 0 ? routerIdParam : routerIdParam === 0 ? null : undefined

    const page = parseNumeric(body.page)
    const pageSize = parseNumeric(body.pageSize)
    const search = typeof body.search === "string" ? body.search : undefined
    const filterRouterIdParam = parseNumeric(body.filterRouterId ?? body.activeRouterId)
    const filterRouterId =
      filterRouterIdParam !== undefined && filterRouterIdParam > 0 ? filterRouterIdParam : undefined

    await updateClient(id, {
      username,
      ipAddress,
      type,
      status,
      profile,
      comment,
      routerId,
    })

    const [result, routers] = await Promise.all([
      fetchClients({
        page,
        pageSize,
        search,
        routerId: filterRouterId,
      }),
      fetchRouters(),
    ])

    return NextResponse.json(
      {
        ...toApiResponse(result, { routers }),
        message: "Client berhasil diperbarui.",
      },
      { status: 200 },
    )
  } catch (error) {
    console.error("[api/clients] failed to edit", error)
    return NextResponse.json(
      {
        status: "error",
        message: error instanceof Error ? error.message : "Gagal memperbarui client.",
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
      throw new Error("ID client tidak valid.")
    }

    const page = parseNumeric(searchParams.get("page"))
    const pageSize = parseNumeric(searchParams.get("pageSize"))
    const search = searchParams.get("search") ?? undefined
    const routerFilterParam = parseNumeric(searchParams.get("routerId"))
    const routerId =
      routerFilterParam !== undefined && routerFilterParam > 0 ? routerFilterParam : undefined

    await deleteClient(id)

    const [result, routers] = await Promise.all([
      fetchClients({
        page,
        pageSize,
        search,
        routerId,
      }),
      fetchRouters(),
    ])

    return NextResponse.json(
      {
        ...toApiResponse(result, { routers }),
        message: "Client berhasil dihapus.",
      },
      { status: 200 },
    )
  } catch (error) {
    console.error("[api/clients] failed to delete", error)
    return NextResponse.json(
      {
        status: "error",
        message: error instanceof Error ? error.message : "Gagal menghapus client.",
      },
      { status: 400 },
    )
  }
}
