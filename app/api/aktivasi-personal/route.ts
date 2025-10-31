import { NextResponse } from "next/server";
import { mysqlPool } from "@/lib/db";
import type { RowDataPacket } from "mysql2/promise";

type OltRow = RowDataPacket & {
  id: number;
  name: string;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  
  // Log incoming parameters for debugging
  console.log('[aktivasi-personal] Incoming params:', Object.fromEntries(searchParams.entries()));
  
  const isUncfg = searchParams.get('uncfg') === 'true';
  const media = searchParams.get('media') || 'gpon';
  const oltParam = searchParams.get('olt');
  const oltName = searchParams.get('olt_name');
  const sn = searchParams.get('sn');
  const mac = searchParams.get('mac');
  
  // Build params for external API
  const externalParams = new URLSearchParams();
  
  // If we have numeric olt ID, fetch the OLT name from database
  let finalOltName = oltName;
  let detectedMedia = media; // Use media from query params if provided
  
  if (oltParam && !oltName) {
    try {
      const [rows] = await mysqlPool.query<OltRow[]>(
        "SELECT name FROM olt_list WHERE id = ?",
        [oltParam]
      );
      if (rows && rows.length > 0) {
        finalOltName = rows[0].name;
      }
    } catch (error) {
      console.error('[aktivasi-personal] Error fetching OLT name:', error);
    }
  }
  
  // Auto-detect media type from parameters (prioritize actual data over media param)
  if (mac && !sn) {
    // If MAC is present but no SN, it's EPON
    detectedMedia = 'epon';
  } else if (sn && !mac) {
    // If SN is present but no MAC, it's GPON
    detectedMedia = 'gpon';
  } else if (!detectedMedia) {
    // Fallback: try to detect from media param or default to gpon
    detectedMedia = media || 'gpon';
  }
  
  console.log('[aktivasi-personal] Detected media type:', detectedMedia);
  
  // Determine the endpoint based on media type and operation
  let endpoint = 'cfg';
  if (isUncfg) {
    // Use cfggpon or cfgepon for uncfg requests
    endpoint = detectedMedia === 'epon' ? 'cfgepon' : 'cfggpon';
    externalParams.set('uncfg', '1');
    if (finalOltName) externalParams.set('olt_name', finalOltName);
    if (sn) externalParams.set('sn', sn);
    if (mac) externalParams.set('mac', mac);
  } else {
    // For activation, use cfggpon or cfgepon based on detected media
    endpoint = detectedMedia === 'epon' ? 'cfgepon' : 'cfggpon';
    
    // Pass all activation parameters
    if (finalOltName) externalParams.set('olt_name', finalOltName);
    
    // Add parameters from searchParams (except olt and media)
    searchParams.forEach((value, key) => {
      if (key !== 'olt' && key !== 'media' && !externalParams.has(key)) {
        externalParams.set(key, value);
      }
    });
    
    // For EPON, make sure we only send MAC (not SN)
    if (detectedMedia === 'epon') {
      externalParams.delete('sn');
    }
    // For GPON, make sure we only send SN (not MAC)
    if (detectedMedia === 'gpon') {
      externalParams.delete('mac');
    }
  }
  
  const externalApiUrl = `http://10.20.25.8:4004/${endpoint}?${externalParams.toString()}`;
  console.log('[aktivasi-personal] Calling external API:', externalApiUrl);

  try {
    // The AbortSignal.timeout() is used to prevent the request from hanging indefinitely.
    const response = await fetch(externalApiUrl, {
      signal: AbortSignal.timeout(8000), // 8-second timeout
    });

    const responseText = await response.text();
    console.log('[aktivasi-personal] External API response status:', response.status);

    if (!response.ok) {
      console.error(`External API Error: Status ${response.status}, Body: ${responseText}`);
      
      // Return more helpful error message
      let errorMessage = `Gagal menghubungi API eksternal (Status ${response.status})`;
      try {
        const errorJson = JSON.parse(responseText);
        errorMessage = errorJson.error || errorJson.message || errorMessage;
      } catch {
        errorMessage = responseText || errorMessage;
      }
      
      return NextResponse.json(
        {
          status: "error",
          message: errorMessage,
          details: responseText
        },
        { status: response.status }
      );
    }

    return new NextResponse(responseText, {
      status: 200,
      headers: {
        "Content-Type": "text/plain",
      },
    });
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') {
      console.error('[aktivasi-personal] Timeout error');
      return NextResponse.json(
        {
          status: "error",
          message: "Request ke API eksternal timeout setelah 8 detik."
        },
        { status: 504 }
      );
    }
    console.error("[aktivasi-personal] Proxy API error:", error);
    return NextResponse.json(
      {
        status: "error",
        message: "Terjadi kesalahan pada server proxy.",
        details: error instanceof Error ? error.message : String(error)
      },
      { status: 500 }
    );
  }
}