import { NextResponse } from "next/server"
import { read, utils } from "xlsx"

import {
  REMOTE_ACCESS_POINT_API,
  buildRemotePayload,
  fetchRemoteAccessPoints,
  handleRemoteError,
} from "../utils"

const REQUIRED_HEADERS = [
  "nama_bts",
  "nama_ap",
  "router_ap",
  "interface_ap",
  "ip_ap",
  "perangkat_ap",
  "login_ap",
  "password_ap",
  "freq_ap",
  "cw_ap",
  "mac_ap",
  "status_ap",
]

const OPTIONAL_HEADERS = ["security_ap", "phrase_ap"]

type ImportRow = {
  nama_bts: string
  nama_ap: string
  router_ap: string
  interface_ap: string
  ip_ap: string
  perangkat_ap: string
  login_ap: string
  password_ap: string
  freq_ap: string
  cw_ap: string
  mac_ap: string
  status_ap: string
  security_ap: string | null
  phrase_ap: string | null
}

function normalizeHeader(value: unknown): string {
  if (typeof value !== "string") {
    return ""
  }
  return value.trim().toLowerCase()
}

function extractRow(raw: Record<string, unknown>, rowIndex: number): ImportRow {
  const normalizedEntries = Object.entries(raw).map(([key, value]) => [normalizeHeader(key), value] as const)
  const bucket = new Map<string, unknown>(normalizedEntries)

  const missingHeaders = REQUIRED_HEADERS.filter((key) => {
    const stored = bucket.get(key)
    if (stored === undefined || stored === null) {
      return true
    }
    if (typeof stored === "string" && stored.trim() === "") {
      return true
    }
    return false
  })

  if (missingHeaders.length > 0) {
    throw new Error(`Baris ${rowIndex}: kolom ${missingHeaders.join(", ")} wajib diisi.`)
  }

  const pick = (key: string, optional = false): string => {
    const value = bucket.get(key)
    if (value === undefined || value === null) {
      return optional ? "" : ""
    }
    if (typeof value === "number" || typeof value === "boolean") {
      return String(value)
    }
    if (typeof value === "string") {
      return value
    }
    return optional ? "" : ""
  }

  const toNullable = (key: string) => {
    const value = pick(key, true).trim()
    return value === "" ? null : value
  }

  return {
    nama_bts: pick("nama_bts").trim(),
    nama_ap: pick("nama_ap").trim(),
    router_ap: pick("router_ap").trim(),
    interface_ap: pick("interface_ap").trim(),
    ip_ap: pick("ip_ap").trim(),
    perangkat_ap: pick("perangkat_ap").trim(),
    login_ap: pick("login_ap").trim(),
    password_ap: pick("password_ap").trim(),
    freq_ap: pick("freq_ap").trim(),
    cw_ap: pick("cw_ap").trim(),
    mac_ap: pick("mac_ap").trim(),
    status_ap: pick("status_ap").trim(),
    security_ap: toNullable("security_ap"),
    phrase_ap: toNullable("phrase_ap"),
  }
}

function normalizeStatus(value: string, rowIndex: number): string {
  const normalized = value.trim().toLowerCase()
  if (normalized === "aktif") {
    return "Aktif"
  }
  if (normalized === "dismantle") {
    return "Dismantle"
  }
  throw new Error(`Baris ${rowIndex}: status_ap harus bernilai "Aktif" atau "Dismantle".`)
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData()
    const file = formData.get("file")
    if (!(file instanceof Blob)) {
      throw new Error("File XLSX tidak ditemukan.")
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const workbook = read(buffer, { type: "buffer" })
    const sheetName = workbook.SheetNames[0]
    if (!sheetName) {
      throw new Error("Berkas tidak memiliki sheet.")
    }
    const sheet = workbook.Sheets[sheetName]
    const rows = utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" })
    if (!rows.length) {
      throw new Error("Berkas tidak memiliki data.")
    }

    // Validate headers
    const headerRow = utils.sheet_to_json<string[]>(sheet, { header: 1 })[0] ?? []
    const normalizedHeaders = headerRow.map(normalizeHeader)
    const missingHeaders = REQUIRED_HEADERS.filter((key) => !normalizedHeaders.includes(key))
    if (missingHeaders.length > 0) {
      throw new Error(`Header berikut wajib ada di file: ${missingHeaders.join(", ")}`)
    }

    const invalidHeaders = normalizedHeaders.filter(
      (header) => header && !REQUIRED_HEADERS.includes(header) && !OPTIONAL_HEADERS.includes(header),
    )

    const successes: number[] = []
    const failures: Array<{ index: number; message: string }> = []

    for (let index = 0; index < rows.length; index += 1) {
      const rowNumber = index + 2 // considering header row as 1
      try {
        const extracted = extractRow(rows[index], rowNumber)
        const response = await fetch(REMOTE_ACCESS_POINT_API, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            buildRemotePayload({
              ssid: extracted.nama_ap,
              btsName: extracted.nama_bts,
              routerName: extracted.router_ap,
              interfaceName: extracted.interface_ap,
              ipAddress: extracted.ip_ap,
              device: extracted.perangkat_ap,
              username: extracted.login_ap,
              password: extracted.password_ap,
              security: extracted.security_ap,
              phraseKey: extracted.phrase_ap,
              frequency: extracted.freq_ap,
              channelWidth: extracted.cw_ap,
              macAddress: extracted.mac_ap,
              status: normalizeStatus(extracted.status_ap, rowNumber),
            }),
          ),
        })

        if (!response.ok) {
          await handleRemoteError(response)
        }

        successes.push(rowNumber)
      } catch (error) {
        const message = error instanceof Error ? error.message : "Kesalahan tidak dikenal."
        failures.push({ index: rowNumber, message })
      }
    }

    if (successes.length === 0) {
      throw new Error("Seluruh baris gagal diimpor. Periksa format dan coba lagi.")
    }

    const accessPoints = await fetchRemoteAccessPoints()
    return NextResponse.json(
      {
        status: "ok",
        message: `Import selesai. Berhasil: ${successes.length} baris, Gagal: ${failures.length} baris.`,
        invalidHeaders: invalidHeaders.length > 0 ? invalidHeaders : undefined,
        failedRows: failures.length > 0 ? failures : undefined,
        accessPoints,
      },
      { status: failures.length > 0 ? 207 : 201 },
    )
  } catch (error) {
    console.error("[api/access-points/import] failed to import data", error)
    return NextResponse.json(
      {
        status: "error",
        message: error instanceof Error ? error.message : "Gagal mengimpor file access point.",
      },
      { status: 400 },
    )
  }
}