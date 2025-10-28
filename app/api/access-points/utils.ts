// app/api/access-points/utils.ts
import { NextResponse } from "next/server"

export const REMOTE_ACCESS_POINT_API =
  "http://10.20.25.8:8000/api/v1/data-access-points"

export type AccessPointItem = {
  id: number
  ssid: string
  btsName: string
  routerName: string | null
  interfaceName: string | null
  ipAddress: string | null
  security: string | null
  phraseKey: string | null
  device: string | null
  username: string | null
  password: string | null
  frequency: string | null
  channelWidth: string | null
  macAddress: string | null
  status: string | null
  createdAt: string | null
  updatedAt: string | null
}

export type UpsertPayload = {
  ssid: string
  btsName: string
  routerName: string
  interfaceName: string
  ipAddress: string
  device: string
  username: string
  password: string
  frequency: string
  channelWidth: string
  macAddress: string
  status: string
  security: string | null
  phraseKey: string | null
}

type AccessPointGroup = {
  btsName: string
  total: number
  items: AccessPointItem[]
}

function toStringOrNull(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim()
    return trimmed === "" ? null : trimmed
  }
  if (value === null || value === undefined) return null
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  return null
}

function extractItems(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>
    const keys = ["data", "items", "result", "access_points", "accessPoints"]
    for (const key of keys) {
      const value = record[key]
      if (Array.isArray(value)) return value
    }
  }
  return []
}

function normalizeRemoteItem(item: unknown): AccessPointItem | null {
  if (!item || typeof item !== "object") return null
  const record = item as Record<string, unknown>
  const idRaw = record.id ?? record.ID ?? record.Id
  const id = typeof idRaw === "number" ? idRaw : Number(idRaw)
  if (!Number.isFinite(id)) return null

  const ssid = toStringOrNull(record.nama_ap ?? record.ssid) ?? "-"
  const btsName = toStringOrNull(record.nama_bts) ?? "Tanpa BTS"

  const normalizeTimestamp = (value: string | null) => {
    if (!value) return null
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? value : date.toISOString()
  }

  return {
    id,
    ssid,
    btsName,
    routerName: toStringOrNull(record.router_ap ?? record.router),
    interfaceName: toStringOrNull(record.interface_ap ?? record.interface),
    ipAddress: toStringOrNull(record.ip_ap ?? record.ip_address),
    security: toStringOrNull(record.security_ap ?? record.security),
    phraseKey: toStringOrNull(record.phrase_ap ?? record.phrase_key),
    device: toStringOrNull(record.perangkat_ap ?? record.device),
    username: toStringOrNull(record.login_ap ?? record.username),
    password: toStringOrNull(record.password_ap ?? record.password),
    frequency: toStringOrNull(record.freq_ap ?? record.frequency),
    channelWidth: toStringOrNull(record.cw_ap ?? record.channel_width),
    macAddress: toStringOrNull(record.mac_ap ?? record.mac_address),
    status: toStringOrNull(record.status_ap ?? record.status),
    createdAt: normalizeTimestamp(toStringOrNull(record.created_at)),
    updatedAt: normalizeTimestamp(toStringOrNull(record.updated_at)),
  }
}

export async function fetchRemoteAccessPoints(): Promise<AccessPointItem[]> {
  const response = await fetch(REMOTE_ACCESS_POINT_API, { cache: "no-store" })
  if (!response.ok) throw new Error(`API mengembalikan status ${response.status}`)
  const payload = (await response.json()) as unknown
  const rawItems = extractItems(payload)
  return rawItems
    .map((item) => normalizeRemoteItem(item))
    .filter((item): item is AccessPointItem => item !== null)
}

function groupByBts(items: AccessPointItem[]): AccessPointGroup[] {
  const grouped = new Map<string, AccessPointItem[]>()
  items.forEach((item) => {
    const key = item.btsName || "Tanpa BTS"
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key)!.push(item)
  })
  return Array.from(grouped.entries()).map(([btsName, groupItems]) => ({
    btsName,
    total: groupItems.length,
    items: groupItems,
  }))
}

export function toApiResponse(accessPoints: AccessPointItem[]) {
  return { status: "ok", accessPoints, groups: groupByBts(accessPoints) }
}

function sanitizeRequiredString(property: string, value: unknown): string {
  if (typeof value === "string") {
    const trimmed = value.trim()
    if (trimmed) return trimmed
  }
  throw new Error(`${property} wajib diisi.`)
}

function sanitizeOptionalString(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed === "" ? null : trimmed
}

function sanitizeStatus(value: unknown): string {
  if (typeof value !== "string") throw new Error("Status access point wajib diisi.")
  const normalized = value.trim().toLowerCase()
  if (normalized === "aktif") return "Aktif"
  if (normalized === "dismantle") return "Dismantle"
  throw new Error("Status access point harus Aktif atau Dismantle.")
}

export function parseIdParam(url: string): number {
  const { searchParams } = new URL(url)
  const idParam = searchParams.get("id")
  if (!idParam) throw new Error("Parameter id wajib diisi.")
  const id = Number(idParam)
  if (!Number.isFinite(id) || id <= 0) throw new Error("Parameter id tidak valid.")
  return id
}

export function parseUpsertPayload(body: Record<string, unknown>): UpsertPayload {
  return {
    ssid: sanitizeRequiredString("Nama Access Point", body.ssid ?? body.nama_ap),
    btsName: sanitizeRequiredString("Nama BTS", body.btsName ?? body.nama_bts),
    routerName: sanitizeRequiredString("Router", body.routerName ?? body.router_ap),
    interfaceName: sanitizeRequiredString("Interface", body.interfaceName ?? body.interface_ap),
    ipAddress: sanitizeRequiredString("IP Address", body.ipAddress ?? body.ip_ap),
    device: sanitizeRequiredString("Perangkat", body.device ?? body.perangkat_ap),
    username: sanitizeRequiredString("Login", body.username ?? body.login_ap),
    password: sanitizeRequiredString("Password", body.password ?? body.password_ap),
    frequency: sanitizeRequiredString("Frequency", body.frequency ?? body.freq_ap),
    channelWidth: sanitizeRequiredString("Channel Width", body.channelWidth ?? body.cw_ap),
    macAddress: sanitizeRequiredString("MAC Address", body.macAddress ?? body.mac_ap),
    status: sanitizeStatus(body.status ?? body.status_ap),
    security: sanitizeOptionalString(body.security ?? body.security_ap),
    phraseKey: sanitizeOptionalString(body.phraseKey ?? body.phrase_ap),
  }
}

export function buildRemotePayload(payload: UpsertPayload) {
  return {
    nama_bts: payload.btsName,
    nama_ap: payload.ssid,
    router_ap: payload.routerName,
    interface_ap: payload.interfaceName,
    ip_ap: payload.ipAddress,
    security_ap: payload.security,
    phrase_ap: payload.phraseKey,
    perangkat_ap: payload.device,
    login_ap: payload.username,
    password_ap: payload.password,
    freq_ap: payload.frequency,
    cw_ap: payload.channelWidth,
    mac_ap: payload.macAddress,
    status_ap: payload.status,
  }
}

export async function handleRemoteError(response: Response): Promise<never> {
  let message = `API mengembalikan status ${response.status}`
  try {
    const errorPayload = (await response.json()) as Record<string, unknown>
    const resolved = [errorPayload.message, errorPayload.error, errorPayload.detail].find(
      (item): item is string => typeof item === "string" && item.trim().length > 0,
    )
    if (resolved) message = resolved
  } catch {}
  throw new Error(message)
}
