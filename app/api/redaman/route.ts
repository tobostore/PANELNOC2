import { NextResponse } from "next/server"
import { mysqlPool } from "@/lib/db"
import type { RowDataPacket } from "mysql2/promise"

type UserRow = RowDataPacket & {
  password: string;
}

export async function POST(request: Request) {
  try {
    const { username } = await request.json()

    if (!username) {
      return NextResponse.json(
        {
          status: "error",
          message: "Username PPPoE harus diisi"
        },
        { status: 400 }
      )
    }

    // Get password from pppoe_users table
    const [rows] = await mysqlPool.query<UserRow[]>(
      "SELECT password FROM pppoe_users WHERE username = ?",
      [username]
    )

    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json(
        {
          status: "error", 
          message: "User PPPoE tidak ditemukan"
        },
        { status: 404 }  
      )
    }

    const password = rows[0].password

    // Call redaman API
    const response = await fetch(`http://10.20.25.8:4004/sn?olt_name=ZTE_TANGERANG&redaman=${password}`)

    if (!response.ok) {
      throw new Error("Gagal mengecek redaman")
    }

    const result = await response.json()

    return NextResponse.json({
      status: "success",
      data: result
    })

  } catch (error) {
    console.error("[redaman-error]", error)
    return NextResponse.json(
      {
        status: "error",
        message: "Terjadi kesalahan saat mengecek redaman"
      },
      { status: 500 }
    )
  }
}
