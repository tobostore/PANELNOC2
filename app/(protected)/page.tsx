"use client"

import type { FormEvent } from "react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import Image from "next/image";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronsLeft,
  Clock,
  Cpu,
  Database,
  LogOut,
  Network,
  Ban,
  Pencil,
  Plus,
  RefreshCcw,
  Server,
  Unlock,
  Upload,
  Trash2,
  Users,
  X,
  Wifi,
  Zap,
} from "lucide-react"
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts"

const ROUTER_MONITOR_URL = "wss://isolir.gmdp.net.id/ws/"

type RouterConnectionState = "connecting" | "open" | "closed"

type RouterInterfaceStat = {
  name: string
  rx: number | string | null
  tx: number | string | null
  status: string | null
  rxUnit?: string | null
  txUnit?: string | null
}

type RouterMetric = {
  id: string
  name: string
  status: string | null
  total: number | null
  active: number | null
  cpu: number | null
  memory: number | null
  interfaces: RouterInterfaceStat[]
  lastUpdatedAt: number
}

type RouterHistoryPoint = {
  timestamp: number
  cpu: number | null
  memory: number | null
  active: number | null
  peakTraffic: number | null
}

type AccessPointItem = {
  id: number
  ssid: string
  btsName: string
  routerName: string | null
  interfaceName: string | null
  ipAddress: string | null
  device: string | null
  username: string | null
  password: string | null
  security: string | null
  phraseKey: string | null
  frequency: string | null
  channelWidth: string | null
  macAddress: string | null
  status: string | null
  createdAt: string | null
  updatedAt: string | null
}

type AccessPointGroup = {
  btsName: string
  total: number
  items: AccessPointItem[]
}

type PendingItem = {
  id: number
  customerName: string
  description: string
  address: string
  kabupaten: string
  createdAt: string
}

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

type ClientFormState = {
  username: string
  ipAddress: string
  type: string
  status: "aktif" | "nonaktif"
  profile: string
  comment: string
  routerId: string
}

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

const KABUPATEN_LABELS: Record<string, string> = {
  tangerang: "Tangerang",
  kebumen: "Kebumen",
  kebun: "Karanganyar",
}

function kabupatenDisplayName(value: string): string {
  return KABUPATEN_LABELS[value?.toLowerCase()] ?? value
}

function formatWibTimestamp(iso: string): string {
  const date = new Date(iso)
  return new Intl.DateTimeFormat("id-ID", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date)
}

function useRouterMonitoring(reconnectDelay = 5000) {
  const [connectionState, setConnectionState] = useState<RouterConnectionState>("connecting")
  const [lastError, setLastError] = useState<string | null>(null)
  const [routerMetrics, setRouterMetrics] = useState<Record<string, RouterMetric>>({})
  const [history, setHistory] = useState<Record<string, RouterHistoryPoint[]>>({})

  useEffect(() => {
    if (typeof window === "undefined") {
      return
    }

    let socket: WebSocket | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    let shouldReconnect = true

    const connect = () => {
      if (typeof window.WebSocket === "undefined") {
        setLastError("Browser tidak mendukung WebSocket.")
        setConnectionState("closed")
        return
      }

      setConnectionState("connecting")
      setLastError(null)

      try {
        socket = new WebSocket(ROUTER_MONITOR_URL)
      } catch (error) {
        setLastError(error instanceof Error ? error.message : "Gagal membuka koneksi WebSocket.")
        setConnectionState("closed")
        scheduleReconnect()
        return
      }

      socket.onopen = () => {
        setConnectionState("open")
      }

      socket.onmessage = (event) => {
        void (async () => {
          try {
            const payload = await parseWebSocketMessage(event.data)
            if (payload === null || payload === undefined) {
              return
            }

            const interpreted = interpretMonitoringPayload(payload)
            if (!interpreted) {
              return
            }

            const timestamp = Date.now()

            if (interpreted.kind === "full") {
              const normalized = normalizeRouterPayload(interpreted.routers).map((metric) => ({
                ...metric,
                lastUpdatedAt: timestamp,
              }))

              if (normalized.length === 0) {
                return
              }

              setRouterMetrics(() => {
                const next: Record<string, RouterMetric> = {}
                normalized.forEach((metric) => {
                  next[metric.id] = metric
                })
                return next
              })

              setHistory((prev) => {
                const next = { ...prev }
                const validIds = new Set<string>()
                normalized.forEach((metric) => {
                  validIds.add(metric.id)
                  const peakTraffic = calculatePeakTrafficFromInterfaces(metric.interfaces)
                  const points = next[metric.id] ? [...next[metric.id]] : []
                  points.push({
                    timestamp,
                    cpu: metric.cpu,
                    memory: metric.memory,
                    active: metric.active,
                    peakTraffic,
                  })
                  next[metric.id] = points.slice(-60)
                })

                Object.keys(next).forEach((key) => {
                  if (!validIds.has(key)) {
                    delete next[key]
                  }
                })

                return next
              })
            } else {
              const normalizedAdded = normalizeRouterPayload(interpreted.added).map((metric) => ({
                ...metric,
                lastUpdatedAt: timestamp,
              }))
              const normalizedUpdated = normalizeRouterPayload(interpreted.updated).map((metric) => ({
                ...metric,
                lastUpdatedAt: timestamp,
              }))
              const removalIds = extractRouterIdentifiers(interpreted.removed)

              if (
                normalizedAdded.length === 0 &&
                normalizedUpdated.length === 0 &&
                removalIds.length === 0
              ) {
                return
              }

              setRouterMetrics((prev) => {
                const next = { ...prev }

                normalizedAdded.forEach((metric) => {
                  next[metric.id] = metric
                })

                normalizedUpdated.forEach((metric) => {
                  const previousMetric = next[metric.id]
                  next[metric.id] = {
                    ...(previousMetric ?? metric),
                    ...metric,
                    lastUpdatedAt: timestamp,
                  }
                })

                removalIds.forEach((id) => {
                  delete next[id]
                })

                return next
              })

              setHistory((prev) => {
                const next = { ...prev }
                const pushPoint = (metric: RouterMetric) => {
                  const peakTraffic = calculatePeakTrafficFromInterfaces(metric.interfaces)
                  const points = next[metric.id] ? [...next[metric.id]] : []
                  points.push({
                    timestamp,
                    cpu: metric.cpu,
                    memory: metric.memory,
                    active: metric.active,
                    peakTraffic,
                  })
                  next[metric.id] = points.slice(-60)
                }

                normalizedAdded.forEach(pushPoint)
                normalizedUpdated.forEach(pushPoint)
                removalIds.forEach((id) => {
                  delete next[id]
                })

                return next
              })
            }

            setLastError(null)
          } catch (error) {
            setLastError(error instanceof Error ? error.message : "Gagal memproses data WebSocket.")
          }
        })()
      }

      socket.onerror = () => {
        setLastError("Terjadi masalah pada koneksi WebSocket.")
      }

      socket.onclose = () => {
        setConnectionState("closed")
        if (shouldReconnect) {
          scheduleReconnect()
        }
      }
    }

    const scheduleReconnect = () => {
      if (reconnectTimer) {
        clearTimeout(reconnectTimer)
      }
      reconnectTimer = setTimeout(connect, reconnectDelay)
    }

    connect()

    return () => {
      shouldReconnect = false
      if (reconnectTimer) {
        clearTimeout(reconnectTimer)
      }
      if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
        socket.close()
      }
    }
  }, [reconnectDelay])

  const routers = useMemo(
    () =>
      Object.values(routerMetrics).sort((a, b) => {
        return a.name.localeCompare(b.name)
      }),
    [routerMetrics],
  )

  return { routers, connectionState, lastError, history }
}

function normalizeRouterPayload(payload: unknown): RouterMetric[] {
  const items = extractRouterItems(payload)
  const result: RouterMetric[] = []

  items.forEach((item, index) => {
    const normalized = normalizeRouterItem(item, index)
    if (normalized) {
      result.push(normalized)
    }
  })

  return result
}

function extractRouterItems(payload: unknown): unknown[] {
  if (!payload) {
    return []
  }

  if (Array.isArray(payload)) {
    return payload
  }

  if (typeof payload === "object") {
    const record = payload as Record<string, unknown>

    if (Array.isArray(record.routers)) {
      return record.routers
    }
    if (Array.isArray(record.data)) {
      return record.data
    }
    if (Array.isArray(record.items)) {
      return record.items
    }
    if (Array.isArray(record.result)) {
      return record.result
    }
    if (record.router) {
      return [record.router]
    }
    if (record.device) {
      return [record.device]
    }

    const nestedValues = Object.values(record).filter(
      (item): item is Record<string, unknown> => Boolean(item) && typeof item === "object" && !Array.isArray(item),
    )
    if (nestedValues.length > 0 && nestedValues.length === Object.keys(record).length) {
      return nestedValues
    }

    return [record]
  }

  return []
}

function normalizeRouterItem(value: unknown, index: number): RouterMetric | null {
  if (!value || typeof value !== "object") {
    return null
  }

  const record = value as Record<string, unknown>

  const name =
    pickString(record.name) ??
    pickString(record.routerName) ??
    pickString(record.router) ??
    pickString(record.identity) ??
    `Router ${index + 1}`

  const identifier =
    pickIdentifier(record.id) ?? pickIdentifier(record.routerId) ?? pickIdentifier(record.uuid) ?? name ?? `router-${index}`

  if (!name || !identifier) {
    return null
  }

  const resourceGroup = asRecord(record.resource)
  const pppoeGroup = asRecord(record.pppoe)
  const status =
    pickString(record.status) ??
    pickString(record.state) ??
    pickString(record.health) ??
    pickString(record.connectionStatus) ??
    null

  const total =
    pickNumber(record.total) ??
    pickNumber(record.pppoe_total) ??
    pickNumber(record.pppoeTotal) ??
    pickNumber(record.pppoe_count) ??
    pickNumber(pppoeGroup?.total)

  const active =
    pickNumber(record.active) ??
    pickNumber(record.pppoe_active) ??
    pickNumber(record.pppoeActive) ??
    pickNumber(pppoeGroup?.active)

  const cpu =
    pickNumber(record.cpu) ??
    pickNumber(record.cpu_usage) ??
    pickNumber(resourceGroup?.cpu) ??
    pickNumber(record.cpuLoad) ??
    pickNumber(record.cpu_load)

  const memory =
    pickNumber(record.memory) ??
    pickNumber(record.memory_usage) ??
    pickNumber(resourceGroup?.memory) ??
    pickNumber(record.memoryLoad) ??
    pickNumber(record.memory_load)

  const interfaces =
    normalizeInterfaces(record.interfaces) ??
    normalizeInterfaces(record.interface) ??
    normalizeInterfaces(record.ifaces) ??
    normalizeInterfaces(record.traffic) ??
    normalizeInterfaces(record.stats) ??
    []

  return {
    id: identifier,
    name,
    status,
    total: total ?? null,
    active: active ?? null,
    cpu: cpu ?? null,
    memory: memory ?? null,
    interfaces,
    lastUpdatedAt: Date.now(),
  }
}

function normalizeInterfaces(value: unknown): RouterInterfaceStat[] | null {
  if (!value) {
    return null
  }

  const interfaces: RouterInterfaceStat[] = []

  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      const normalized = normalizeInterfaceEntry(entry, index)
      if (normalized) {
        interfaces.push(normalized)
      }
    })
  } else if (typeof value === "object") {
    Object.entries(value as Record<string, unknown>).forEach(([key, entry], index) => {
      const normalized = normalizeInterfaceEntry(entry, index, key)
      if (normalized) {
        interfaces.push(normalized)
      }
    })
  }

  return interfaces
}

function normalizeInterfaceEntry(
  value: unknown,
  index: number,
  fallbackName?: string,
): RouterInterfaceStat | null {
  if (!value || typeof value !== "object") {
    const label = fallbackName ?? `Interface ${index + 1}`
    if (typeof value === "number" || typeof value === "string") {
      return {
        name: label,
        rx: typeof value === "number" ? value : value.trim(),
        tx: null,
        status: null,
        rxUnit: null,
        txUnit: null,
      }
    }
    return {
      name: label,
      rx: null,
      tx: null,
      status: null,
      rxUnit: null,
      txUnit: null,
    }
  }

  const record = value as Record<string, unknown>

  const name =
    pickString(record.name) ??
    pickString(record.interface) ??
    pickString(record.iface) ??
    pickString(record.id) ??
    fallbackName ??
    `Interface ${index + 1}`

  const rx =
    pickMetricValue(record.rx) ??
    pickMetricValue(record.rx_bps) ??
    pickMetricValue(record.rxRate) ??
    pickMetricValue(record.rx_rate) ??
    pickMetricValue(record.rx_mbps) ??
    pickMetricValue(record.rxBytes) ??
    pickMetricValue(record.rx_bytes) ??
    pickMetricValue(record.download) ??
    pickMetricValue(record.in) ??
    pickMetricValue(record.receive) ??
    pickMetricValue(record.rxTraffic)

  const tx =
    pickMetricValue(record.tx) ??
    pickMetricValue(record.tx_bps) ??
    pickMetricValue(record.txRate) ??
    pickMetricValue(record.tx_rate) ??
    pickMetricValue(record.tx_mbps) ??
    pickMetricValue(record.txBytes) ??
    pickMetricValue(record.tx_bytes) ??
    pickMetricValue(record.upload) ??
    pickMetricValue(record.out) ??
    pickMetricValue(record.transmit) ??
    pickMetricValue(record.txTraffic)

  const statusValue =
    pickString(record.status) ??
    pickString(record.state) ??
    pickString(record.linkStatus) ??
    pickString(record.interfaceStatus) ??
    null

  const rxUnit = pickString(record.rx_unit) ?? pickString(record.rxUnit) ?? pickString(record.rxUnits)
  const txUnit = pickString(record.tx_unit) ?? pickString(record.txUnit) ?? pickString(record.txUnits)

  return {
    name,
    rx,
    tx,
    status: statusValue ?? null,
    rxUnit: rxUnit ?? null,
    txUnit: txUnit ?? null,
  }
}

function pickString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
  }
  return null
}

function pickIdentifier(value: unknown): string | null {
  if (typeof value === "string" || typeof value === "number") {
    const stringValue = String(value).trim()
    return stringValue.length > 0 ? stringValue : null
  }
  return null
}

function pickNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value
  }

  if (typeof value === "string") {
    const sanitized = value.replace(/,/g, "")
    const match = sanitized.match(/-?\d+(\.\d+)?/)
    if (match) {
      const parsed = Number(match[0])
      if (!Number.isNaN(parsed)) {
        return parsed
      }
    }
  }

  return null
}

function pickMetricValue(value: unknown): number | string | null {
  const numeric = pickNumber(value)
  if (numeric !== null) {
    return numeric
  }

  if (typeof value === "string") {
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
  }

  return null
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }
  return null
}

type MonitoringPayload =
  | { kind: "full"; routers: unknown[] }
  | { kind: "delta"; added: unknown[]; updated: unknown[]; removed: unknown[] }

function interpretMonitoringPayload(payload: unknown): MonitoringPayload | null {
  if (payload === null || payload === undefined) {
    return null
  }

  if (Array.isArray(payload)) {
    return { kind: "full", routers: payload }
  }

  if (typeof payload !== "object") {
    return null
  }

  const record = payload as Record<string, unknown>
  const announcedType = typeof record.type === "string" ? record.type.toLowerCase() : null

  if (announcedType === "delta") {
    const routersRecord = asRecord(record.routers)
    const added = Array.isArray(routersRecord?.added) ? routersRecord?.added : []
    const updated = Array.isArray(routersRecord?.updated) ? routersRecord?.updated : []
    const removed = Array.isArray(routersRecord?.removed) ? routersRecord?.removed : []
    return { kind: "delta", added, updated, removed }
  }

  const candidates: unknown[] = []
  if (announcedType === "full") {
    candidates.push(record.data)
  }
  candidates.push(record)
  if (record.data && typeof record.data === "object" && !Array.isArray(record.data)) {
    candidates.push(record.data)
  }

  for (const candidate of candidates) {
    if (!candidate) {
      continue
    }
    if (Array.isArray(candidate)) {
      if (candidate.length > 0) {
        return { kind: "full", routers: candidate }
      }
      continue
    }
    if (typeof candidate === "object") {
      const candidateRecord = candidate as Record<string, unknown>
      if (Array.isArray(candidateRecord.routers)) {
        return { kind: "full", routers: candidateRecord.routers as unknown[] }
      }
    }
  }

  const extracted = extractRouterItems(record)
  return extracted.length > 0 ? { kind: "full", routers: extracted } : null
}

function extractRouterIdentifiers(entries: unknown[]): string[] {
  const unique = new Set<string>()

  entries.forEach((entry) => {
    if (typeof entry === "string") {
      const trimmed = entry.trim()
      if (trimmed) {
        unique.add(trimmed)
      }
      return
    }

    if (typeof entry === "number" && Number.isFinite(entry)) {
      unique.add(String(entry))
      return
    }

    if (!entry || typeof entry !== "object") {
      return
    }

    const record = entry as Record<string, unknown>
    const identifier =
      pickIdentifier(record.id) ??
      pickIdentifier(record.routerId) ??
      pickIdentifier(record.uuid) ??
      pickString(record.router) ??
      pickString(record.name) ??
      null

    if (identifier) {
      unique.add(identifier)
    }
  })

  return Array.from(unique)
}

async function parseWebSocketMessage(data: unknown): Promise<unknown> {
  if (typeof data === "string") {
    return normalizeTextPayload(data)
  }

  if (typeof Blob !== "undefined" && data instanceof Blob) {
    const text = await data.text()
    return normalizeTextPayload(text)
  }

  if (data instanceof ArrayBuffer) {
    const decoder = new TextDecoder("utf-8")
    const text = decoder.decode(data)
    return normalizeTextPayload(text)
  }

  if (ArrayBuffer.isView(data)) {
    const decoder = new TextDecoder("utf-8")
    const text = decoder.decode(data.buffer)
    return normalizeTextPayload(text)
  }

  return data
}

function normalizeTextPayload(value: string): unknown {
  const trimmed = value.trim()
  if (!trimmed) {
    return null
  }

  const direct = tryParseJson(trimmed)
  if (direct.success) {
    return direct.value
  }

  const segments = trimmed.split(/\r?\n/).map((segment) => segment.trim()).filter(Boolean)
  if (segments.length > 1) {
    const parsedSegments = segments
      .map((segment) => {
        const parsed = tryParseJson(segment)
        return parsed.success ? parsed.value : segment
      })
      .filter((segment) => segment !== null && segment !== "")

    if (parsedSegments.length === 1) {
      return parsedSegments[0]
    }

    if (parsedSegments.length > 1) {
      return parsedSegments
    }
  }

  return trimmed
}

function tryParseJson(value: string): { success: boolean; value: unknown } {
  try {
    return { success: true, value: JSON.parse(value) }
  } catch {
    return { success: false, value: null }
  }
}

function formatMetricValue(value: number | string | null, suffix?: string): string {
  if (value === null || value === undefined) {
    return "-"
  }

  const delimiter = suffix === "%" ? "" : " "

  if (typeof value === "number") {
    const formatted = new Intl.NumberFormat("id-ID", {
      maximumFractionDigits: value >= 100 ? 0 : 2,
    }).format(value)
    return suffix ? `${formatted}${delimiter}${suffix}` : formatted
  }

  return suffix ? `${value}${delimiter}${suffix}` : value
}

function formatRelativeTime(timestamp: number): string {
  const delta = Date.now() - timestamp

  if (delta <= 0) {
    return "baru saja"
  }

  const seconds = Math.floor(delta / 1000)
  if (seconds < 60) {
    return `${seconds} dtk lalu`
  }

  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) {
    return `${minutes} mnt lalu`
  }

  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    return `${hours} jam lalu`
  }

  const days = Math.floor(hours / 24)
  return `${days} hari lalu`
}

function metricToNumber(value: number | string | null | undefined): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value
  }
  if (typeof value === "string") {
    return pickNumber(value)
  }
  return null
}

function calculatePeakTrafficFromInterfaces(interfaces: RouterInterfaceStat[] = []): number | null {
  let peak: number | null = null

  interfaces.forEach((iface) => {
    const values = [metricToNumber(iface.rx), metricToNumber(iface.tx)].filter((v): v is number => v !== null)
    if (values.length === 0) {
      return
    }
    const localPeak = Math.max(...values)
    if (peak === null || localPeak > peak) {
      peak = localPeak
    }
  })

  return peak
}

function formatChartTimestamp(timestamp: number): string {
  return new Intl.DateTimeFormat("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(timestamp)
}

// const systemStatus = [
//   { name: "Primary Server", status: "online", uptime: "99.98%", latency: "12ms" },
//   { name: "Database Cluster", status: "online", uptime: "99.95%", latency: "8ms" },
//   { name: "Cache Layer", status: "online", uptime: "100%", latency: "2ms" },
//   { name: "Load Balancer", status: "online", uptime: "99.99%", latency: "5ms" },
// ]

export default function NOCPanel() {
  const router = useRouter()
  const { routers, connectionState, lastError, history } = useRouterMonitoring()
  const [selectedSystem, setSelectedSystem] = useState<string | null>(null)
  const [selectedSection, setSelectedSection] = useState<string>("Dashboard")
  const [selectedRouterId, setSelectedRouterId] = useState<string | null>(null)
  const [pendingPreview, setPendingPreview] = useState<PendingItem[]>([])
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false)

  useEffect(() => {
    if (routers.length === 0) {
      if (selectedRouterId !== null) {
        setSelectedRouterId(null)
      }
      return
    }

    if (!selectedRouterId || !routers.some((router) => router.id === selectedRouterId)) {
      setSelectedRouterId(routers[0].id)
    }
  }, [routers, selectedRouterId])

  const selectedRouter = useMemo(() => {
    if (routers.length === 0) {
      return null
    }
    if (selectedRouterId) {
      const found = routers.find((router) => router.id === selectedRouterId)
      if (found) {
        return found
      }
    }
    return routers[0]
  }, [routers, selectedRouterId])

  const fetchPendingPreview = useCallback(async () => {
    try {
      const response = await fetch("/api/pending")
      if (!response.ok) {
        throw new Error(`Status ${response.status}`)
      }
      const payload: { status: string; items?: PendingItem[] } = await response.json()
      if (payload.status === "ok" && Array.isArray(payload.items)) {
        setPendingPreview(payload.items.slice(0, 3))
      }
    } catch {
      setPendingPreview([])
    }
  }, [])

  const handleLogout = useCallback(async () => {
    if (isLoggingOut) {
      return
    }
    setIsLoggingOut(true)
    try {
      const response = await fetch("/api/logout", { method: "POST" })
      if (!response.ok) {
        throw new Error(`Status ${response.status}`)
      }
      router.replace("/login")
      router.refresh()
    } catch (error) {
      console.error("[logout] gagal", error)
      setIsLoggingOut(false)
    }
  }, [isLoggingOut, router])

  useEffect(() => {
    void fetchPendingPreview()
    const interval = setInterval(fetchPendingPreview, 60_000)
    return () => clearInterval(interval)
  }, [fetchPendingPreview])

  const selectedRouterHistory = selectedRouter ? history[selectedRouter.id] ?? [] : []
  const limitedHistory = selectedRouterHistory.slice(-20)
  const latestHistory =
    limitedHistory.length > 0 ? limitedHistory[limitedHistory.length - 1] : selectedRouterHistory[selectedRouterHistory.length - 1] ?? null

  const cpuValue = latestHistory?.cpu ?? selectedRouter?.cpu ?? null
  const memoryValue = latestHistory?.memory ?? selectedRouter?.memory ?? null
  const activeValue = latestHistory?.active ?? selectedRouter?.active ?? null
  const peakTrafficValue =
    latestHistory?.peakTraffic ?? (selectedRouter ? calculatePeakTrafficFromInterfaces(selectedRouter.interfaces) : null)

  const systemResourceData = limitedHistory.map((point) => ({
    time: formatChartTimestamp(point.timestamp),
    cpu: point.cpu ?? 0,
    memory: point.memory ?? 0,
  }))

  const networkChartData =
    selectedRouter && selectedRouter.interfaces.length > 0
      ? selectedRouter.interfaces
          .map((iface) => {
            const rx = metricToNumber(iface.rx) ?? 0
            const tx = metricToNumber(iface.tx) ?? 0
            return {
              name: iface.name,
              rx,
              tx,
              total: rx + tx,
            }
          })
          .sort((a, b) => b.total - a.total)
          .slice(0, 8)
      : []

  const cpuDisplay = formatMetricValue(cpuValue, typeof cpuValue === "number" ? "%" : undefined)
  const memoryDisplay = formatMetricValue(memoryValue, typeof memoryValue === "number" ? "%" : undefined)
  const networkDisplay = formatMetricValue(peakTrafficValue, "Mbps")
  const activeDisplay = formatMetricValue(activeValue)

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-50 border-b border-border bg-card/70 backdrop-blur">
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <Image src="/resouce/logo/cut-logo.png" alt="NOC Panel" width={40} height={40} className="h-10 w-10 rounded-lg object-cover" />
            <div>
              <h1 className="text-xl font-bold">NOC Panel</h1>
              <p className="text-xs text-muted-foreground">Network Operations Center</p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            disabled={isLoggingOut}
            className="inline-flex items-center gap-2 rounded border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-70"
          >
            <LogOut className="h-4 w-4" />
            {isLoggingOut ? "Keluar..." : "Keluar"}
          </button>
        </div>
      </header>

      <div className="flex">
        <aside
          className={`flex flex-col border-r border-border bg-sidebar/60 backdrop-blur transition-all duration-300 ${
            isSidebarCollapsed ? "w-20" : "w-64"
          }`}
        >
          <nav className="flex-1 space-y-2 p-4">
            <NavItem
              icon={<Zap className="h-4 w-4" />}
              label="Dashboard"
              active={selectedSection === "Dashboard"}
              onClick={() => setSelectedSection("Dashboard")}
              isCollapsed={isSidebarCollapsed}
            />
            <NavItem
              icon={<Network className="h-4 w-4" />}
              label="IP Publik"
              active={selectedSection === "IP Publik"}
              onClick={() => setSelectedSection("IP Publik")}
              isCollapsed={isSidebarCollapsed}
            />
            <NavItem
              icon={<Wifi className="h-4 w-4" />}
              label="Access Points"
              active={selectedSection === "Access Points"}
              onClick={() => setSelectedSection("Access Points")}
              isCollapsed={isSidebarCollapsed}
            />
            <NavItem
              icon={<Users className="h-4 w-4" />}
              label="Clients Personal"
              active={selectedSection === "Clients"}
              onClick={() => setSelectedSection("Clients")}
              isCollapsed={isSidebarCollapsed}
            />
            <NavItem
              icon={<Activity className="h-4 w-4" />}
              label="Monitoring Distribusi"
              active={selectedSection === "Monitoring Router"}
              onClick={() => setSelectedSection("Monitoring Router")}
              isCollapsed={isSidebarCollapsed}
            />
            <NavItem
              icon={<Upload className="h-4 w-4" />}
              label="Aktivasi Reseller"
              active={selectedSection === "Aktivasi Reseller"}
              onClick={() => setSelectedSection("Aktivasi Reseller")}
              isCollapsed={isSidebarCollapsed}
            />
            <NavItem
              icon={<Clock className="h-4 w-4" />}
              label="Pendingan"
              active={selectedSection === "Pending"}
              onClick={() => setSelectedSection("Pending")}
              isCollapsed={isSidebarCollapsed}
            />
          </nav>
          <div className="p-4">
            <button
              type="button"
              onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
              className="flex w-full items-center justify-center rounded-lg px-4 py-2.5 text-sm font-medium text-muted-foreground transition hover:bg-secondary/50 hover:text-foreground"
            >
              <ChevronsLeft className={`h-5 w-5 transition-transform ${isSidebarCollapsed ? "rotate-180" : ""}`} />
              {!isSidebarCollapsed && <span className="ml-2">Tutup Panel</span>}
            </button>
          </div>
        </aside>

        <main className="flex-1 space-y-6 p-6">
          {selectedSection === "Monitoring Router" ? (
            <RouterMonitoringSection routers={routers} connectionState={connectionState} lastError={lastError} />
          ) : selectedSection === "IP Publik" ? (
            <PublicIpSection />
          ) : selectedSection === "Access Points" ? (
            <AccessPointsSection />
          ) : selectedSection === "Aktivasi Reseller" ? (
            <AktivasiClientsSection />
          ) : selectedSection === "Clients" ? (
            <ClientsSection />
          ) : selectedSection === "Pending" ? (
            <PendingSection />
          ) : (
            <DashboardSection
              selectedRouter={selectedRouter}
              selectedRouterId={selectedRouterId}
              setSelectedRouterId={setSelectedRouterId}
              routers={routers}
              cpuDisplay={cpuDisplay}
              memoryDisplay={memoryDisplay}
              networkDisplay={networkDisplay}
              activeDisplay={activeDisplay}
              systemResourceData={systemResourceData}
              networkChartData={networkChartData}
              selectedSystem={selectedSystem}
              setSelectedSystem={setSelectedSystem}
              pendingPreview={pendingPreview}
              refreshPendingPreview={fetchPendingPreview}
            />
          )}
        </main>
      </div>
    </div>
  )
}

function PublicIpSection() {
  const [items, setItems] = useState<PublicIpItem[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<number | null>(null)
  const [infoMessage, setInfoMessage] = useState<string | null>(null)
  const [isFormOpen, setIsFormOpen] = useState<boolean>(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState<boolean>(false)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [formData, setFormData] = useState({
    ipAddress: "",
    subnet: "",
    customerName: "",
    status: "",
    description: "",
  })

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      setInfoMessage(null)
      const response = await fetch("/api/ip-addresses")
      if (!response.ok) {
        throw new Error(`Server mengembalikan status ${response.status}`)
      }
      const payload: { status: string; items?: PublicIpItem[] } = await response.json()

      if (payload.status !== "ok" || !Array.isArray(payload.items)) {
        throw new Error("Format data tidak valid.")
      }

      setItems(payload.items)
      setLastUpdated(Date.now())
    } catch (err) {
      const message = err instanceof Error ? err.message : "Terjadi kesalahan tidak dikenal."
      setError(message)
      setInfoMessage(null)
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchData()
  }, [fetchData])

  const displayTimestamp = useCallback((value: string | null) => {
    if (!value) {
      return "-"
    }
    try {
      return formatWibTimestamp(value)
    } catch {
      return value
    }
  }, [])

  const handleDelete = useCallback(
    async (item: PublicIpItem) => {
      const confirmed = window.confirm(`Hapus IP ${item.ipAddress ?? "(tanpa alamat)" }?`)
      if (!confirmed) {
        return
      }
      setDeletingId(item.id)
      setError(null)
      setInfoMessage(null)
      try {
        const response = await fetch(`/api/ip-addresses?id=${item.id}`, { method: "DELETE" })
        if (!response.ok) {
          const errorPayload = await response.json().catch(() => null)
          const message =
            typeof errorPayload?.message === "string" && errorPayload.message.trim()
              ? errorPayload.message
              : `Gagal menghapus IP publik (status ${response.status}).`
          throw new Error(message)
        }
        const result = (await response.json()) as { items?: PublicIpItem[]; message?: string }
        setItems(result.items ?? [])
        setLastUpdated(Date.now())
        setInfoMessage(result.message ?? "IP publik berhasil dihapus.")
      } catch (err) {
        const message = err instanceof Error ? err.message : "Terjadi kesalahan tidak dikenal."
        setError(message)
      } finally {
        setDeletingId(null)
      }
    },
    [],
  )

  const renderStatusBadge = (status: string | null) => {
    if (!status) {
      return "-"
    }

    const baseClass = "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium capitalize"
    const normalized = status.toLowerCase()
    let variantClass = "border-border text-muted-foreground"

    if (["aktif", "active", "available", "ready"].includes(normalized)) {
      variantClass = "border-emerald-500/40 bg-emerald-500/10 text-emerald-500"
    } else if (["nonaktif", "inactive", "used", "down"].includes(normalized)) {
      variantClass = "border-red-500/40 bg-red-500/10 text-red-500"
    } else if (["pending", "reserved", "maintenance"].includes(normalized)) {
      variantClass = "border-amber-500/40 bg-amber-500/10 text-amber-500"
    }

    return <span className={`${baseClass} ${variantClass}`}>{status}</span>
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Manajemen IP Address</h2>
          <p className="text-sm text-muted-foreground">
            Daftar alokasi IP Address dan status penggunaannya.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdated ? (
            <span className="text-xs text-muted-foreground">
              Terakhir diperbarui {formatRelativeTime(lastUpdated)}
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => {
              setFormData({
                ipAddress: "",
                subnet: "",
                customerName: "",
                status: "",
                description: "",
              })
              setFormError(null)
              setIsFormOpen(true)
            }}
            className="inline-flex items-center gap-2 rounded border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition hover:border-primary hover:text-primary"
          >
            <Plus className="h-4 w-4" />
            Tambah IP
          </button>
          <button
            type="button"
            onClick={() => void fetchData()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-70"
          >
            <RefreshCcw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Muat Ulang
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded border border-red-500/40 bg-red-500/5 px-4 py-2 text-sm text-red-500">
          {error}
        </div>
      ) : null}

      {infoMessage ? (
        <div className="rounded border border-emerald-500/40 bg-emerald-500/5 px-4 py-2 text-sm text-emerald-500">
          {infoMessage}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center gap-2 px-4 py-10 text-sm text-muted-foreground">
            <RefreshCcw className="h-4 w-4 animate-spin" />
            Mengambil data IP publik...
          </div>
        ) : items.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">
            Belum ada data IP publik untuk ditampilkan.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-secondary/30 text-muted-foreground">
                  <th className="border border-border px-3 py-2 text-left font-semibold">IP Address</th>
                  <th className="border border-border px-3 py-2 text-left font-semibold">Subnet</th>
                  <th className="border border-border px-3 py-2 text-left font-semibold">Nama Pelanggan</th>
                  <th className="border border-border px-3 py-2 text-left font-semibold">Status</th>
                  <th className="border border-border px-3 py-2 text-left font-semibold">Deskripsi</th>
                  <th className="border border-border px-3 py-2 text-left font-semibold">Dibuat</th>
                  <th className="border border-border px-3 py-2 text-left font-semibold">Diperbarui</th>
                  <th className="border border-border px-3 py-2 text-left font-semibold">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="odd:bg-card even:bg-background/80">
                    <td className="border border-border px-3 py-2 font-medium text-foreground">
                      {item.ipAddress ?? "-"}
                    </td>
                    <td className="border border-border px-3 py-2 text-muted-foreground">
                      {item.subnet ?? "-"}
                    </td>
                    <td className="border border-border px-3 py-2 text-muted-foreground">
                      {item.customerName ?? "-"}
                    </td>
                    <td className="border border-border px-3 py-2 text-muted-foreground">
                      {renderStatusBadge(item.status)}
                    </td>
                    <td className="border border-border px-3 py-2 text-muted-foreground">
                      {item.description ?? "-"}
                    </td>
                    <td className="border border-border px-3 py-2 text-muted-foreground">
                      {displayTimestamp(item.createdAt)}
                    </td>
                    <td className="border border-border px-3 py-2 text-muted-foreground">
                      {displayTimestamp(item.updatedAt)}
                    </td>
                    <td className="border border-border px-3 py-2">
                      <button
                        type="button"
                        onClick={() => void handleDelete(item)}
                        disabled={deletingId === item.id}
                        className="inline-flex items-center gap-2 rounded border border-red-500/40 bg-red-500/5 px-3 py-1.5 text-xs font-medium text-red-500 transition hover:border-red-500/60 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {deletingId === item.id ? <RefreshCcw className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                        {deletingId === item.id ? "Menghapus..." : "Hapus"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {isFormOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="relative w-full max-w-lg rounded-lg border border-border bg-card p-5 shadow-lg">
            <button
              type="button"
              onClick={() => {
                if (!submitting) {
                  setIsFormOpen(false)
                }
              }}
              className="absolute right-4 top-4 rounded border border-border bg-background px-2 py-1 text-xs text-muted-foreground transition hover:border-primary hover:text-primary"
            >
              <X className="h-3.5 w-3.5" />
            </button>
            <h3 className="mb-4 text-base font-semibold text-foreground">Tambah IP Publik</h3>
            {formError ? (
              <div className="mb-3 rounded border border-red-500/40 bg-red-500/5 px-3 py-2 text-xs text-red-500">
                {formError}
              </div>
            ) : null}
            <form
              className="space-y-3"
              onSubmit={async (event) => {
                event.preventDefault()
                if (submitting) return

                setFormError(null)
                setSubmitting(true)
                setError(null)

                try {
                  const payload = {
                    ipAddress: formData.ipAddress.trim(),
                    subnet: formData.subnet.trim() || null,
                    customerName: formData.customerName.trim(),
                    status: formData.status.trim() || null,
                    description: formData.description.trim() || null,
                  }

                  if (!payload.ipAddress) {
                    throw new Error("IP address wajib diisi.")
                  }
                  if (!payload.customerName) {
                    throw new Error("Nama pelanggan wajib diisi.")
                  }

                  const response = await fetch("/api/ip-addresses", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                  })

                  if (!response.ok) {
                    const errorPayload = await response.json().catch(() => null)
                    const message =
                      typeof errorPayload?.message === "string" && errorPayload.message.trim()
                        ? errorPayload.message
                        : `Gagal menambahkan IP publik (status ${response.status}).`
                    throw new Error(message)
                  }

                  const result = (await response.json()) as { items?: PublicIpItem[]; message?: string }
                  setItems(result.items ?? [])
                  setLastUpdated(Date.now())
                  setInfoMessage(result.message ?? "IP publik berhasil ditambahkan.")
                  setIsFormOpen(false)
                } catch (err) {
                  const message = err instanceof Error ? err.message : "Terjadi kesalahan tidak dikenal."
                  setFormError(message)
                } finally {
                  setSubmitting(false)
                }
              }}
            >
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <FormField label="IP Address" required>
                  <input
                    name="ipAddress"
                    value={formData.ipAddress}
                    onChange={(event) =>
                      setFormData((prev) => ({ ...prev, ipAddress: event.target.value }))
                    }
                    required
                    className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                  />
                </FormField>
                <FormField label="Subnet">
                  <input
                    name="subnet"
                    value={formData.subnet}
                    onChange={(event) => setFormData((prev) => ({ ...prev, subnet: event.target.value }))}
                    placeholder="Mis. /29"
                    className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                  />
                </FormField>
                <FormField label="Nama Pelanggan" required>
                  <input
                    name="customerName"
                    value={formData.customerName}
                    onChange={(event) =>
                      setFormData((prev) => ({ ...prev, customerName: event.target.value }))
                    }
                    required
                    className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                  />
                </FormField>
                <FormField label="Status">
                  <select
                    name="status"
                    value={formData.status}
                    onChange={(event) => setFormData((prev) => ({ ...prev, status: event.target.value }))}
                    className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                  >
                    <option value="">Pilih status</option>
                    <option value="aktif">Aktif</option>
                    <option value="nonaktif">Nonaktif</option>
                  </select>
                </FormField>
              </div>
              <FormField label="Deskripsi">
                <textarea
                  name="description"
                  value={formData.description}
                  rows={3}
                  onChange={(event) => setFormData((prev) => ({ ...prev, description: event.target.value }))}
                  className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                />
              </FormField>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (!submitting) {
                      setIsFormOpen(false)
                    }
                  }}
                  className="inline-flex items-center gap-2 rounded border border-border bg-background px-3 py-2 text-sm font-medium text-muted-foreground transition hover:border-primary hover:text-primary"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-2 rounded border border-primary bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition hover:border-primary/80 hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {submitting ? (
                    <>
                      <RefreshCcw className="h-4 w-4 animate-spin" />
                      Menyimpan...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4" />
                      Simpan
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  )
}

type AccessPointFormState = {
  id: number
  ssid: string
  btsName: string
  routerName: string
  interfaceName: string
  ipAddress: string
  device: string
  username: string
  password: string
  security: string
  phraseKey: string
  frequency: string
  channelWidth: string
  macAddress: string
  status: string
}

function AccessPointsSection() {
  const [allAccessPoints, setAllAccessPoints] = useState<AccessPointItem[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [infoMessage, setInfoMessage] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<number | null>(null)
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({})
  const [formMode, setFormMode] = useState<"create" | "edit" | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [formData, setFormData] = useState<AccessPointFormState>({
    id: 0,
    ssid: "",
    btsName: "",
    routerName: "",
    interfaceName: "",
    ipAddress: "",
    device: "",
    username: "",
    password: "",
    security: "",
    phraseKey: "",
    frequency: "",
    channelWidth: "",
    macAddress: "",
    status: "Aktif",
  })
  const [searchTerm, setSearchTerm] = useState("")
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      setInfoMessage(null)
      const response = await fetch("/api/access-points")
      if (!response.ok) {
        throw new Error(`Server mengembalikan status ${response.status}`)
      }
      const payload: {
        status: string
        accessPoints?: AccessPointItem[]
        groups?: AccessPointGroup[]
      } = await response.json()

      if (payload.status !== "ok" || !Array.isArray(payload.accessPoints)) {
        throw new Error("Format data tidak valid.")
      }

      setAllAccessPoints(payload.accessPoints ?? [])
      setLastUpdated(Date.now())
      setExpandedGroups({})
    } catch (err) {
      const message = err instanceof Error ? err.message : "Terjadi kesalahan tidak dikenal."
      setError(message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchData()
  }, [fetchData])

  const toggleGroup = (btsName: string) => {
    setExpandedGroups((prev) => ({
      ...prev,
      [btsName]: !prev[btsName],
    }))
  }

  const resetForm = () => {
    setFormData({
      id: 0,
      ssid: "",
      btsName: "",
      routerName: "",
      interfaceName: "",
      ipAddress: "",
      device: "",
      username: "",
      password: "",
      security: "",
      phraseKey: "",
      frequency: "",
      channelWidth: "",
      macAddress: "",
      status: "Aktif",
    })
  }

  const openCreateForm = () => {
    resetForm()
    setFormMode("create")
  }

  const triggerImport = () => {
    if (submitting) {
      return
    }
    fileInputRef.current?.click()
  }

  const openEditForm = (item: AccessPointItem) => {
    setFormData({
      id: item.id,
      ssid: item.ssid === "-" ? "" : item.ssid,
      btsName: item.btsName === "Tanpa BTS" ? "" : item.btsName,
      routerName: item.routerName ?? "",
      interfaceName: item.interfaceName ?? "",
      ipAddress: item.ipAddress ?? "",
      device: item.device ?? "",
      username: item.username ?? "",
      password: item.password ?? "",
      security: item.security ?? "",
      phraseKey: item.phraseKey ?? "",
      frequency: item.frequency ?? "",
      channelWidth: item.channelWidth ?? "",
      macAddress: item.macAddress ?? "",
      status:
        item.status && item.status.toLowerCase() === "dismantle"
          ? "Dismantle"
          : item.status && item.status.toLowerCase() === "aktif"
            ? "Aktif"
            : item.status ?? "Aktif",
    })
    setFormMode("edit")
  }

  const closeForm = () => {
    setFormMode(null)
    setSubmitting(false)
  }

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = event.target
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }))
  }

  const refreshFromResponse = (payload: { accessPoints?: AccessPointItem[] }) => {
    setAllAccessPoints(payload.accessPoints ?? [])
    setLastUpdated(Date.now())
    const message = (payload as { message?: string }).message
    if (typeof message === "string" && message.trim()) {
      setInfoMessage(message)
    }
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!formMode) return
    setSubmitting(true)
    setError(null)
    setInfoMessage(null)

    try {
      const statusRaw = formData.status.trim() || "Aktif"
      const normalizedStatus = statusRaw.toLowerCase()
      const statusValue = normalizedStatus === "aktif" ? "Aktif" : normalizedStatus === "dismantle" ? "Dismantle" : null

      const payload = {
        ssid: formData.ssid.trim(),
        btsName: formData.btsName.trim(),
        routerName: formData.routerName.trim(),
        interfaceName: formData.interfaceName.trim(),
        ipAddress: formData.ipAddress.trim(),
        device: formData.device.trim(),
        username: formData.username.trim(),
        password: formData.password.trim(),
        security: formData.security.trim() || null,
        phraseKey: formData.phraseKey.trim() || null,
        frequency: formData.frequency.trim(),
        channelWidth: formData.channelWidth.trim(),
        macAddress: formData.macAddress.trim(),
        status: statusValue ?? statusRaw,
      }

      if (!payload.ssid || !payload.btsName || !payload.routerName || !payload.interfaceName || !payload.ipAddress || !payload.device || !payload.username || !payload.password || !payload.frequency || !payload.channelWidth || !payload.macAddress) {
        throw new Error("Semua field wajib diisi kecuali Security dan Phrase Key.")
      }
      if (!statusValue) {
        throw new Error('Status harus diisi dengan nilai "Aktif" atau "Dismantle".')
      }

      const response = await fetch("/api/access-points", {
        method: formMode === "create" ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formMode === "create" ? payload : { id: formData.id, ...payload }),
      })

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => null)
        throw new Error(errorPayload?.message ?? "Operasi gagal.")
      }

      const result = await response.json()
      refreshFromResponse(result)
      closeForm()
      if (!result?.message) {
        setInfoMessage("Access point berhasil disimpan.")
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan tidak dikenal.")
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (item: AccessPointItem) => {
    const confirmed = window.confirm(`Hapus access point "${item.ssid}"?`)
    if (!confirmed) {
      return
    }
    setSubmitting(true)
    setError(null)
    setInfoMessage(null)
    try {
      const response = await fetch(`/api/access-points?id=${item.id}`, { method: "DELETE" })
      if (!response.ok) {
        const errorPayload = await response.json().catch(() => null)
        throw new Error(errorPayload?.message ?? "Gagal menghapus access point.")
      }
      const result = await response.json()
      refreshFromResponse(result)
      if (!result?.message) {
        setInfoMessage("Access point berhasil dihapus.")
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan tidak dikenal.")
    } finally {
      setSubmitting(false)
    }
  }

  const handleImportChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }
    setSubmitting(true)
    setError(null)
    setInfoMessage(null)
    try {
      const formData = new FormData()
      formData.append("file", file)

      const response = await fetch("/api/access-points/import", {
        method: "POST",
        body: formData,
      })
      const result = await response.json()
      if (!response.ok && result?.status !== "ok") {
        throw new Error(result?.message ?? "Gagal mengimpor data access point.")
      }
      refreshFromResponse(result)
      if (!result?.message) {
        setInfoMessage("Import data access point selesai.")
      }
      if (Array.isArray(result?.failedRows) && result.failedRows.length > 0) {
        setError(
          `Sebagian data gagal diimpor (${result.failedRows.length}). Contoh: ${result.failedRows
            .slice(0, 3)
            .map((row: { index: number; message: string }) => `Baris ${row.index}: ${row.message}`)
            .join("; ")}`,
        )
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan tidak dikenal saat import.")
    } finally {
      event.target.value = ""
      setSubmitting(false)
    }
  }

  const renderAccessPointStatus = (status: string | null) => {
    if (!status) {
      return "-"
    }
    const normalized = status.toLowerCase()
    const baseClass = "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize"
    if (normalized === "aktif") {
      return <span className={`${baseClass} border-emerald-500/40 bg-emerald-500/10 text-emerald-500`}>{status}</span>
    }
    if (normalized === "dismantle") {
      return <span className={`${baseClass} border-red-500/40 bg-red-500/10 text-red-500`}>{status}</span>
    }
    return <span className={`${baseClass} border-border text-muted-foreground`}>{status}</span>
  }

  const filteredAccessPoints = useMemo(() => {
    if (!searchTerm.trim()) {
      return allAccessPoints
    }
    const term = searchTerm.trim().toLowerCase()
    return allAccessPoints.filter((item) => {
      const values = [
        item.btsName,
        item.ssid,
        item.routerName,
        item.interfaceName,
        item.device,
        item.ipAddress,
        item.username,
        item.password,
        item.security,
        item.phraseKey,
        item.frequency,
        item.channelWidth,
        item.macAddress,
        item.status,
      ]
      return values.some((value) => (value ?? "").toLowerCase().includes(term))
    })
  }, [allAccessPoints, searchTerm])

  const displayGroups = useMemo(() => {
    const map = new Map<string, AccessPointGroup>()
    filteredAccessPoints.forEach((item) => {
      const key = item.btsName || "Tanpa BTS"
      if (!map.has(key)) {
        map.set(key, { btsName: key, total: 0, items: [] })
      }
      const group = map.get(key)!
      group.items.push(item)
      group.total = group.items.length
    })
    return Array.from(map.values()).sort((a, b) => a.btsName.localeCompare(b.btsName))
  }, [filteredAccessPoints])

  useEffect(() => {
    setExpandedGroups((prev) => {
      const next: Record<string, boolean> = {}
      displayGroups.forEach((group) => {
        next[group.btsName] = prev[group.btsName] ?? false
      })
      return next
    })
  }, [displayGroups])

  return (
    <section className="rounded border border-border bg-card p-5 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Access Point</h2>
          <p className="text-xs text-muted-foreground">
            {lastUpdated ? `· diperbarui ${formatRelativeTime(lastUpdated)}` : "Sinkron dengan API internal isolir."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Cari SSID, BTS, IP, router..."
            className="rounded border border-border bg-background px-3 py-2 text-xs focus:border-primary focus:outline-none"
          />
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={handleImportChange}
          />
          <button
            type="button"
            onClick={triggerImport}
            disabled={submitting}
            className="inline-flex items-center gap-2 rounded border border-emerald-500/60 bg-emerald-500/10 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-emerald-500 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Upload className="h-4 w-4" />
            Import XLSX
          </button>
          <button
            type="button"
            onClick={openCreateForm}
            className="inline-flex items-center gap-2 rounded border border-primary/60 bg-primary/10 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-primary transition hover:bg-primary/20"
          >
            <Plus className="h-4 w-4" />
            Tambah
          </button>
        </div>
      </div>

      {error ? <div className="rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-400">❌ {error}</div> : null}
      {infoMessage ? (
        <div className="rounded border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-500">
          {infoMessage}
        </div>
      ) : null}

      {loading && allAccessPoints.length === 0 ? <p className="text-sm text-muted-foreground">Memuat data access point…</p> : null}

      {!loading && filteredAccessPoints.length === 0 && !error ? (
        <p className="text-sm text-muted-foreground">Data access point tidak ditemukan.</p>
      ) : null}

      <div className="space-y-3">
        {displayGroups.map((group) => {
          const isOpen = expandedGroups[group.btsName] ?? false
          return (
            <div key={group.btsName} className="rounded border border-border bg-background">
              <button
                type="button"
                onClick={() => toggleGroup(group.btsName)}
                className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-foreground transition hover:bg-secondary/40"
              >
                <span>{group.btsName}</span>
                <span className="flex items-center gap-2 text-xs text-muted-foreground">
                  {group.total} access point
                  <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? "-rotate-180" : ""}`} />
                </span>
              </button>
              {isOpen ? (
                <div className="overflow-x-auto border-t border-border">
                  <table className="min-w-full text-xs">
                    <thead>
                      <tr className="bg-secondary/30 text-muted-foreground">
                        <th className="border border-border px-3 py-2 text-left font-semibold">SSID</th>
                        <th className="border border-border px-3 py-2 text-left font-semibold">Router</th>
                        <th className="border border-border px-3 py-2 text-left font-semibold">Interface</th>
                        <th className="border border-border px-3 py-2 text-left font-semibold">Perangkat</th>
                        <th className="border border-border px-3 py-2 text-left font-semibold">IP Address</th>
                        <th className="border border-border px-3 py-2 text-left font-semibold">Security</th>
                        <th className="border border-border px-3 py-2 text-left font-semibold">Frequency</th>
                        <th className="border border-border px-3 py-2 text-left font-semibold">Channel</th>
                        <th className="border border-border px-3 py-2 text-left font-semibold">MAC</th>
                        <th className="border border-border px-3 py-2 text-left font-semibold">Status</th>
                        <th className="border border-border px-3 py-2 text-left font-semibold">Aksi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.items.map((item) => (
                        <tr key={item.id} className="odd:bg-card even:bg-background/80">
                          <td className="border border-border px-3 py-2 font-medium text-foreground">{item.ssid}</td>
                          <td className="border border-border px-3 py-2 text-muted-foreground">
                            {item.routerName ?? "Tanpa Router"}
                          </td>
                          <td className="border border-border px-3 py-2 text-muted-foreground">{item.interfaceName ?? "-"}</td>
                          <td className="border border-border px-3 py-2 text-muted-foreground">{item.device ?? "-"}</td>
                          <td className="border border-border px-3 py-2 text-muted-foreground">{item.ipAddress ?? "-"}</td>
                          <td className="border border-border px-3 py-2 text-muted-foreground">{item.security ?? "-"}</td>
                          <td className="border border-border px-3 py-2 text-muted-foreground">
                            {item.frequency ? `${item.frequency} MHz` : "-"}
                          </td>
                          <td className="border border-border px-3 py-2 text-muted-foreground">
                            {item.channelWidth ? `${item.channelWidth} MHz` : "-"}
                          </td>
                          <td className="border border-border px-3 py-2 text-muted-foreground">{item.macAddress ?? "-"}</td>
                          <td className="border border-border px-3 py-2 text-muted-foreground">{renderAccessPointStatus(item.status)}</td>
                          <td className="border border-border px-3 py-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <button
                                type="button"
                                onClick={() => openEditForm(item)}
                                className="inline-flex items-center gap-1 rounded border border-border px-2 py-1 text-[11px] font-medium text-muted-foreground transition hover:border-primary hover:text-primary"
                              >
                                <Pencil className="h-3 w-3" />
                                Edit
                              </button>
                              <button
                                type="button"
                                onClick={() => void handleDelete(item)}
                                disabled={submitting}
                                className="inline-flex items-center gap-1 rounded border border-red-500/40 px-2 py-1 text-[11px] font-medium text-red-500 transition hover:border-red-500/60 hover:text-red-400 disabled:opacity-60"
                              >
                                <Trash2 className="h-3 w-3" />
                                Hapus
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
      {formMode ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="relative w-full max-w-xl rounded-lg border border-border bg-card p-5 shadow-xl">
            <button
              type="button"
              onClick={closeForm}
              className="absolute right-4 top-4 rounded border border-border bg-background px-2 py-1 text-xs text-muted-foreground transition hover:border-primary hover:text-primary"
            >
              <X className="h-3.5 w-3.5" />
            </button>
            <h3 className="mb-4 text-base font-semibold text-foreground">
              {formMode === "create" ? "Tambah Access Point" : "Edit Access Point"}
            </h3>
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <FormField label="SSID" required>
                  <input
                    name="ssid"
                    value={formData.ssid}
                    onChange={handleInputChange}
                    required
                    className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                  />
                </FormField>
                <FormField label="Nama BTS" required>
                  <input
                    name="btsName"
                    value={formData.btsName}
                    onChange={handleInputChange}
                    required
                    className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                  />
                </FormField>
                <FormField label="Nama Router" required>
                  <input
                    name="routerName"
                    value={formData.routerName}
                    onChange={handleInputChange}
                    required
                    className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                  />
                </FormField>
                <FormField label="Interface" required>
                  <input
                    name="interfaceName"
                    value={formData.interfaceName}
                    onChange={handleInputChange}
                    required
                    className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                  />
                </FormField>
                <FormField label="IP Address" required>
                  <input
                    name="ipAddress"
                    value={formData.ipAddress}
                    onChange={handleInputChange}
                    required
                    className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                  />
                </FormField>
                <FormField label="Perangkat" required>
                  <input
                    name="device"
                    value={formData.device}
                    onChange={handleInputChange}
                    required
                    className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                  />
                </FormField>
                <FormField label="Username" required>
                  <input
                    name="username"
                    value={formData.username}
                    onChange={handleInputChange}
                    required
                    className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                  />
                </FormField>
                <FormField label="Password" required>
                  <input
                    name="password"
                    value={formData.password}
                    onChange={handleInputChange}
                    required
                    className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                  />
                </FormField>
                <FormField label="Security">
                  <input
                    name="security"
                    value={formData.security}
                    onChange={handleInputChange}
                    className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                  />
                </FormField>
                <FormField label="Phrase Key">
                  <input
                    name="phraseKey"
                    value={formData.phraseKey}
                    onChange={handleInputChange}
                    className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                  />
                </FormField>
                <FormField label="Frequency (MHz)" required>
                  <input
                    name="frequency"
                    value={formData.frequency}
                    onChange={handleInputChange}
                    required
                    className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                  />
                </FormField>
                <FormField label="Channel Width (MHz)" required>
                  <input
                    name="channelWidth"
                    value={formData.channelWidth}
                    onChange={handleInputChange}
                    required
                    className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                  />
                </FormField>
                <FormField label="MAC Address" required>
                  <input
                    name="macAddress"
                    value={formData.macAddress}
                    onChange={handleInputChange}
                    required
                    className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                  />
                </FormField>
                <FormField label="Status" required>
                  <select
                    name="status"
                    value={formData.status}
                    onChange={handleInputChange}
                    required
                    className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                  >
                    <option value="Aktif">Aktif</option>
                    <option value="Dismantle">Dismantle</option>
                  </select>
                </FormField>
              </div>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={closeForm}
                  className="rounded border border-border bg-background px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground transition hover:border-primary hover:text-foreground"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-2 rounded border border-primary/60 bg-primary px-3 py-2 text-xs font-semibold uppercase tracking-wide text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {submitting ? (
                    <>
                      <RefreshCcw className="h-4 w-4 animate-spin" />
                      Menyimpan...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4" />
                      Simpan
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  )
}

const CLIENTS_PAGE_SIZE = 21


function AktivasiClientsSection() {
  const [items, setItems] = useState<AktivasiClientItem[]>([])
  const [loading, setLoading] = useState<boolean>(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<number | null>(null)
  const [infoMessage, setInfoMessage] = useState<string | null>(null)
  const [formMode, setFormMode] = useState<"create" | "edit" | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState<boolean>(false)
  const [deletingId, setDeletingId] = useState<number | null>(null)
  const [formData, setFormData] = useState<AktivasiClientItem>({
    id: null,
    namaPelanggan: "",
    namaLayanan: "",
    kapasitasLayanan: "",
    vlanId: "",
    namaMetro: "",
    siteMetro: "",
    kapasitasMetro: "",
    ipAddress: "",
    ipGateway: "",
    routerGateway: "",
    createdBy: null,
    createdAt: null,
    updatedAt: null,
  })

  const fetchData = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      setInfoMessage(null)
      const response = await fetch("/api/aktivasi-clients")
      if (!response.ok) {
        throw new Error(`Server mengembalikan status ${response.status}`)
      }
      const payload: { status: string; items?: AktivasiClientItem[] } = await response.json()

      if (payload.status !== "ok" || !Array.isArray(payload.items)) {
        throw new Error("Format data tidak valid.")
      }

      setItems(payload.items)
      setLastUpdated(Date.now())
    } catch (err) {
      const message = err instanceof Error ? err.message : "Terjadi kesalahan tidak dikenal."
      setError(message)
      setInfoMessage(null)
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchData()
  }, [fetchData])

  const displayTimestamp = useCallback((value: string | null) => {
    if (!value) {
      return "-"
    }
    try {
      return formatWibTimestamp(value)
    } catch {
      return value
    }
  }, [])

  const handleOpenCreateForm = () => {
    setFormData({
      id: null,
      namaPelanggan: "",
      namaLayanan: "",
      kapasitasLayanan: "",
      vlanId: "",
      namaMetro: "",
      siteMetro: "",
      kapasitasMetro: "",
      ipAddress: "",
      ipGateway: "",
      routerGateway: "",
      createdBy: null,
      createdAt: null,
      updatedAt: null,
    })
    setFormError(null)
    setFormMode("create")
  }

  const handleOpenEditForm = (item: AktivasiClientItem) => {
    setFormData(item)
    setFormError(null)
    setFormMode("edit")
  }

  const handleCloseForm = () => {
    if (!submitting) {
      setFormMode(null)
    }
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (submitting || !formMode) return

    setFormError(null)
    setSubmitting(true)
    setError(null)

    try {
      const payload = {
        namaPelanggan: formData.namaPelanggan.trim(),
        namaLayanan: formData.namaLayanan.trim(),
        kapasitasLayanan: formData.kapasitasLayanan.trim(),
        vlanId: formData.vlanId.trim(),
        namaMetro: formData.namaMetro.trim(),
        siteMetro: formData.siteMetro.trim(),
        kapasitasMetro: formData.kapasitasMetro.trim(),
        ipAddress: formData.ipAddress.trim(),
        ipGateway: formData.ipGateway.trim(),
        routerGateway: formData.routerGateway.trim(),
      }

      if (Object.values(payload).some((value) => !value)) {
        throw new Error("Semua field wajib diisi.")
      }

      const isEdit = formMode === "edit"
      const url = "/api/aktivasi-clients"
      const method = isEdit ? "PUT" : "POST"
      const body = isEdit ? JSON.stringify({ id: formData.id, ...payload }) : JSON.stringify(payload)

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body,
      })

      if (!response.ok) {
        const errorPayload = await response.json().catch(() => null)
        const message =
          typeof errorPayload?.message === "string" && errorPayload.message.trim()
            ? errorPayload.message
            : `Gagal ${isEdit ? "memperbarui" : "menambahkan"} aktivasi (status ${response.status}).`
        throw new Error(message)
      }

      const result = (await response.json()) as { items?: AktivasiClientItem[]; message?: string }
      setItems(result.items ?? [])
      setLastUpdated(Date.now())
      setInfoMessage(result.message ?? `Aktivasi berhasil ${isEdit ? "diperbarui" : "ditambahkan"}.`)
      handleCloseForm()
    } catch (err) {
      const message = err instanceof Error ? err.message : "Terjadi kesalahan tidak dikenal."
      setFormError(message)
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = useCallback(
    async (item: AktivasiClientItem) => {
      if (!item.id) {
        return
      }
      const confirmed = window.confirm(`Hapus aktivasi untuk ${item.namaPelanggan}?`)
      if (!confirmed) {
        return
      }
      setDeletingId(item.id)
      setError(null)
      setInfoMessage(null)
      try {
        const response = await fetch(`/api/aktivasi-clients?id=${item.id}`, { method: "DELETE" })
        if (!response.ok) {
          const errorPayload = await response.json().catch(() => null)
          const message =
            typeof errorPayload?.message === "string" && errorPayload.message.trim()
              ? errorPayload.message
              : `Gagal menghapus aktivasi (status ${response.status}).`
          throw new Error(message)
        }
        const result = (await response.json()) as { items?: AktivasiClientItem[]; message?: string }
        setItems(result.items ?? [])
        setLastUpdated(Date.now())
        setInfoMessage(result.message ?? "Aktivasi berhasil dihapus.")
      } catch (err) {
        const message = err instanceof Error ? err.message : "Terjadi kesalahan tidak dikenal."
        setError(message)
      } finally {
        setDeletingId(null)
      }
    },
    [fetchData],
  )

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Aktivasi Reseller</h2>
          <p className="text-sm text-muted-foreground">
            Daftar aktivasi pelanggan reseller yang telah dibuat.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdated ? (
            <span className="text-xs text-muted-foreground">
              Terakhir diperbarui {formatRelativeTime(lastUpdated)}
            </span>
          ) : null}
          <button
            type="button"
            onClick={handleOpenCreateForm}
            className="inline-flex items-center gap-2 rounded border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition hover:border-primary hover:text-primary"
          >
            <Plus className="h-4 w-4" />
            Tambah Aktivasi
          </button>
          <button
            type="button"
            onClick={() => void fetchData()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded border border-border bg-background px-3 py-2 text-sm font-medium text-foreground transition hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-70"
          >
            <RefreshCcw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Muat Ulang
          </button>
        </div>
      </div>

      {error ? (
        <div className="rounded border border-red-500/40 bg-red-500/5 px-4 py-2 text-sm text-red-500">
          {error}
        </div>
      ) : null}

      {infoMessage ? (
        <div className="rounded border border-emerald-500/40 bg-emerald-500/5 px-4 py-2 text-sm text-emerald-500">
          {infoMessage}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
        {loading ? (
          <div className="flex items-center justify-center gap-2 px-4 py-10 text-sm text-muted-foreground">
            <RefreshCcw className="h-4 w-4 animate-spin" />
            Mengambil data aktivasi...
          </div>
        ) : items.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-muted-foreground">
            Belum ada data aktivasi untuk ditampilkan.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="bg-secondary/30 text-muted-foreground">
                  <th className="border border-border px-3 py-2 text-left font-semibold">Nama Pelanggan</th>
                  <th className="border border-border px-3 py-2 text-left font-semibold">Layanan</th>
                  <th className="border border-border px-3 py-2 text-left font-semibold">VLAN</th>
                  <th className="border border-border px-3 py-2 text-left font-semibold">Metro</th>
                  <th className="border border-border px-3 py-2 text-left font-semibold">IP Address</th>
                  <th className="border border-border px-3 py-2 text-left font-semibold">Dibuat oleh</th>
                  <th className="border border-border px-3 py-2 text-left font-semibold">Waktu</th>
                  <th className="border border-border px-3 py-2 text-left font-semibold">Aksi</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id} className="odd:bg-card even:bg-background/80">
                    <td className="border border-border px-3 py-2 font-medium text-foreground">
                      {item.namaPelanggan}
                    </td>
                    <td className="border border-border px-3 py-2 text-muted-foreground">
                      {item.namaLayanan} ({item.kapasitasLayanan})
                    </td>
                    <td className="border border-border px-3 py-2 text-muted-foreground">{item.vlanId}</td>
                    <td className="border border-border px-3 py-2 text-muted-foreground">
                      {item.namaMetro} ({item.siteMetro} / {item.kapasitasMetro})
                    </td>
                    <td className="border border-border px-3 py-2 text-muted-foreground">
                      <div className="flex flex-col">
                        <span>{item.ipAddress}</span>
                        <span className="text-xs text-muted-foreground/80">Gateway: {item.ipGateway}</span>
                        <span className="text-xs text-muted-foreground/80">via {item.routerGateway}</span>
                      </div>
                    </td>
                    <td className="border border-border px-3 py-2 text-muted-foreground">
                      {item.createdBy ?? "-"}
                    </td>
                    <td className="border border-border px-3 py-2 text-muted-foreground">
                      {displayTimestamp(item.createdAt)}
                    </td>
                    <td className="border border-border px-3 py-2">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleOpenEditForm(item)}
                          className="inline-flex items-center gap-2 rounded border border-amber-500/40 bg-amber-500/5 px-3 py-1.5 text-xs font-medium text-amber-500 transition hover:border-amber-500/60 hover:text-amber-400"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDelete(item)}
                          disabled={deletingId === item.id}
                          className="inline-flex items-center gap-2 rounded border border-red-500/40 bg-red-500/5 px-3 py-1.5 text-xs font-medium text-red-500 transition hover:border-red-500/60 hover:text-red-400 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {deletingId === item.id ? <RefreshCcw className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                          {deletingId === item.id ? "Menghapus..." : "Hapus"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {formMode ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="relative w-full max-w-2xl rounded-lg border border-border bg-card p-5 shadow-lg">
            <button
              type="button"
              onClick={handleCloseForm}
              className="absolute right-4 top-4 rounded border border-border bg-background px-2 py-1 text-xs text-muted-foreground transition hover:border-primary hover:text-primary"
            >
              <X className="h-3.5 w-3.5" />
            </button>
            <h3 className="mb-4 text-base font-semibold text-foreground">
              {formMode === "edit" ? "Edit Aktivasi Reseller" : "Tambah Aktivasi Reseller"}
            </h3>
            {formError ? (
              <div className="mb-3 rounded border border-red-500/40 bg-red-500/5 px-3 py-2 text-xs text-red-500">
                {formError}
              </div>
            ) : null}
            <form
              className="space-y-3"
              onSubmit={handleSubmit}
            >
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <FormField label="Nama Pelanggan" required>
                  <input
                    name="namaPelanggan"
                    value={formData.namaPelanggan}
                    onChange={(event) =>
                      setFormData((prev) => ({ ...prev, namaPelanggan: event.target.value }))
                    }
                    required
                    className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                  />
                </FormField>
                <FormField label="Nama Layanan" required>
                  <input
                    name="namaLayanan"
                    value={formData.namaLayanan}
                    onChange={(event) =>
                      setFormData((prev) => ({ ...prev, namaLayanan: event.target.value }))
                    }
                    required
                    className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                  />
                </FormField>
                <FormField label="Kapasitas Layanan" required>
                  <input
                    name="kapasitasLayanan"
                    value={formData.kapasitasLayanan}
                    onChange={(event) =>
                      setFormData((prev) => ({ ...prev, kapasitasLayanan: event.target.value }))
                    }
                    required
                    className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                  />
                </FormField>
                <FormField label="VLAN ID" required>
                  <input
                    name="vlanId"
                    value={formData.vlanId}
                    onChange={(event) => setFormData((prev) => ({ ...prev, vlanId: event.target.value }))}
                    required
                    className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                  />
                </FormField>
                <FormField label="Nama Metro" required>
                  <input
                    name="namaMetro"
                    value={formData.namaMetro}
                    onChange={(event) =>
                      setFormData((prev) => ({ ...prev, namaMetro: event.target.value }))
                    }
                    required
                    className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                  />
                </FormField>
                <FormField label="Site Metro" required>
                  <input
                    name="siteMetro"
                    value={formData.siteMetro}
                    onChange={(event) =>
                      setFormData((prev) => ({ ...prev, siteMetro: event.target.value }))
                    }
                    required
                    className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                  />
                </FormField>
                <FormField label="Kapasitas Metro" required>
                  <input
                    name="kapasitasMetro"
                    value={formData.kapasitasMetro}
                    onChange={(event) =>
                      setFormData((prev) => ({ ...prev, kapasitasMetro: event.target.value }))
                    }
                    required
                    className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                  />
                </FormField>
                <FormField label="IP Address" required>
                  <input
                    name="ipAddress"
                    value={formData.ipAddress}
                    onChange={(event) =>
                      setFormData((prev) => ({ ...prev, ipAddress: event.target.value }))
                    }
                    required
                    className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                  />
                </FormField>
                <FormField label="IP Gateway" required>
                  <input
                    name="ipGateway"
                    value={formData.ipGateway}
                    onChange={(event) =>
                      setFormData((prev) => ({ ...prev, ipGateway: event.target.value }))
                    }
                    required
                    className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                  />
                </FormField>
                <FormField label="Router Gateway" required>
                  <input
                    name="routerGateway"
                    value={formData.routerGateway}
                    onChange={(event) =>
                      setFormData((prev) => ({ ...prev, routerGateway: event.target.value }))
                    }
                    required
                    className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                  />
                </FormField>
              </div>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={handleCloseForm}
                  className="inline-flex items-center gap-2 rounded border border-border bg-background px-3 py-2 text-sm font-medium text-muted-foreground transition hover:border-primary hover:text-primary"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-2 rounded border border-primary bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition hover:border-primary/80 hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {submitting ? (
                    <>
                      <RefreshCcw className="h-4 w-4 animate-spin" />
                      Menyimpan...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4" />
                      Simpan
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  )
}

function ClientsSection() {
  const [clients, setClients] = useState<ClientItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState("")
  const [activeSearch, setActiveSearch] = useState("")
  const [routers, setRouters] = useState<Array<{ id: number; name: string }>>([])
  const [selectedRouterId, setSelectedRouterId] = useState<number | null>(null)
  const [activeRouterId, setActiveRouterId] = useState<number | null>(null)
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(0)
  const [totalItems, setTotalItems] = useState(0)
  const [submitting, setSubmitting] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [createForm, setCreateForm] = useState<ClientFormState>(() => ({
    username: "",
    ipAddress: "",
    type: "pppoe",
    status: "aktif",
    profile: "",
    comment: "",
    routerId: "",
  }))
  const [editOpen, setEditOpen] = useState(false)
  const [editingClientId, setEditingClientId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState<ClientFormState>({
    username: "",
    ipAddress: "",
    type: "pppoe",
    status: "aktif",
    profile: "",
    comment: "",
    routerId: "",
  })
  const initialFetchDoneRef = useRef(false)
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  type ClientsResponsePayload = {
    status: string
    items?: ClientItem[]
    pagination?: {
      page: number
      pageSize: number
      totalItems: number
      totalPages: number
      search: string
      routerId: number | null
    }
    routers?: Array<{ id: number; name: string }>
    message?: string
  }

  const resetCreateForm = useCallback(() => {
    setCreateForm({
      username: "",
      ipAddress: "",
      type: "pppoe",
      status: "aktif",
      profile: "",
      comment: "",
      routerId: selectedRouterId ? String(selectedRouterId) : "",
    })
  }, [selectedRouterId])

  const handleOpenCreateForm = useCallback(() => {
    resetCreateForm()
    setCreateOpen(true)
    setError(null)
  }, [resetCreateForm])

  const handleCloseCreateForm = useCallback(() => {
    setCreateOpen(false)
    resetCreateForm()
  }, [resetCreateForm])

  const handleCreateInputChange = useCallback((field: keyof ClientFormState, value: string) => {
    setCreateForm((prev) => ({
      ...prev,
      [field]: value,
    }))
  }, [])

  const resetEditForm = useCallback(() => {
    setEditForm({
      username: "",
      ipAddress: "",
      type: "pppoe",
      status: "aktif",
      profile: "",
      comment: "",
      routerId: selectedRouterId ? String(selectedRouterId) : "",
    })
    setEditingClientId(null)
  }, [selectedRouterId])

  const handleOpenEditForm = useCallback((client: ClientItem) => {
    setEditForm({
      username: client.username ?? "",
      ipAddress: client.ipAddress ?? "",
      type: client.type ?? "pppoe",
      status: client.status === "nonaktif" ? "nonaktif" : "aktif",
      profile:
        client.status === "nonaktif"
          ? client.originalProfile ?? client.profile ?? ""
          : client.profile ?? client.originalProfile ?? "",
      comment: client.comment ?? "",
      routerId: client.routerId ? String(client.routerId) : "",
    })
    setEditingClientId(client.id)
    setEditOpen(true)
    setError(null)
  }, [])

  const handleCloseEditForm = useCallback(() => {
    setEditOpen(false)
    resetEditForm()
  }, [resetEditForm])

  const handleEditInputChange = useCallback((field: keyof ClientFormState, value: string) => {
    setEditForm((prev) => ({
      ...prev,
      [field]: value,
    }))
  }, [])

  const applyPayload = useCallback(
    (payload: ClientsResponsePayload, fallbackPage: number, fallbackSearch: string, fallbackRouterId: number | null) => {
      if (payload.status !== "ok" || !Array.isArray(payload.items)) {
        throw new Error(payload?.message ?? "Format data client tidak valid.")
      }

      setClients(payload.items)
      if (Array.isArray(payload.routers)) {
        setRouters(payload.routers)
      }

      if (payload.pagination) {
        const nextRouterId =
          typeof payload.pagination.routerId === "number" && Number.isFinite(payload.pagination.routerId)
            ? payload.pagination.routerId
            : null
        setPage(payload.pagination.page)
        setTotalPages(payload.pagination.totalPages)
        setTotalItems(payload.pagination.totalItems)
        setActiveSearch(payload.pagination.search ?? "")
        setActiveRouterId(nextRouterId)
        setSelectedRouterId(nextRouterId)
      } else {
        const nextRouterId =
          typeof fallbackRouterId === "number" && Number.isFinite(fallbackRouterId) && fallbackRouterId > 0
            ? fallbackRouterId
            : null
        setPage(fallbackPage)
        setTotalPages(payload.items.length === 0 ? 0 : Math.ceil(payload.items.length / CLIENTS_PAGE_SIZE))
        setTotalItems(payload.items.length)
        setActiveSearch(fallbackSearch)
        setActiveRouterId(nextRouterId)
        setSelectedRouterId(nextRouterId)
      }
    },
    [],
  )

  const fetchClients = useCallback(
    async (options?: { page?: number; search?: string; routerId?: number | null }) => {
      const rawSearch = options?.search ?? activeSearch
      const normalizedSearch = rawSearch.trim()
      const shouldResetPage = options?.search !== undefined
      const requestedPage = options?.page ?? page
      const targetPage = Math.max(1, shouldResetPage ? 1 : requestedPage)
      const routerFilter =
        options?.routerId !== undefined ? options.routerId : activeRouterId
      const normalizedRouterId =
        typeof routerFilter === "number" && Number.isFinite(routerFilter) && routerFilter > 0
          ? Math.floor(routerFilter)
          : null

      try {
        setLoading(true)
        setError(null)

        const params = new URLSearchParams({
          page: String(targetPage),
          pageSize: String(CLIENTS_PAGE_SIZE),
        })
        if (normalizedSearch) {
          params.set("search", normalizedSearch)
        }
        if (normalizedRouterId !== null) {
          params.set("routerId", String(normalizedRouterId))
        }

        const response = await fetch(`/api/clients?${params.toString()}`)
        if (!response.ok) {
          throw new Error(`Server mengembalikan status ${response.status}`)
        }

        const payload: ClientsResponsePayload = await response.json()
        applyPayload(payload, targetPage, normalizedSearch, normalizedRouterId)
      } catch (err) {
        setError(err instanceof Error ? err.message : "Terjadi kesalahan saat memuat data client.")
      } finally {
        setLoading(false)
      }
    },
    [activeRouterId, activeSearch, applyPayload, page],
  )

  useEffect(() => {
    if (initialFetchDoneRef.current) {
      return
    }
    initialFetchDoneRef.current = true
    void fetchClients({ page: 1 })
  }, [fetchClients])

  useEffect(() => {
    return () => {
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current)
      }
    }
  }, [])

  const scheduleSearch = useCallback(
    (value: string) => {
      if (searchDebounceRef.current) {
        clearTimeout(searchDebounceRef.current)
      }
      searchDebounceRef.current = setTimeout(() => {
        searchDebounceRef.current = null
        void fetchClients({ search: value, routerId: selectedRouterId })
      }, 400)
    },
    [fetchClients, selectedRouterId],
  )

  const handleClearSearch = useCallback(() => {
    if (searchDebounceRef.current) {
      clearTimeout(searchDebounceRef.current)
    }
    setSearchTerm("")
    if (activeSearch) {
      void fetchClients({ search: "", routerId: selectedRouterId })
    }
  }, [activeSearch, fetchClients, selectedRouterId])

  const handleRouterFilterChange = useCallback(
    (value: string) => {
      const numeric = Number(value)
      const routerId = value === "" || Number.isNaN(numeric) || numeric <= 0 ? null : numeric
      setSelectedRouterId(routerId)
      void fetchClients({ page: 1, search: searchTerm, routerId })
    },
    [fetchClients, searchTerm],
  )

  const toggleClientStatus = async (client: ClientItem) => {
    const nextStatus = client.status === "aktif" ? "nonaktif" : "aktif"
    setSubmitting(true)
    setError(null)
    try {
      const response = await fetch("/api/clients", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: client.id,
          status: nextStatus,
          page,
          pageSize: CLIENTS_PAGE_SIZE,
          search: activeSearch,
          routerId: activeRouterId,
        }),
      })
      const payload: ClientsResponsePayload = await response.json().catch(() => ({
        status: "error",
        message: "Gagal memproses respons server.",
      }))

      if (!response.ok) {
        throw new Error(payload?.message ?? "Gagal memperbarui status client.")
      }

      applyPayload(payload, page, activeSearch, activeRouterId)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan saat memperbarui status client.")
    } finally {
      setSubmitting(false)
    }
  }

  const handleCreateSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const trimmedUsername = createForm.username.trim()
    if (!trimmedUsername) {
      setError("Username wajib diisi.")
      return
    }

    const trimmedIp = createForm.ipAddress.trim()
    const trimmedProfile = createForm.profile.trim()
    const trimmedComment = createForm.comment.trim()
    const routerIdValue = createForm.routerId.trim()
    const parsedRouterId = routerIdValue ? Number(routerIdValue) : null
    const clientRouterId = parsedRouterId && Number.isFinite(parsedRouterId) && parsedRouterId > 0 ? parsedRouterId : null

    setSubmitting(true)
    setError(null)
    try {
      const response = await fetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: trimmedUsername,
          ipAddress: trimmedIp || null,
          type: createForm.type.trim(),
          status: createForm.status,
          profile: trimmedProfile || null,
          comment: trimmedComment || null,
          routerId: clientRouterId,
          page,
          pageSize: CLIENTS_PAGE_SIZE,
          search: activeSearch,
          filterRouterId: activeRouterId,
        }),
      })

      const payload: ClientsResponsePayload = await response.json().catch(() => ({
        status: "error",
        message: "Gagal memproses respons server.",
      }))

      if (!response.ok) {
        throw new Error(payload?.message ?? "Gagal menambahkan client baru.")
      }

      applyPayload(payload, page, activeSearch, activeRouterId)
      setCreateOpen(false)
      resetCreateForm()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan saat menambahkan client.")
    } finally {
      setSubmitting(false)
    }
  }

  const handleEditSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!editingClientId) {
      return
    }

    const trimmedUsername = editForm.username.trim()
    if (!trimmedUsername) {
      setError("Username wajib diisi.")
      return
    }

    const trimmedIp = editForm.ipAddress.trim()
    const trimmedProfile = editForm.profile.trim()
    const trimmedComment = editForm.comment.trim()
    const routerIdValue = editForm.routerId.trim()
    const parsedRouterId = routerIdValue ? Number(routerIdValue) : null
    const clientRouterId = parsedRouterId && Number.isFinite(parsedRouterId) && parsedRouterId > 0 ? parsedRouterId : null

    setSubmitting(true)
    setError(null)
    try {
      const response = await fetch("/api/clients", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingClientId,
          username: trimmedUsername,
          ipAddress: trimmedIp || null,
          type: editForm.type.trim(),
          status: editForm.status,
          profile: trimmedProfile || null,
          comment: trimmedComment || null,
          routerId: clientRouterId,
          page,
          pageSize: CLIENTS_PAGE_SIZE,
          search: activeSearch,
          filterRouterId: activeRouterId,
        }),
      })

      const payload: ClientsResponsePayload = await response.json().catch(() => ({
        status: "error",
        message: "Gagal memproses respons server.",
      }))

      if (!response.ok) {
        throw new Error(payload?.message ?? "Gagal memperbarui client.")
      }

      applyPayload(payload, page, activeSearch, activeRouterId)
      handleCloseEditForm()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan saat memperbarui client.")
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteClient = async (client: ClientItem) => {
    const confirmed = window.confirm(`Hapus client "${client.username}"?`)
    if (!confirmed) {
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      params.set("id", String(client.id))
      params.set("page", String(page))
      params.set("pageSize", String(CLIENTS_PAGE_SIZE))
      if (activeSearch) {
        params.set("search", activeSearch)
      }
      if (activeRouterId) {
        params.set("routerId", String(activeRouterId))
      }

      const response = await fetch(`/api/clients?${params.toString()}`, { method: "DELETE" })
      const payload: ClientsResponsePayload = await response.json().catch(() => ({
        status: "error",
        message: "Gagal memproses respons server.",
      }))

      if (!response.ok) {
        throw new Error(payload?.message ?? "Gagal menghapus client.")
      }

      applyPayload(payload, page, activeSearch, activeRouterId)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan saat menghapus client.")
    } finally {
      setSubmitting(false)
    }
  }

  const canGoPrev = totalPages > 0 && page > 1
  const canGoNext = totalPages > 0 && page < totalPages
  const showingStart = totalItems === 0 ? 0 : (page - 1) * CLIENTS_PAGE_SIZE + 1
  const showingEnd = totalItems === 0 ? 0 : Math.min(showingStart + clients.length - 1, totalItems)

  return (
    <section className="rounded border border-border bg-card p-5 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Clients</h2>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedRouterId === null ? "" : String(selectedRouterId)}
            onChange={(event) => handleRouterFilterChange(event.target.value)}
            className="w-full max-w-[180px] rounded border border-border bg-background px-3 py-2 text-xs focus:border-primary focus:outline-none"
            disabled={loading}
          >
            <option value="">Semua Router</option>
            {routers.map((router) => (
              <option key={router.id} value={router.id}>
                {router.name}
              </option>
            ))}
          </select>
          <input
            type="search"
            value={searchTerm}
            onChange={(event) => {
              const { value } = event.target
              setSearchTerm(value)
              scheduleSearch(value)
            }}
            placeholder="Cari username, IP, komentar..."
            className="w-full max-w-xs rounded border border-border bg-background px-3 py-2 text-xs focus:border-primary focus:outline-none"
          />
          {activeSearch ? (
            <button
              type="button"
              onClick={handleClearSearch}
              disabled={loading || submitting}
              className="inline-flex items-center gap-2 rounded border border-border bg-background px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground transition hover:border-red-500 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Reset
            </button>
          ) : null}
          <button
            type="button"
            onClick={handleOpenCreateForm}
            disabled={loading || submitting}
            className="inline-flex items-center gap-2 rounded border border-primary/60 bg-primary/10 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-primary transition hover:border-primary hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Plus className="h-4 w-4" />
            Tambah Client
          </button>
          <button
            type="button"
            onClick={() => void fetchClients()}
            disabled={loading || submitting}
            className="inline-flex items-center gap-2 rounded border border-border bg-background px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground transition hover:border-primary hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCcw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Muat Ulang
          </button>
        </div>
      </div>

      {error ? <div className="rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-400">❌ {error}</div> : null}

      {loading && clients.length === 0 ? <p className="text-sm text-muted-foreground">Memuat data client…</p> : null}

      {!loading && clients.length === 0 && !error ? <p className="text-sm text-muted-foreground">Tidak ada client yang ditemukan.</p> : null}

      {clients.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead>
              <tr className="bg-secondary/30 text-muted-foreground">
                <th className="border border-border px-3 py-2 text-left font-semibold">Username</th>
                <th className="border border-border px-3 py-2 text-left font-semibold">IP/PPPoE</th>
                <th className="border border-border px-3 py-2 text-left font-semibold">Tipe</th>
                <th className="border border-border px-3 py-2 text-left font-semibold">Router</th>
                <th className="border border-border px-3 py-2 text-left font-semibold">Status</th>
                <th className="border border-border px-3 py-2 text-left font-semibold">Profile</th>
                <th className="border border-border px-3 py-2 text-left font-semibold">Komentar</th>
                <th className="border border-border px-3 py-2 text-left font-semibold">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((client) => (
                <tr key={client.id} className="odd:bg-card even:bg-background/80 text-foreground">
                  <td className="border border-border px-3 py-2 font-medium">{client.username}</td>
                  <td className="border border-border px-3 py-2 text-muted-foreground">{client.ipAddress ?? "-"}</td>
                  <td className="border border-border px-3 py-2 text-muted-foreground">{client.type ?? "-"}</td>
                  <td className="border border-border px-3 py-2 text-muted-foreground">{client.routerName ?? "Tanpa Router"}</td>
                  <td className="border border-border px-3 py-2">
                    <span
                      className={`rounded-full px-2 py-1 text-[11px] font-semibold uppercase tracking-wide ${
                        client.status === "aktif"
                          ? "border border-green-500/50 bg-green-500/10 text-green-500"
                          : "border border-red-500/50 bg-red-500/10 text-red-500"
                      }`}
                    >
                      {client.status ?? "-"}
                    </span>
                  </td>
                  <td className="border border-border px-3 py-2 text-muted-foreground">{client.profile ?? "-"}</td>
                  <td className="border border-border px-3 py-2 text-muted-foreground">{client.comment ?? "-"}</td>
                  <td className="border border-border px-3 py-2">
                    <div className="inline-flex overflow-hidden rounded-full border border-border/60 bg-background/90 shadow-sm divide-x divide-border/60 divide-x divide-border/60">
                      <button
                        type="button"
                        title={client.status === "aktif" ? "Isolir client" : "Aktifkan client"}
                        onClick={() => void toggleClientStatus(client)}
                        disabled={submitting}
                        className={`inline-flex items-center gap-1 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide transition-colors duration-150 focus:outline-none focus:ring-1 focus:ring-current ${
                          client.status === "aktif"
                            ? "text-red-500 hover:bg-red-500/10"
                            : "text-green-500 hover:bg-green-500/10"
                        } disabled:cursor-not-allowed disabled:opacity-60`}
                      >
                        {client.status === "aktif" ? (
                          <>
                            <Ban className="h-3.5 w-3.5" />
                            Isolir
                          </>
                        ) : (
                          <>
                            <Unlock className="h-3.5 w-3.5" />
                            Aktifkan
                          </>
                        )}
                      </button>
                      <span className="inline-flex items-center px-2 text-border/60">|</span>
                      <button
                        type="button"
                        title="Edit client"
                        onClick={() => handleOpenEditForm(client)}
                        disabled={submitting}
                        className="inline-flex items-center gap-1 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-amber-500 transition-colors duration-150 hover:bg-amber-500/10 focus:outline-none focus:ring-1 focus:ring-amber-500/60 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Edit
                      </button>
                      <span className="inline-flex items-center px-2 text-border/60">|</span>
                      <button
                        type="button"
                        title="Hapus client"
                        onClick={() => void handleDeleteClient(client)}
                        disabled={submitting}
                        className="inline-flex items-center gap-1 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-red-500 transition-colors duration-150 hover:bg-red-500/10 focus:outline-none focus:ring-1 focus:ring-red-500/60 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Hapus
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <div className="flex flex-col gap-2 pt-2 text-[11px] text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <span>
          {totalItems > 0
            ? `Menampilkan ${showingStart.toLocaleString("id-ID")}–${showingEnd.toLocaleString("id-ID")} dari ${totalItems.toLocaleString("id-ID")} client`
            : "Menunggu data client ditampilkan."}
        </span>
        <div className="inline-flex items-center gap-2">
          <button
            type="button"
            onClick={() => void fetchClients({ page: page - 1 })}
            disabled={!canGoPrev || loading || submitting}
            className="inline-flex items-center rounded border border-border bg-background px-2 py-1 font-semibold uppercase tracking-wide transition hover:border-primary hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
          >
            Sebelumnya
          </button>
          <span className="font-semibold text-foreground">
            Halaman {totalPages === 0 ? 1 : page} dari {totalPages === 0 ? 1 : totalPages}
          </span>
          <button
            type="button"
            onClick={() => void fetchClients({ page: page + 1 })}
            disabled={!canGoNext || loading || submitting}
            className="inline-flex items-center rounded border border-border bg-background px-2 py-1 font-semibold uppercase tracking-wide transition hover:border-primary hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
          >
            Berikutnya
          </button>
        </div>
      </div>

      {createOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="relative w-full max-w-xl rounded-lg border border-border bg-card p-5 shadow-lg">
            <button
              type="button"
              onClick={handleCloseCreateForm}
              className="absolute right-4 top-4 rounded border border-border bg-background px-2 py-1 text-xs text-muted-foreground transition hover:border-primary hover:text-primary"
            >
              <X className="h-3.5 w-3.5" />
            </button>
            <h3 className="mb-4 text-base font-semibold text-foreground">Tambah Client</h3>
            <form className="space-y-4" onSubmit={handleCreateSubmit}>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <FormField label="Username" required>
                  <input
                    value={createForm.username}
                    onChange={(event) => handleCreateInputChange("username", event.target.value)}
                    required
                    disabled={submitting}
                    className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                  />
                </FormField>
                <FormField label="IP Address">
                  <input
                    value={createForm.ipAddress}
                    onChange={(event) => handleCreateInputChange("ipAddress", event.target.value)}
                    disabled={submitting}
                    className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                  />
                </FormField>
                <FormField label="Tipe">
                  <select
                    value={createForm.type}
                    onChange={(event) => handleCreateInputChange("type", event.target.value)}
                    disabled={submitting}
                    className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                  >
                    <option value="pppoe">PPPoE</option>
                    <option value="static">Static</option>
                    <option value="dhcp">DHCP</option>
                  </select>
                </FormField>
                <FormField label="Status">
                  <select
                    value={createForm.status}
                    onChange={(event) => handleCreateInputChange("status", event.target.value)}
                    disabled={submitting}
                    className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                  >
                    <option value="aktif">Aktif</option>
                    <option value="nonaktif">Nonaktif</option>
                  </select>
                </FormField>
                <FormField label="Profile">
                  <input
                    value={createForm.profile}
                    onChange={(event) => handleCreateInputChange("profile", event.target.value)}
                    disabled={submitting}
                    className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                  />
                </FormField>
                <FormField label="Router">
                  <select
                    value={createForm.routerId}
                    onChange={(event) => handleCreateInputChange("routerId", event.target.value)}
                    disabled={submitting}
                    className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                  >
                    <option value="">Tanpa Router</option>
                    {routers.map((router) => (
                      <option key={router.id} value={router.id}>
                        {router.name}
                      </option>
                    ))}
                  </select>
                </FormField>
              </div>
              <FormField label="Komentar">
                <textarea
                  value={createForm.comment}
                  onChange={(event) => handleCreateInputChange("comment", event.target.value)}
                  rows={3}
                  disabled={submitting}
                  className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                />
              </FormField>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={handleCloseCreateForm}
                  disabled={submitting}
                  className="inline-flex items-center gap-2 rounded border border-border bg-background px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground transition hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-2 rounded border border-primary bg-primary px-3 py-2 text-xs font-semibold uppercase tracking-wide text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {submitting ? (
                    <>
                      <RefreshCcw className="h-4 w-4 animate-spin" />
                      Menyimpan...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4" />
                      Simpan
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {editOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="relative w-full max-w-xl rounded-lg border border-border bg-card p-5 shadow-lg">
            <button
              type="button"
              onClick={handleCloseEditForm}
              className="absolute right-4 top-4 rounded border border-border bg-background px-2 py-1 text-xs text-muted-foreground transition hover:border-primary hover:text-primary"
            >
              <X className="h-3.5 w-3.5" />
            </button>
            <h3 className="mb-4 text-base font-semibold text-foreground">Edit Client</h3>
            <form className="space-y-4" onSubmit={handleEditSubmit}>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <FormField label="Username" required>
                  <input
                    value={editForm.username}
                    onChange={(event) => handleEditInputChange("username", event.target.value)}
                    required
                    disabled={submitting}
                    className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                  />
                </FormField>
                <FormField label="IP Address">
                  <input
                    value={editForm.ipAddress}
                    onChange={(event) => handleEditInputChange("ipAddress", event.target.value)}
                    disabled={submitting}
                    className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                  />
                </FormField>
                <FormField label="Tipe">
                  <select
                    value={editForm.type}
                    onChange={(event) => handleEditInputChange("type", event.target.value)}
                    disabled={submitting}
                    className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                  >
                    <option value="pppoe">PPPoE</option>
                    <option value="static">Static</option>
                    <option value="dhcp">DHCP</option>
                  </select>
                </FormField>
                <FormField label="Status">
                  <select
                    value={editForm.status}
                    onChange={(event) => handleEditInputChange("status", event.target.value)}
                    disabled={submitting}
                    className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                  >
                    <option value="aktif">Aktif</option>
                    <option value="nonaktif">Nonaktif</option>
                  </select>
                </FormField>
                <FormField label="Profile">
                  <input
                    value={editForm.profile}
                    onChange={(event) => handleEditInputChange("profile", event.target.value)}
                    disabled={submitting}
                    className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                  />
                </FormField>
                <FormField label="Router">
                  <select
                    value={editForm.routerId}
                    onChange={(event) => handleEditInputChange("routerId", event.target.value)}
                    disabled={submitting}
                    className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                  >
                    <option value="">Tanpa Router</option>
                    {routers.map((router) => (
                      <option key={router.id} value={router.id}>
                        {router.name}
                      </option>
                    ))}
                  </select>
                </FormField>
              </div>
              <FormField label="Komentar">
                <textarea
                  value={editForm.comment}
                  onChange={(event) => handleEditInputChange("comment", event.target.value)}
                  rows={3}
                  disabled={submitting}
                  className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                />
              </FormField>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={handleCloseEditForm}
                  disabled={submitting}
                  className="inline-flex items-center gap-2 rounded border border-border bg-background px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground transition hover:border-primary hover:text-primary disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-2 rounded border border-primary bg-primary px-3 py-2 text-xs font-semibold uppercase tracking-wide text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {submitting ? (
                    <>
                      <RefreshCcw className="h-4 w-4 animate-spin" />
                      Menyimpan...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4" />
                      Simpan
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  )
}
function DashboardSection({
  selectedRouter,
  selectedRouterId,
  setSelectedRouterId,
  routers,
  cpuDisplay,
  memoryDisplay,
  networkDisplay,
  activeDisplay,
  systemResourceData,
  networkChartData,
  selectedSystem,
  setSelectedSystem,
  pendingPreview,
  refreshPendingPreview,
}: {
  selectedRouter: RouterMetric | null
  selectedRouterId: string | null
  setSelectedRouterId: (value: string) => void
  routers: RouterMetric[]
  cpuDisplay: string
  memoryDisplay: string
  networkDisplay: string
  activeDisplay: string
  systemResourceData: Array<{ time: string; cpu: number; memory: number }>
  networkChartData: Array<{ name: string; rx: number; tx: number }>
  selectedSystem: string | null
  setSelectedSystem: (value: string) => void
  pendingPreview: PendingItem[]
  refreshPendingPreview: () => void
}) {
  return (
    <>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Ringkasan Router</h2>
          <p className="text-xs text-muted-foreground">
            {selectedRouter ? `Diperbarui ${formatRelativeTime(selectedRouter.lastUpdatedAt)}` : "Menunggu data router dari WebSocket..."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label htmlFor="routerSelector" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Pilih Router
          </label>
          <select
            id="routerSelector"
            className="rounded border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none disabled:cursor-not-allowed"
            value={selectedRouterId ?? ""}
            onChange={(event) => setSelectedRouterId(event.target.value)}
            disabled={routers.length === 0}
          >
            {routers.map((router) => (
              <option key={router.id} value={router.id}>
                {router.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {selectedRouter ? (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            <KPICard label="CPU Usage" value={cpuDisplay} icon={<Cpu className="h-5 w-5" />} />
            <KPICard label="Memory" value={memoryDisplay} icon={<Database className="h-5 w-5" />} />
            <KPICard label="Network I/O" value={networkDisplay} icon={<Network className="h-5 w-5" />} />
            <KPICard label="Active Connections" value={activeDisplay} icon={<Activity className="h-5 w-5" />} />
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div className="rounded border border-border bg-card p-6">
              <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold">
                <Cpu className="h-5 w-5 text-primary" />
                System Resources
              </h3>
              {systemResourceData.length === 0 ? (
                <div className="flex h-[250px] items-center justify-center text-sm text-muted-foreground">Menunggu riwayat CPU dan memori...</div>
              ) : (
                <ResponsiveContainer width="100%" height={250}>
                  <AreaChart data={systemResourceData}>
                    <defs>
                      <linearGradient id="colorCpu" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(200, 100%, 50%)" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="hsl(200, 100%, 50%)" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="colorMemory" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(280, 100%, 50%)" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="hsl(280, 100%, 50%)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                    <XAxis dataKey="time" stroke="rgba(255,255,255,0.5)" tick={{ fontSize: 10 }} />
                    <YAxis stroke="rgba(255,255,255,0.5)" />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "rgba(12, 14, 39, 0.9)",
                        border: "1px solid rgba(0, 217, 255, 0.3)",
                      }}
                      formatter={(value: number, name: string) => [
                        formatMetricValue(Number(value), "%"),
                        name === "cpu" ? "CPU" : "Memori",
                      ]}
                    />
                    <Area type="monotone" dataKey="cpu" stroke="hsl(200, 100%, 50%)" fillOpacity={1} fill="url(#colorCpu)" />
                    <Area type="monotone" dataKey="memory" stroke="hsl(280, 100%, 50%)" fillOpacity={1} fill="url(#colorMemory)" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="rounded border border-border bg-card p-6">
              <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold">
                <Network className="h-5 w-5 text-primary" />
                Network Traffic
              </h3>
              {networkChartData.length === 0 ? (
                <p className="text-sm text-muted-foreground">Belum ada data traffic interface.</p>
              ) : (
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={networkChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                    <XAxis dataKey="name" stroke="rgba(255,255,255,0.5)" tick={{ fontSize: 10 }} />
                    <YAxis stroke="rgba(255,255,255,0.5)" />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "rgba(12, 14, 39, 0.9)",
                        border: "1px solid rgba(0, 217, 255, 0.3)",
                      }}
                      formatter={(value: number, name: string) => [
                        formatMetricValue(Number(value), "Mbps"),
                        name === "rx" ? "Download" : "Upload",
                      ]}
                    />
                    <Bar dataKey="rx" name="Download" fill="hsl(200, 100%, 60%)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="tx" name="Upload" fill="hsl(280, 100%, 60%)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>
        </>
      ) : (
        <div className="rounded border border-border bg-card p-6 text-sm text-muted-foreground">
          Menunggu data router dari WebSocket...
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* <div className="lg:col-span-2 rounded border border-border bg-card p-6">
          <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold">
            <Server className="h-5 w-5 text-primary" />
            System Status
          </h3>
          <div className="space-y-3">
            {systemStatus.map((system) => (
              <div
                key={system.name}
                onClick={() => setSelectedSystem(system.name)}
                className={`cursor-pointer rounded border p-4 transition-all ${
                  selectedSystem === system.name ? "border-primary bg-primary/10" : "border-border bg-secondary/30 hover:border-primary/50"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-3 w-3 rounded-full bg-green-400"></div>
                    <div>
                      <p className="text-sm font-medium">{system.name}</p>
                      <p className="text-xs text-muted-foreground">Uptime: {system.uptime}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs font-mono text-primary">{system.latency}</p>
                    <CheckCircle2 className="mt-1 h-4 w-4 text-green-400" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div> */}

        <div className="rounded border border-border bg-card p-6">
          <h3 className="mb-4 flex items-center gap-2 text-lg font-semibold">
            <AlertTriangle className="h-5 w-5 text-primary" />
            Pendingan Terbaru
          </h3>
          <div className="space-y-3">
            {pendingPreview.length === 0 ? (
              <p className="text-sm text-muted-foreground">Tidak ada pendingan dalam 24 jam terakhir.</p>
            ) : (
              pendingPreview.map((item) => (
                <div key={item.id} className="rounded border border-border bg-secondary/40 p-3">
                  <p className="text-xs font-semibold text-foreground">{item.customerName}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">{item.description}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {item.address} · {kabupatenDisplayName(item.kabupaten)}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">Ditambahkan: {formatWibTimestamp(item.createdAt)}</p>
                </div>
              ))
            )}
          </div>
          <button
            type="button"
            onClick={refreshPendingPreview}
            className="mt-4 inline-flex items-center gap-2 rounded border border-border bg-background px-3 py-1 text-xs text-muted-foreground transition hover:border-primary hover:text-primary"
          >
            <RefreshCcw className="h-3.5 w-3.5" />
            Segarkan
          </button>
        </div>
      </div>
    </>
  )
}

function PendingSection() {
  const kabupatenOptions = useMemo(
    () =>
      Object.entries(KABUPATEN_LABELS).map(([value, label]) => ({
        value,
        label,
      })),
    [],
  )

  const [items, setItems] = useState<PendingItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const [formData, setFormData] = useState({
    customerName: "",
    description: "",
    address: "",
    kabupaten: "",
  })

  const fetchPending = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await fetch("/api/pending")
      if (!response.ok) {
        throw new Error(`Server mengembalikan status ${response.status}`)
      }
      const payload: { status: string; items?: PendingItem[] } = await response.json()
      if (payload.status !== "ok" || !Array.isArray(payload.items)) {
        throw new Error("Format data pendingan tidak valid.")
      }
      setItems(payload.items)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan saat memuat data pendingan.")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetchPending()
  }, [fetchPending])

  const filteredItems = useMemo(() => {
    if (!searchTerm.trim()) {
      return items
    }
    const term = searchTerm.trim().toLowerCase()
    return items.filter((item) => {
      const values = [item.customerName, item.description, item.address, item.kabupaten, item.createdAt]
      return values.some((value) => value?.toLowerCase().includes(term))
    })
  }, [items, searchTerm])

  const openForm = () => {
    setFormData({
      customerName: "",
      description: "",
      address: "",
      kabupaten: "",
    })
    setFormOpen(true)
  }

  const closeForm = () => {
    setFormOpen(false)
    setSubmitting(false)
  }

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = event.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitting(true)
    setError(null)
    try {
      const response = await fetch("/api/pending", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName: formData.customerName.trim(),
          description: formData.description.trim(),
          address: formData.address.trim(),
          kabupaten: formData.kabupaten.trim(),
        }),
      })
      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        throw new Error(payload?.message ?? "Gagal menyimpan data pendingan.")
      }
      const payload: { status: string; items?: PendingItem[] } = await response.json()
      if (payload.status === "ok" && Array.isArray(payload.items)) {
        setItems(payload.items)
      }
      closeForm()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan saat menyimpan data pendingan.")
    } finally {
      setSubmitting(false)
    }
  }

  const handleDelete = async (pending: PendingItem) => {
    if (!window.confirm(`Hapus pendingan ${pending.customerName}?`)) {
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const response = await fetch(`/api/pending?id=${pending.id}`, { method: "DELETE" })
      if (!response.ok) {
        const payload = await response.json().catch(() => null)
        throw new Error(payload?.message ?? "Gagal menghapus pendingan.")
      }
      const payload: { status: string; items?: PendingItem[] } = await response.json()
      if (payload.status === "ok" && Array.isArray(payload.items)) {
        setItems(payload.items)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Terjadi kesalahan saat menghapus pendingan.")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="rounded border border-border bg-card p-5 space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Pendingan</h2>
          <p className="text-xs text-muted-foreground">Catatan gangguan yang otomatis hilang dalam 24 jam (WIB).</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Cari pelanggan, keterangan, alamat..."
            className="w-full max-w-xs rounded border border-border bg-background px-3 py-2 text-xs focus:border-primary focus:outline-none"
          />
          <button
            type="button"
            onClick={() => void fetchPending()}
            disabled={loading || submitting}
            className="inline-flex items-center gap-2 rounded border border-border bg-background px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground transition hover:border-primary hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCcw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Muat Ulang
          </button>
          <button
            type="button"
            onClick={openForm}
            className="inline-flex items-center gap-2 rounded border border-primary/60 bg-primary/10 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-primary transition hover:bg-primary/20"
          >
            <Plus className="h-4 w-4" />
            Tambah
          </button>
        </div>
      </div>

      {error ? <div className="rounded border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-400">❌ {error}</div> : null}

      {loading && items.length === 0 ? <p className="text-sm text-muted-foreground">Memuat data pendingan…</p> : null}

      {!loading && filteredItems.length === 0 && !error ? (
        <p className="text-sm text-muted-foreground">Tidak ada pendingan yang cocok dengan pencarian.</p>
      ) : null}

      {filteredItems.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="min-w-full text-xs">
            <thead>
              <tr className="bg-secondary/30 text-muted-foreground">
                <th className="border border-border px-3 py-2 text-left font-semibold">Nama Pelanggan</th>
                <th className="border border-border px-3 py-2 text-left font-semibold">Keterangan</th>
                <th className="border border-border px-3 py-2 text-left font-semibold">Alamat</th>
                <th className="border border-border px-3 py-2 text-left font-semibold">Kabupaten</th>
                <th className="border border-border px-3 py-2 text-left font-semibold">Ditambahkan (WIB)</th>
                <th className="border border-border px-3 py-2 text-left font-semibold">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((item) => (
                <tr key={item.id} className="odd:bg-card even:bg-background/80 text-foreground">
                  <td className="border border-border px-3 py-2 font-medium">{item.customerName}</td>
                  <td className="border border-border px-3 py-2 text-muted-foreground">{item.description}</td>
                  <td className="border border-border px-3 py-2 text-muted-foreground">{item.address}</td>
                  <td className="border border-border px-3 py-2 text-muted-foreground">
                    {kabupatenDisplayName(item.kabupaten)}
                  </td>
                  <td className="border border-border px-3 py-2 text-muted-foreground">{formatWibTimestamp(item.createdAt)}</td>
                  <td className="border border-border px-3 py-2">
                    <button
                      type="button"
                      onClick={() => void handleDelete(item)}
                      disabled={submitting}
                      className="inline-flex items-center gap-1 rounded border border-red-500/40 px-2 py-1 text-[11px] font-medium text-red-500 transition hover:border-red-500/60 hover:text-red-400 disabled:opacity-60"
                    >
                      <Trash2 className="h-3 w-3" />
                      Hapus
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {formOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="relative w-full max-w-lg rounded-lg border border-border bg-card p-5 shadow-xl">
            <button
              type="button"
              onClick={closeForm}
              className="absolute right-4 top-4 rounded border border-border bg-background px-2 py-1 text-xs text-muted-foreground transition hover:border-primary hover:text-primary"
            >
              <X className="h-3.5 w-3.5" />
            </button>
            <h3 className="mb-4 text-base font-semibold text-foreground">Tambah Pendingan</h3>
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="grid grid-cols-1 gap-3">
                <FormField label="Nama Pelanggan" required>
                  <input
                    name="customerName"
                    value={formData.customerName}
                    onChange={handleInputChange}
                    required
                    className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                  />
                </FormField>
                <FormField label="Keterangan" required>
                  <input
                    name="description"
                    value={formData.description}
                    onChange={handleInputChange}
                    required
                    className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                  />
                </FormField>
                <FormField label="Alamat" required>
                  <textarea
                    name="address"
                    value={formData.address}
                    onChange={handleInputChange}
                    required
                    rows={3}
                    className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                  />
                </FormField>
                <FormField label="Kabupaten" required>
                  <select
                    name="kabupaten"
                    value={formData.kabupaten}
                    onChange={handleInputChange}
                    required
                    className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                  >
                    <option value="">Pilih kabupaten</option>
                    {kabupatenOptions.map((kab) => (
                      <option key={kab.value} value={kab.value}>
                        {kab.label}
                      </option>
                    ))}
                  </select>
                </FormField>
              </div>
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={closeForm}
                  className="rounded border border-border bg-background px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground transition hover:border-primary hover:text-foreground"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-2 rounded border border-primary/60 bg-primary px-3 py-2 text-xs font-semibold uppercase tracking-wide text-primary-foreground transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {submitting ? (
                    <>
                      <RefreshCcw className="h-4 w-4 animate-spin" />
                      Menyimpan...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4" />
                      Simpan
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </section>
  )
}

function RouterMonitoringSection({
  routers,
  connectionState,
  lastError,
}: {
  routers: RouterMetric[]
  connectionState: RouterConnectionState
  lastError: string | null
}) {
  const statusColor =
    connectionState === "open" ? "bg-green-400" : connectionState === "connecting" ? "bg-yellow-400 animate-pulse" : "bg-red-400"
  const statusLabel =
    connectionState === "open" ? "terhubung" : connectionState === "connecting" ? "menghubungkan" : "terputus"
  const [expandedRouters, setExpandedRouters] = useState<Set<string>>(() => new Set())

  useEffect(() => {
    setExpandedRouters((prev) => {
      const allowed = new Set(routers.map((router) => router.id))
      const next = new Set<string>()
      prev.forEach((id) => {
        if (allowed.has(id)) {
          next.add(id)
        }
      })
      return next
    })
  }, [routers])

  const toggleRouter = (id: string) => {
    setExpandedRouters((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  return (
    <section className="rounded border border-border bg-card p-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold">Monitoring Router</h2>
          <p className="text-xs text-muted-foreground">Data realtime dari koneksi WebSocket</p>
        </div>
        <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground capitalize">
          <span className={`h-2.5 w-2.5 rounded-full ${statusColor}`}></span>
          {statusLabel}
        </div>
      </div>
      {lastError ? <p className="mt-3 text-xs text-red-400">{lastError}</p> : null}
      {routers.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">Menunggu data router dari WebSocket…</p>
      ) : (
        <div className="mt-5 grid grid-cols-1 gap-4 xl:grid-cols-2">
          {routers.map((router) => {
            const normalizedStatus = (router.status ?? "").trim().toLowerCase()
            const isRouterDown =
              normalizedStatus.includes("down") ||
              normalizedStatus.includes("offline") ||
              normalizedStatus.includes("error") ||
              normalizedStatus.includes("disconnect")
            const isRouterUp =
              normalizedStatus.includes("up") ||
              normalizedStatus.includes("online") ||
              normalizedStatus.includes("ok") ||
              normalizedStatus.includes("connected")

            const statusDisplay =
              router.status && router.status.trim().length > 0
                ? router.status
                : isRouterDown
                  ? "Down"
                  : isRouterUp
                    ? "Up"
                    : "Tidak diketahui"

            const cardClass = `rounded border bg-secondary/30 p-4 transition ${
              isRouterDown ? "border-red-500/60 ring-1 ring-red-500/30" : "border-border hover:border-primary/40"
            }`

            const interfaceOpen = expandedRouters.has(router.id)

            return (
              <article key={router.id} className={cardClass}>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => toggleRouter(router.id)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault()
                      toggleRouter(router.id)
                    }
                  }}
                  className="cursor-pointer select-none rounded border border-transparent p-2 transition hover:border-border hover:bg-background focus:outline-none"
                >
                  <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-base font-semibold text-foreground">{router.name}</h3>
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                            isRouterDown
                              ? "border-red-500/60 bg-red-500/10 text-red-400"
                              : isRouterUp
                                ? "border-green-500/60 bg-green-500/10 text-green-400"
                                : "border-amber-500/60 bg-amber-500/10 text-amber-400"
                          }`}
                        >
                          {statusDisplay}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">Diperbarui {formatRelativeTime(router.lastUpdatedAt)}</p>
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <RouterMetricItem label="Total PPPoE" value={formatMetricValue(router.total)} />
                    <RouterMetricItem label="PPPoE Aktif" value={formatMetricValue(router.active)} />
                    <RouterMetricItem label="CPU" value={formatMetricValue(router.cpu, typeof router.cpu === "number" ? "%" : undefined)} />
                    <RouterMetricItem
                      label="Memori"
                      value={formatMetricValue(router.memory, typeof router.memory === "number" ? "%" : undefined)}
                    />
                  </div>
                </div>

                <div className="mt-3">
                  <button
                    type="button"
                    onClick={() => toggleRouter(router.id)}
                    className="flex w-full items-center justify-between rounded border border-border bg-background px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground transition hover:border-primary hover:text-foreground"
                  >
                    Traffic Interface
                    <ChevronDown className={`h-4 w-4 transition-transform ${interfaceOpen ? "rotate-180" : ""}`} />
                  </button>
                  {router.interfaces.length === 0 ? (
                    <p className="mt-2 text-xs text-muted-foreground">Belum ada data interface.</p>
                  ) : interfaceOpen ? (
                    <div className="mt-2 space-y-2">
                      {router.interfaces.map((iface, index) => (
                        <div
                          key={`${router.id}-${iface.name}-${index}`}
                          className={`flex flex-col gap-1 rounded border px-3 py-2 text-xs sm:flex-row sm:items-center sm:justify-between ${
                            isRouterDown ? "border-red-500/40 bg-red-500/10 text-red-300" : "border-border/60 bg-background/60 text-muted-foreground"
                          }`}
                        >
                          <span className="text-sm font-medium text-foreground">{iface.name}</span>
                          <div className="flex flex-wrap items-center gap-3">
                            {iface.status ? <span>Status: {iface.status}</span> : null}
                            <span>Download: {formatMetricValue(iface.rx, iface.rxUnit ?? "Mbps")}</span>
                            <span>Upload: {formatMetricValue(iface.tx, iface.txUnit ?? "Mbps")}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}

function RouterMetricItem({ label, value, emphasize = false }: { label: string; value: string; emphasize?: boolean }) {
  return (
    <div
      className={`rounded border px-3 py-2 ${
        emphasize ? "border-primary/50 bg-primary/10 text-primary" : "border-border/60 bg-background/60 text-foreground"
      }`}
    >
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold">{value}</p>
    </div>
  )
}

function NavItem({ icon, label, active = false, onClick, isCollapsed }: { icon: React.ReactNode; label: string; active?: boolean; onClick?: () => void, isCollapsed?: boolean }) {
  return (
    <button
      type="button"
      className={`flex w-full items-center gap-3 rounded-lg px-4 py-2.5 text-sm font-medium transition ${
        active ? "border border-primary/50 bg-primary/20 text-primary" : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
      } ${isCollapsed ? 'justify-center' : ''}`}
      onClick={onClick}
      title={isCollapsed ? label : undefined}
    >
      {icon}
      {!isCollapsed && <span>{label}</span>}
    </button>
  )
}

function KPICard({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="rounded border border-border bg-card p-4">
      <div className="mb-3 flex items-start justify-between">
        <div className="rounded bg-primary/10 p-2 text-primary">{icon}</div>
      </div>
      <p className="mb-1 text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold text-foreground">{value}</p>
    </div>
  )
}

function FormField({ label, children, required = false }: { label: string; children: React.ReactNode; required?: boolean }) {
  return (
    <label className="flex flex-col gap-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      <span className="flex items-center gap-1">
        {label}
        {required ? <span className="text-red-400">*</span> : null}
      </span>
      {children}
    </label>
  )
}
