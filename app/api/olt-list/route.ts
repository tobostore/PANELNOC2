import { NextResponse } from "next/server"
import { mysqlPool } from "@/lib/db"
import type { RowDataPacket } from "mysql2/promise"

type OltRow = RowDataPacket & {
  id: number;
  name: string;
}

export async function GET() {
  try {
    // Query to get all OLT from olt_list table
    const [rows] = await mysqlPool.query<OltRow[]>(
      "SELECT id, name FROM olt_list ORDER BY name ASC"
    )

    if (!rows || !Array.isArray(rows)) {
      return NextResponse.json(
        {
          status: "error",
          message: "Data OLT tidak ditemukan"
        },
        { status: 404 }
      )
    }

    return NextResponse.json({
      status: "success",
      items: rows
    })

  } catch (error) {
    console.error("[olt-list-error]", error)
    return NextResponse.json(
      {
        status: "error",
        message: "Terjadi kesalahan saat mengambil data OLT"
      },
      { status: 500 }
    )
  }
}
