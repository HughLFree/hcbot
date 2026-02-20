/**
 * 模块职责：
 * 提供 SQLite 数据访问层（初始化、CRUD、检索、清理）。
 * 对上层暴露稳定函数接口，隐藏 SQL 细节与连接管理。
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import Database from 'better-sqlite3';
import { SERVER_CONFIG } from '../config.mjs';

const EMBEDDING_DIM = SERVER_CONFIG.embeddingDim;
const DATA_DIR = SERVER_CONFIG.dataDir;
const DB_PATH = path.join(DATA_DIR, SERVER_CONFIG.dbFilename);

fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

let vectorMode = 'none';

function tryLoadVectorExtension() {
  const extPath = process.env.SQLITE_VECTOR_EXTENSION_PATH;
  if (!extPath) return;

  try {
    db.loadExtension(extPath);
    vectorMode = 'vec0';
    console.log(`[db] loaded vector extension: ${extPath}`);
  } catch (error) {
    console.warn('[db] failed to load vector extension, fallback to JSON vectors:', error.message);
  }
}

function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS rooms (
      room_id       TEXT PRIMARY KEY,
      created_at    INTEGER NOT NULL DEFAULT (unixepoch()),
      last_seen_at  INTEGER NOT NULL DEFAULT (unixepoch()),
      room_summary  TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS users (
      trip_code         TEXT PRIMARY KEY,
      last_display_name TEXT NOT NULL DEFAULT '',
      created_at        INTEGER NOT NULL DEFAULT (unixepoch()),
      last_seen_at      INTEGER NOT NULL DEFAULT (unixepoch())
    );

    CREATE TABLE IF NOT EXISTS user_profile (
      trip_code     TEXT PRIMARY KEY,
      profile_json  TEXT NOT NULL DEFAULT '{}',
      updated_at    INTEGER NOT NULL DEFAULT (unixepoch()),
      FOREIGN KEY(trip_code) REFERENCES users(trip_code)
    );

    CREATE TABLE IF NOT EXISTS memories (
      memory_id     TEXT PRIMARY KEY,
      room_id       TEXT NOT NULL,
      trip_code     TEXT,
      text          TEXT NOT NULL,
      tags_json     TEXT NOT NULL DEFAULT '[]',
      importance    INTEGER NOT NULL DEFAULT 5,
      ttl_days      INTEGER,
      created_at    INTEGER NOT NULL DEFAULT (unixepoch()),
      last_used_at  INTEGER NOT NULL DEFAULT (unixepoch()),
      FOREIGN KEY(trip_code) REFERENCES users(trip_code),
      FOREIGN KEY(room_id) REFERENCES rooms(room_id)
    );

    CREATE INDEX IF NOT EXISTS idx_memories_room_trip_created
      ON memories(room_id, trip_code, created_at);

    CREATE INDEX IF NOT EXISTS idx_memories_room_created
      ON memories(room_id, created_at);
  `);

  if (vectorMode === 'vec0') {
    try {
      db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS memory_vec
        USING vec0(
          memory_id TEXT PRIMARY KEY,
          embedding FLOAT[${EMBEDDING_DIM}]
        );
      `);
      return;
    } catch (error) {
      console.warn('[db] vec0 table init failed, fallback to JSON vectors:', error.message);
      vectorMode = 'none';
    }
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS memory_vec (
      memory_id      TEXT PRIMARY KEY,
      embedding_json TEXT NOT NULL,
      FOREIGN KEY(memory_id) REFERENCES memories(memory_id) ON DELETE CASCADE
    );
  `);
}

tryLoadVectorExtension();
initSchema();

const upsertRoomStmt = db.prepare(`
  INSERT INTO rooms (room_id, last_seen_at)
  VALUES (?, ?)
  ON CONFLICT(room_id) DO UPDATE SET
    last_seen_at = excluded.last_seen_at
`);

const upsertUserStmt = db.prepare(`
  INSERT INTO users (trip_code, last_display_name, last_seen_at)
  VALUES (?, ?, ?)
  ON CONFLICT(trip_code) DO UPDATE SET
    last_display_name = excluded.last_display_name,
    last_seen_at = excluded.last_seen_at
`);

const upsertProfileStmt = db.prepare(`
  INSERT INTO user_profile (trip_code, profile_json, updated_at)
  VALUES (?, ?, ?)
  ON CONFLICT(trip_code) DO UPDATE SET
    profile_json = excluded.profile_json,
    updated_at = excluded.updated_at
`);

const getProfileStmt = db.prepare(`
  SELECT profile_json
  FROM user_profile
  WHERE trip_code = ?
`);

const insertMemoryStmt = db.prepare(`
  INSERT INTO memories (
    memory_id, room_id, trip_code, text, tags_json, importance, ttl_days, created_at, last_used_at
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

const upsertMemoryVecJsonStmt = db.prepare(`
  INSERT INTO memory_vec (memory_id, embedding_json)
  VALUES (?, ?)
  ON CONFLICT(memory_id) DO UPDATE SET
    embedding_json = excluded.embedding_json
`);

const deleteExpiredMemoriesStmt = db.prepare(`
  DELETE FROM memories
  WHERE ttl_days IS NOT NULL
    AND created_at < (unixepoch() - ttl_days * 86400)
`);

const deleteOrphanVectorsStmt = db.prepare(`
  DELETE FROM memory_vec
  WHERE memory_id NOT IN (SELECT memory_id FROM memories)
`);

const ingestIdentityTx = db.transaction((roomId, tripCode, displayName, seenAt) => {
  upsertRoomStmt.run(roomId, seenAt);
  upsertUserStmt.run(tripCode, displayName, seenAt);
});

const insertMemoryTx = db.transaction((payload) => {
  const now = Number(payload.created_at || Math.floor(Date.now() / 1000));

  upsertRoomStmt.run(payload.room_id, now);
  if (payload.trip_code) {
    upsertUserStmt.run(payload.trip_code, payload.display_name || '', now);
  }

  insertMemoryStmt.run(
    payload.memory_id || crypto.randomUUID(),
    payload.room_id,
    payload.trip_code || null,
    payload.text,
    payload.tags_json,
    payload.importance,
    payload.ttl_days,
    now,
    now
  );

  if (Array.isArray(payload.embedding) && payload.embedding.length > 0) {
    if (vectorMode === 'vec0') {
      db.prepare(`
        INSERT OR REPLACE INTO memory_vec (memory_id, embedding)
        VALUES (?, ?)
      `).run(payload.memory_id, JSON.stringify(payload.embedding));
    } else {
      upsertMemoryVecJsonStmt.run(payload.memory_id, JSON.stringify(payload.embedding));
    }
  }
});

export function getDbInfo() {
  return {
    dbPath: DB_PATH,
    vectorMode: vectorMode === 'vec0' ? 'vec0' : 'json_fallback',
    embeddingDim: EMBEDDING_DIM,
  };
}

/**
 * 写入身份心跳（rooms/users）。
 * @param params.roomId 频道 ID
 * @param params.tripCode 用户 trip_code
 * @param params.displayName 用户显示名
 * @param params.seenAt 最后出现时间（秒）
 */
export function ingestIdentity({ roomId, tripCode, displayName, seenAt }) {
  ingestIdentityTx(roomId, tripCode, displayName, seenAt);
}

/**
 * Upsert 房间记录并更新 last_seen_at。
 */
export function upsertRoom(roomId, lastSeenAt) {
  upsertRoomStmt.run(roomId, lastSeenAt);
}

/**
 * Upsert 用户记录并更新显示名/last_seen_at。
 */
export function upsertUser(tripCode, displayName, lastSeenAt) {
  upsertUserStmt.run(tripCode, displayName, lastSeenAt);
}

/**
 * Upsert 用户画像 JSON。
 */
export function upsertProfile(tripCode, profileObj, updatedAt) {
  upsertProfileStmt.run(tripCode, JSON.stringify(profileObj), updatedAt);
}

/**
 * 按 trip_code 读取用户画像。
 * @returns 画像对象；不存在或 JSON 损坏时返回 null
 */
export function getProfileByTrip(tripCode) {
  const row = getProfileStmt.get(tripCode);
  if (!row?.profile_json) return null;
  try {
    return JSON.parse(row.profile_json);
  } catch {
    return null;
  }
}

/**
 * 插入一条记忆记录（含可选向量）。
 */
export function insertMemory(payload) {
  insertMemoryTx(payload);
}

/**
 * 向量检索记忆并回表过滤（群记忆 + 指定用户记忆）。
 * @returns null 表示当前非向量模式；[]/数组为检索结果
 */
export function searchMemories({ roomId, tripCode, queryEmbedding, topK = 20 }) {
  if (vectorMode !== 'vec0') return null;

  const vectorRows = db.prepare(`
    SELECT memory_id, distance
    FROM memory_vec
    WHERE embedding MATCH ?
    ORDER BY distance
    LIMIT ?
  `).all(JSON.stringify(queryEmbedding), topK);

  if (!vectorRows.length) return [];

  const ids = vectorRows.map((item) => item.memory_id);
  const idPlaceholders = ids.map(() => '?').join(', ');
  const distanceById = new Map(vectorRows.map((item) => [item.memory_id, item.distance]));

  const args = [String(roomId)];
  let tripFilterSql = 'AND m.trip_code IS NULL';
  if (tripCode) {
    tripFilterSql = 'AND (m.trip_code IS NULL OR m.trip_code = ?)';
    args.push(String(tripCode));
  }

  const rows = db.prepare(`
    SELECT m.*
    FROM memories m
    WHERE m.room_id = ?
      ${tripFilterSql}
      AND m.memory_id IN (${idPlaceholders})
  `).all(...args, ...ids);

  const rowsById = new Map(rows.map((row) => [row.memory_id, row]));
  return vectorRows
    .map((row) => rowsById.get(row.memory_id))
    .filter(Boolean)
    .map((row) => ({
      ...row,
      distance: distanceById.get(row.memory_id),
    }));
}

/**
 * 清理过期记忆与孤儿向量。
 * @returns { removedMemories, removedVectors }
 */
export function cleanupTtlAndVectors() {
  const tx = db.transaction(() => {
    const removedMemories = deleteExpiredMemoriesStmt.run().changes;
    const removedVectors = deleteOrphanVectorsStmt.run().changes;
    return { removedMemories, removedVectors };
  });
  return tx();
}

/**
 * 当前是否启用向量检索模式（vec0）。
 */
export function isVectorModeEnabled() {
  return vectorMode === 'vec0';
}
