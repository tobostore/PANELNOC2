import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import type { RowDataPacket } from "mysql2/promise";

type RouterRow = RowDataPacket & {
  id: number;
  name: string;
}

export async function GET() {
  try {
    const [rows] = await mysqlPool.query<RouterRow[]>(
      "SELECT id, name FROM routers ORDER BY name ASC"
    );
    
    return NextResponse.json({
      status: "ok",
      routers: rows
    });
  } catch (error) {
    console.error('[routers] Error fetching routers:', error);
    return NextResponse.json(
      {
        status: "error",
        message: "Gagal mengambil data router dari database",
        routers: []
      },
      { status: 500 }
    );
  }
}
