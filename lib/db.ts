import crypto from "crypto";
import type { PoolOptions } from "mysql2/promise";
import mysql from "mysql2/promise";

type RowDataPacket = mysql.RowDataPacket;

type GlobalWithPool = typeof globalThis & {
  __mysqlPool?: mysql.Pool;
};

const config: PoolOptions = {
  host: "localhost",
  database: "router_db",
  user: "Harr",
  password: "gmdp@2025",
  charset: "utf8mb4",
  waitForConnections: true,
  connectionLimit: 10,
  namedPlaceholders: true,
};

const globalForPool = globalThis as GlobalWithPool;

export const mysqlPool =
  globalForPool.__mysqlPool ??
  mysql.createPool({
    ...config,
    // Ensure we always get plain objects back
    decimalNumbers: true,
  });

if (!globalForPool.__mysqlPool) {
  globalForPool.__mysqlPool = mysqlPool;
}

export type AccessPointRow = RowDataPacket & {
  id: number;
  ssid: string | null;
  bts_name: string | null;
  ip_address: string | null;
  device: string | null;
  username: string | null;
  password: string | null;
  security: string | null;
  phrase_key: string | null;
  frequency: string | null;
  channel_width: string | null;
  mac_address: string | null;
  router_id: number | null;
  router_name: string | null;
};

export async function fetchAccessPoints(): Promise<AccessPointRow[]> {
  const [rows] = await mysqlPool.query<AccessPointRow[]>(
    `SELECT
      ap.id,
      ap.ssid,
      ap.bts_name,
      ap.ip_address,
      ap.device,
      ap.username,
      ap.password,
      ap.security,
      ap.phrase_key,
      ap.frequency,
      ap.channel_width,
      ap.mac_address,
      ap.router_id,
      r.name AS router_name
    FROM access_points ap
    LEFT JOIN routers r ON r.id = ap.router_id
    ORDER BY
      (ap.bts_name IS NULL OR ap.bts_name = ''),
      ap.bts_name ASC,
      ap.ssid ASC`
  );

  return rows;
}

export type PendingItemRow = RowDataPacket & {
  id: number;
  customer_name: string;
  description: string;
  address: string;
  kabupaten: string;
  created_at: Date;
};

const WIB_TIMEZONE = "Asia/Jakarta";
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

function formatDateToMySQL(timezone: string, date = new Date()): string {
  const formatter = new Intl.DateTimeFormat("sv-SE", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(date).reduce<Record<string, string>>((acc, part) => {
    if (part.type !== "literal") {
      acc[part.type] = part.value.padStart(part.type === "day" || part.type === "month" || part.type === "hour" || part.type === "minute" || part.type === "second" ? 2 : 0, "0");
    }
    return acc;
  }, {});

  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour ?? "00"}:${parts.minute ?? "00"}:${parts.second ?? "00"}`;
}

export async function fetchPendingItems(): Promise<PendingItemRow[]> {
  const now = new Date();
  const thresholdDate = new Date(now.getTime() - ONE_DAY_MS);
  const threshold = formatDateToMySQL(WIB_TIMEZONE, thresholdDate);

  await mysqlPool.query("DELETE FROM pending_list WHERE created_at < ?", [threshold]);

  const [rows] = await mysqlPool.query<PendingItemRow[]>(
    `SELECT id, customer_name, description, address, kabupaten, created_at
     FROM pending_list
     WHERE created_at >= ?
     ORDER BY created_at DESC`,
    [threshold],
  );

  return rows;
}

type PendingPayload = {
  customerName: string;
  description: string;
  address: string;
  kabupaten: string;
};

export async function createPendingItem(payload: PendingPayload): Promise<number> {
  const createdAt = formatDateToMySQL(WIB_TIMEZONE);
  const [result] = await mysqlPool.query<mysql.ResultSetHeader>(
    `INSERT INTO pending_list (customer_name, description, address, kabupaten, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [payload.customerName, payload.description, payload.address, payload.kabupaten, createdAt],
  );

  return result.insertId;
}

export async function deletePendingItem(id: number): Promise<void> {
  await mysqlPool.query("DELETE FROM pending_list WHERE id = ?", [id]);
}

type AdminUserRow = RowDataPacket & {
  id: number;
  username: string;
  password: string | null;
};

export async function verifyAdminCredentials(username: string, password: string): Promise<{ id: number; username: string } | null> {
  const [rows] = await mysqlPool.query<AdminUserRow[]>(
    "SELECT id, username, password FROM admin_users WHERE username = ? LIMIT 1",
    [username],
  );

  if (!rows.length) {
    return null;
  }

  const stored = rows[0].password ?? "";
  if (!stored) {
    return null;
  }

  const candidates: string[] = [password];

  if (/^[a-f0-9]{64}$/i.test(stored)) {
    candidates.push(hashWithAlgorithm('sha256', password));
  }
  if (/^[a-f0-9]{32}$/i.test(stored)) {
    candidates.push(hashWithAlgorithm('md5', password));
  }

  const isMatch = candidates.some((candidate) => timingSafeCompare(stored, candidate));
  if (!isMatch) {
    return null;
  }

  return { id: rows[0].id, username: rows[0].username };
}

export type ClientRow = RowDataPacket & {
  id: number;
  username: string;
  ip_address: string | null;
  type: string | null;
  status: string | null;
  profile: string | null;
  profile_asli: string | null;
  comment: string | null;
  router_id: number | null;
  router_name: string | null;
};

export type FetchClientsOptions = {
  page?: number;
  pageSize?: number;
  search?: string;
  routerId?: number | null;
};

export type FetchClientsResponse = {
  items: ClientRow[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
  search: string;
  routerId: number | null;
};

const DEFAULT_CLIENT_PAGE_SIZE = 21;
const MAX_CLIENT_PAGE_SIZE = 200;

export async function fetchClients(options: FetchClientsOptions = {}): Promise<FetchClientsResponse> {
  const rawPage = Number.isFinite(options.page) ? Number(options.page) : 1;
  const rawPageSize = Number.isFinite(options.pageSize) ? Number(options.pageSize) : DEFAULT_CLIENT_PAGE_SIZE;
  const pageSize = Math.min(Math.max(Math.floor(rawPageSize) || DEFAULT_CLIENT_PAGE_SIZE, 1), MAX_CLIENT_PAGE_SIZE);
  const searchTerm = (options.search ?? "").trim();
  const rawRouterId = Number.isFinite(options.routerId) ? Number(options.routerId) : null;
  const routerId = rawRouterId && rawRouterId > 0 ? rawRouterId : null;

  const likeTerm = searchTerm ? `%${searchTerm.replace(/\s+/g, "%")}%` : null;
  const searchParams: string[] = likeTerm
    ? [likeTerm, likeTerm, likeTerm, likeTerm, likeTerm, likeTerm, likeTerm]
    : [];

  const whereParts: string[] = [];
  const whereParams: Array<string | number> = [];

  if (likeTerm) {
    whereParts.push(`(
      u.username LIKE ?
      OR u.ip_address LIKE ?
      OR u.type LIKE ?
      OR u.status LIKE ?
      OR u.profile LIKE ?
      OR u.comment LIKE ?
      OR r.name LIKE ?
    )`);
    whereParams.push(...searchParams);
  }

  if (routerId !== null) {
    whereParts.push("u.router_id = ?");
    whereParams.push(routerId);
  }

  const whereClause = whereParts.length > 0 ? `WHERE ${whereParts.join(" AND ")}` : "";

  const [countRows] = await mysqlPool.query<Array<{ total: number }> & RowDataPacket[]>(
    `SELECT COUNT(*) AS total
     FROM users u
     LEFT JOIN routers r ON r.id = u.router_id
     ${whereClause}`,
    whereParams,
  );

  const totalItems = countRows[0]?.total ?? 0;
  const totalPages = totalItems === 0 ? 0 : Math.ceil(totalItems / pageSize);
  const safePage = totalPages === 0 ? 1 : Math.min(Math.max(Math.floor(rawPage) || 1, 1), totalPages);
  const offset = (safePage - 1) * pageSize;

  const [rows] = await mysqlPool.query<ClientRow[]>(
    `SELECT
      u.id,
      u.username,
      u.ip_address,
      u.type,
      u.status,
      u.profile,
      u.comment,
      u.router_id,
      u.profile_asli,
       r.name AS router_name
    FROM users u
    LEFT JOIN routers r ON r.id = u.router_id
    ${whereClause}
    ORDER BY u.updated_at DESC, u.username ASC
    LIMIT ?
    OFFSET ?`,
    [...whereParams, pageSize, offset],
  );

  return {
    items: rows,
    page: safePage,
    pageSize,
    totalItems,
    totalPages,
    search: searchTerm,
    routerId,
  };
}

export async function updateClientStatus(id: number, status: "aktif" | "nonaktif"): Promise<void> {
  const [rows] = await mysqlPool.query<(RowDataPacket & { type: string | null; profile: string | null; profile_asli: string | null })[]>(
    `SELECT type, profile, profile_asli FROM users WHERE id = ? LIMIT 1`,
    [id],
  );

  if (!rows.length) {
    throw new Error("Client tidak ditemukan.");
  }

  const row = rows[0];
  const currentProfile = row.profile ?? null;
  const storedOriginalProfile = row.profile_asli?.trim() ? row.profile_asli : null;
  const type = row.type?.trim().toLowerCase() ?? null;

  if (status === "nonaktif") {
    const originalProfile = storedOriginalProfile ?? currentProfile ?? null;
    await mysqlPool.query(
      `UPDATE users
       SET
         status = 'nonaktif',
         profile_asli = COALESCE(NULLIF(profile_asli, ''), ?),
         profile = 'isolir',
         manual_override = 1,
         updated_at = NOW()
       WHERE id = ?`,
      [originalProfile, id],
    );
  } else {
    const nextProfile =
      type === "pppoe"
        ? storedOriginalProfile ?? "normal"
        : "normal";

    await mysqlPool.query(
      `UPDATE users
       SET
         status = 'aktif',
         profile = ?,
         manual_override = 1,
         updated_at = NOW()
       WHERE id = ?`,
      [nextProfile, id],
    );
  }
}

export type CreateClientPayload = {
  username: string;
  ipAddress?: string | null;
  type?: string | null;
  status?: "aktif" | "nonaktif";
  profile?: string | null;
  comment?: string | null;
  routerId?: number | null;
};

export async function createClient(payload: CreateClientPayload): Promise<number> {
  const username = payload.username?.trim() ?? "";
  if (!username) {
    throw new Error("Username wajib diisi.");
  }

  const ipAddress = payload.ipAddress?.trim() || null;
  const rawType = payload.type?.trim() || null;
  const type = rawType ? rawType.toLowerCase() : null;
  const status: "aktif" | "nonaktif" = payload.status === "nonaktif" ? "nonaktif" : "aktif";
  const comment = payload.comment?.trim() || null;

  const numericRouterId =
    typeof payload.routerId === "number" && Number.isFinite(payload.routerId) && payload.routerId > 0
      ? Math.floor(payload.routerId)
      : null;

  const baseProfile = payload.profile?.trim() || (type === "pppoe" ? "normal" : null);
  const profile = status === "nonaktif" ? "isolir" : baseProfile;
  const profileAsli = baseProfile;

  const [result] = await mysqlPool.query<mysql.ResultSetHeader>(
    `INSERT INTO users (
      username,
      ip_address,
      type,
      status,
      profile,
      profile_asli,
      comment,
      router_id,
      manual_override,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, NOW(), NOW())`,
    [username, ipAddress, type, status, profile, profileAsli, comment, numericRouterId],
  );

  return result.insertId;
}

export type CreateAktivasiClientPayload = {
  namaPelanggan: string;
  namaLayanan: string;
  kapasitasLayanan: string;
  vlanId: string;
  namaMetro: string;
  siteMetro: string;
  kapasitasMetro: string;
  ipAddress: string;
  ipGateway: string;
  routerGateway: string;
  createdBy: string;
};

export async function createAktivasiClient(payload: CreateAktivasiClientPayload): Promise<number> {
  const [result] = await mysqlPool.query<mysql.ResultSetHeader>(
    `INSERT INTO aktivasi_clients (
      nama_pelanggan,
      nama_layanan,
      kapasitas_layanan,
      vlan_id,
      nama_metro,
      site_metro,
      kapasitas_metro,
      ip_address,
      ip_gateway,
      router_gateway,
      created_by,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
    [
      payload.namaPelanggan.trim(),
      payload.namaLayanan.trim(),
      payload.kapasitasLayanan.trim(),
      payload.vlanId.trim(),
      payload.namaMetro.trim(),
      payload.siteMetro.trim(),
      payload.kapasitasMetro.trim(),
      payload.ipAddress.trim(),
      payload.ipGateway.trim(),
      payload.routerGateway.trim(),
      payload.createdBy.trim(),
    ],
  );

  return result.insertId;
}

export async function updateClient(id: number, payload: UpdateClientPayload): Promise<void> {
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error("ID client tidak valid.");
  }

  const [rows] = await mysqlPool.query<
    Array<
      RowDataPacket & {
        username: string;
        ip_address: string | null;
        type: string | null;
        status: string | null;
        profile: string | null;
        profile_asli: string | null;
        comment: string | null;
        router_id: number | null;
      }
    >
  >(
    `SELECT username, ip_address, type, status, profile, profile_asli, comment, router_id
     FROM users
     WHERE id = ?
     LIMIT 1`,
    [id],
  );

  if (!rows.length) {
    throw new Error("Client tidak ditemukan.");
  }

  const existing = rows[0];

  const usernameRaw = payload.username !== undefined ? payload.username : existing.username;
  const username = usernameRaw?.trim();
  if (!username) {
    throw new Error("Username wajib diisi.");
  }

  const ipRaw = payload.ipAddress !== undefined ? payload.ipAddress : existing.ip_address;
  const ipAddress = ipRaw ? ipRaw.trim() : null;

  const typeRaw = payload.type !== undefined ? payload.type : existing.type;
  const type = typeRaw ? typeRaw.trim().toLowerCase() || null : null;

  const commentRaw = payload.comment !== undefined ? payload.comment : existing.comment;
  const comment = commentRaw ? commentRaw.trim() : null;

  const routerValue = payload.routerId !== undefined ? payload.routerId : existing.router_id;
  const routerId =
    typeof routerValue === "number" && Number.isFinite(routerValue) && routerValue > 0
      ? Math.floor(routerValue)
      : null;

  const statusInput = payload.status ?? (existing.status === "nonaktif" ? "nonaktif" : "aktif");
  const status: "aktif" | "nonaktif" = statusInput === "nonaktif" ? "nonaktif" : "aktif";

  const profileInputRaw = payload.profile !== undefined ? payload.profile : null;
  const profileInput = profileInputRaw ? profileInputRaw.trim() : null;

  const existingProfile = existing.profile?.trim() || null;
  const existingProfileAsli = existing.profile_asli?.trim() || null;

  let profile: string | null = existingProfile;
  let profileAsli: string | null = existingProfileAsli;

  if (status === "nonaktif") {
    const originalProfile =
      profileInput ??
      profileAsli ??
      existingProfile ??
      (type === "pppoe" ? "normal" : null);
    profileAsli = originalProfile;
    profile = "isolir";
  } else {
    const baseProfile =
      profileInput ??
      profileAsli ??
      (existingProfile !== "isolir" ? existingProfile : null) ??
      (type === "pppoe" ? "normal" : null);
    profileAsli = baseProfile;
    profile = baseProfile;
  }

  await mysqlPool.query(
    `UPDATE users
     SET
       username = ?,
       ip_address = ?,
       type = ?,
       status = ?,
       profile = ?,
       profile_asli = ?,
       comment = ?,
       router_id = ?,
       manual_override = 1,
       updated_at = NOW()
     WHERE id = ?`,
    [username, ipAddress, type, status, profile, profileAsli, comment, routerId, id],
  );
}

export async function deleteClient(id: number): Promise<void> {
  if (!Number.isFinite(id) || id <= 0) {
    throw new Error("ID client tidak valid.");
  }

  const [result] = await mysqlPool.query<mysql.ResultSetHeader>("DELETE FROM users WHERE id = ?", [id]);
  if (result.affectedRows === 0) {
    throw new Error("Client tidak ditemukan.");
  }
}


function timingSafeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a || "")
  const bufB = Buffer.from(b || "")
  if (bufA.length === bufB.length) {
    return crypto.timingSafeEqual(bufA, bufB)
  }
  const len = Math.max(bufA.length, bufB.length)
  const paddedA = Buffer.alloc(len)
  const paddedB = Buffer.alloc(len)
  bufA.copy(paddedA)
  bufB.copy(paddedB)
  return crypto.timingSafeEqual(paddedA, paddedB) && a === b
}

function hashWithAlgorithm(algorithm: string, value: string): string {
  return crypto.createHash(algorithm).update(value).digest("hex")
}

export type RouterRow = RowDataPacket & {
  id: number;
  name: string;
};

export async function fetchRouters(): Promise<RouterRow[]> {
  const [rows] = await mysqlPool.query<RouterRow[]>(
    "SELECT id, name FROM routers ORDER BY name ASC",
  );
  return rows;
}

type AccessPointPayload = {
  ssid: string;
  btsName: string;
  ipAddress: string | null;
  device: string | null;
  username: string | null;
  password: string | null;
  security: string | null;
  phraseKey: string | null;
  frequency: string | null;
  channelWidth: string | null;
  macAddress: string | null;
  routerId: number | null;
};

export async function createAccessPoint(payload: AccessPointPayload): Promise<number> {
  const [result] = await mysqlPool.query<mysql.ResultSetHeader>(
    `INSERT INTO access_points (
      ssid,
      bts_name,
      ip_address,
      device,
      username,
      password,
      security,
      phrase_key,
      frequency,
      channel_width,
      mac_address,
      router_id,
      created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
    [
      payload.ssid,
      payload.btsName,
      payload.ipAddress,
      payload.device,
      payload.username,
      payload.password,
      payload.security,
      payload.phraseKey,
      payload.frequency,
      payload.channelWidth,
      payload.macAddress,
      payload.routerId,
    ],
  )

  return result.insertId
}

export async function updateAccessPoint(id: number, payload: AccessPointPayload): Promise<void> {
  await mysqlPool.query(
    `UPDATE access_points
     SET ssid = ?, bts_name = ?, ip_address = ?, device = ?, username = ?, password = ?, security = ?, phrase_key = ?, frequency = ?, channel_width = ?, mac_address = ?, router_id = ?
     WHERE id = ?`,
    [
      payload.ssid,
      payload.btsName,
      payload.ipAddress,
      payload.device,
      payload.username,
      payload.password,
      payload.security,
      payload.phraseKey,
      payload.frequency,
      payload.channelWidth,
      payload.macAddress,
      payload.routerId,
      id,
    ],
  )
}

export async function deleteAccessPoint(id: number): Promise<void> {
  await mysqlPool.query("DELETE FROM access_points WHERE id = ?", [id])
}
