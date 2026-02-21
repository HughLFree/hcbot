import { db, initDb } from './core.mjs';

/**
 * 模块职责：
 * 维护 rooms/users/user_profile 相关的读写逻辑。
 */
let upsertRoomStmt;
let upsertUserStmt;
let upsertProfileStmt;
let getProfileStmt;
let upsertMemoryDigestStmt;
let ingestIdentityTx;
let prepared = false;

/**
 * 延迟准备 SQL 语句。
 * 只有首次真正访问 profiles 仓储时才触发 DB 初始化和 prepare。
 */
function ensurePreparedStatements() {
  if (prepared) return;
  initDb();

  upsertRoomStmt = db.prepare(`
    INSERT INTO rooms (room_id, last_seen_at)
    VALUES (?, ?)
    ON CONFLICT(room_id) DO UPDATE SET
      last_seen_at = excluded.last_seen_at
  `);

  upsertUserStmt = db.prepare(`
    INSERT INTO users (trip_code, last_display_name, last_seen_at)
    VALUES (?, ?, ?)
    ON CONFLICT(trip_code) DO UPDATE SET
      last_display_name = excluded.last_display_name,
      last_seen_at = excluded.last_seen_at
  `);

  upsertProfileStmt = db.prepare(`
    INSERT INTO user_profile (trip_code, profile_json, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(trip_code) DO UPDATE SET
      profile_json = excluded.profile_json,
      updated_at = excluded.updated_at
  `);

  getProfileStmt = db.prepare(`
    SELECT profile_json, memory_digest_json
    FROM user_profile
    WHERE trip_code = ?
  `);

  upsertMemoryDigestStmt = db.prepare(`
    INSERT INTO user_profile (trip_code, memory_digest_json, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(trip_code) DO UPDATE SET
      memory_digest_json = excluded.memory_digest_json,
      updated_at = excluded.updated_at
  `);

  ingestIdentityTx = db.transaction((roomId, tripCode, displayName, seenAt) => {
    upsertRoomStmt.run(roomId, seenAt);
    upsertUserStmt.run(tripCode, displayName, seenAt);
  });

  prepared = true;
}

/**
 * 写入身份心跳（房间 + 用户），用于维护 last_seen_at。
 */
export function ingestIdentity({ roomId, tripCode, displayName, seenAt }) {
  ensurePreparedStatements();
  ingestIdentityTx(roomId, tripCode, displayName, seenAt);
}

/**
 * Upsert 房间并刷新 last_seen_at。
 */
export function upsertRoom(roomId, lastSeenAt) {
  ensurePreparedStatements();
  upsertRoomStmt.run(roomId, lastSeenAt);
}

/**
 * Upsert 用户并刷新昵称/last_seen_at。
 */
export function upsertUser(tripCode, displayName, lastSeenAt) {
  ensurePreparedStatements();
  upsertUserStmt.run(tripCode, displayName, lastSeenAt);
}

/**
 * Upsert 用户画像 JSON。
 */
export function upsertProfile(tripCode, profileObj, updatedAt) {
  ensurePreparedStatements();
  upsertProfileStmt.run(tripCode, JSON.stringify(profileObj), updatedAt);
}

/**
 * 按 trip 读取用户画像。
 * JSON 损坏或不存在时返回 null。
 */
export function getProfileByTrip(tripCode) {
  ensurePreparedStatements();
  const row = getProfileStmt.get(tripCode);
  if (!row?.profile_json) return null;
  try {
    return JSON.parse(row.profile_json);
  } catch {
    return null;
  }
}

/**
 * 按 trip 读取用户记忆梗概。
 * JSON 损坏或不存在时返回 null。
 */
export function getMemoryDigestByTrip(tripCode) {
  ensurePreparedStatements();
  const row = getProfileStmt.get(tripCode);
  if (!row?.memory_digest_json) return null;
  try {
    return JSON.parse(row.memory_digest_json);
  } catch {
    return null;
  }
}

/**
 * Upsert 用户记忆梗概 JSON。
 */
export function upsertMemoryDigest(tripCode, digestObj, updatedAt) {
  ensurePreparedStatements();
  upsertMemoryDigestStmt.run(tripCode, JSON.stringify(digestObj || {}), updatedAt);
}
