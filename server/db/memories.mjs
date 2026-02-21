import crypto from 'node:crypto';
import { SERVER_CONFIG } from '../config.mjs';
import { db, initDb, isVectorModeEnabled } from './core.mjs';
import { upsertRoom, upsertUser } from './profiles.mjs';

/**
 * 模块职责：
 * 维护 memories 与 memory_vec 的查询、写入、检索和清理。
 */
let listMemoriesByTripStmt;
let listMemoriesForDigestStmt;
let insertMemoryStmt;
let upsertMemoryVecJsonStmt;
let upsertMemoryVecVec0Stmt;
let deleteExpiredMemoriesStmt;
let deleteOrphanVectorsStmt;
let deleteLowImportanceMemoriesStmt;
let insertMemoryTx;
let prepared = false;

/**
 * 延迟准备 SQL 语句与事务。
 * 避免模块 import 阶段触发表结构依赖与迁移副作用。
 */
function ensurePreparedStatements() {
  if (prepared) return;
  initDb();

  listMemoriesByTripStmt = db.prepare(`
    SELECT
      memory_id,
      room_id,
      trip_code,
      text,
      tags_json,
      importance,
      ttl_days,
      created_at,
      last_used_at
    FROM memories
    WHERE trip_code = ?
      AND importance >= ?
      AND (ttl_days IS NULL OR created_at >= (unixepoch() - ttl_days * 86400))
    ORDER BY importance DESC, last_used_at DESC, created_at DESC
    LIMIT ?
  `);

  listMemoriesForDigestStmt = db.prepare(`
    SELECT
      memory_id,
      room_id,
      trip_code,
      text,
      tags_json,
      importance,
      ttl_days,
      created_at,
      last_used_at
    FROM memories
    WHERE trip_code IS NOT NULL
      AND importance >= ?
      AND (ttl_days IS NULL OR created_at >= (unixepoch() - ttl_days * 86400))
    ORDER BY trip_code ASC, importance DESC, last_used_at DESC, created_at DESC
  `);

  insertMemoryStmt = db.prepare(`
    INSERT INTO memories (
      memory_id, room_id, trip_code, text, tags_json, importance, ttl_days, created_at, last_used_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  upsertMemoryVecJsonStmt = db.prepare(`
    INSERT INTO memory_vec (memory_id, embedding_json)
    VALUES (?, ?)
    ON CONFLICT(memory_id) DO UPDATE SET
      embedding_json = excluded.embedding_json
  `);

  if (isVectorModeEnabled()) {
    upsertMemoryVecVec0Stmt = db.prepare(`
      INSERT OR REPLACE INTO memory_vec (memory_id, embedding)
      VALUES (?, ?)
    `);
  } else {
    upsertMemoryVecVec0Stmt = null;
  }

  deleteExpiredMemoriesStmt = db.prepare(`
    DELETE FROM memories
    WHERE ttl_days IS NOT NULL
      AND created_at < (unixepoch() - ttl_days * 86400)
  `);

  deleteOrphanVectorsStmt = db.prepare(`
    DELETE FROM memory_vec
    WHERE memory_id NOT IN (SELECT memory_id FROM memories)
  `);

  deleteLowImportanceMemoriesStmt = db.prepare(`
    DELETE FROM memories
    WHERE trip_code IS NOT NULL
      AND importance < ?
  `);

  insertMemoryTx = db.transaction((payload) => {
    const now = Number(payload.created_at || Math.floor(Date.now() / 1000));
    const memoryId = payload.memory_id || crypto.randomUUID();

    if (payload.room_id) {
      upsertRoom(payload.room_id, now);
    }
    if (payload.trip_code) {
      upsertUser(payload.trip_code, payload.display_name || '', now);
    }

    insertMemoryStmt.run(
      memoryId,
      payload.room_id || null,
      payload.trip_code || null,
      payload.text,
      payload.tags_json,
      payload.importance,
      payload.ttl_days,
      now,
      now
    );

    if (Array.isArray(payload.embedding) && payload.embedding.length > 0) {
      if (isVectorModeEnabled()) {
        upsertMemoryVecVec0Stmt.run(memoryId, JSON.stringify(payload.embedding));
      } else {
        upsertMemoryVecJsonStmt.run(memoryId, JSON.stringify(payload.embedding));
      }
    }
  });

  prepared = true;
}

/**
 * 解析 tags_json，兜底为 string[]。
 */
function parseTagsJson(tagsJson) {
  if (typeof tagsJson !== 'string') return [];
  try {
    const parsed = JSON.parse(tagsJson);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) => typeof item === 'string' && item.trim().length > 0);
  } catch {
    return [];
  }
}

/**
 * 按 trip 读取记忆（带重要度阈值与数量限制）。
 */
export function listMemoriesByTrip({ tripCode, minImportance = 1, limit = 10 }) {
  ensurePreparedStatements();
  if (!tripCode) return [];

  const boundedMinImportance = Math.max(
    SERVER_CONFIG.memory.minImportance,
    Math.min(SERVER_CONFIG.memory.maxImportance, Math.floor(Number(minImportance) || SERVER_CONFIG.memory.minImportance))
  );
  const boundedLimit = Math.max(1, Math.min(100, Math.floor(Number(limit) || 10)));

  const rows = listMemoriesByTripStmt.all(String(tripCode), boundedMinImportance, boundedLimit);
  return rows.map((row) => ({
    ...row,
    tags: parseTagsJson(row.tags_json),
  }));
}

/**
 * 读取记忆梗概输入数据，并按 trip 分组。
 */
export function listMemoriesGroupedByTripForDigest({ minImportance = 1, maxItemsPerUser = 60 } = {}) {
  ensurePreparedStatements();
  const boundedMinImportance = Math.max(
    SERVER_CONFIG.memory.minImportance,
    Math.min(SERVER_CONFIG.memory.maxImportance, Math.floor(Number(minImportance) || SERVER_CONFIG.memory.minImportance))
  );
  const boundedMaxItemsPerUser = Math.max(1, Math.min(200, Math.floor(Number(maxItemsPerUser) || 60)));

  const rows = listMemoriesForDigestStmt.all(boundedMinImportance);
  const grouped = new Map();
  for (const row of rows) {
    const tripCode = row.trip_code;
    if (!tripCode) continue;
    const bucket = grouped.get(tripCode) || [];
    if (bucket.length >= boundedMaxItemsPerUser) continue;
    bucket.push({
      ...row,
      tags: parseTagsJson(row.tags_json),
    });
    grouped.set(tripCode, bucket);
  }
  return grouped;
}

/**
 * 插入一条记忆记录（含可选 embedding）。
 */
export function insertMemory(payload) {
  ensurePreparedStatements();
  insertMemoryTx(payload);
}

/**
 * 向量检索记忆（仅 vec0 模式可用）。
 * 返回 null 表示当前非向量模式。
 */
export function searchMemories({ roomId, tripCode, queryEmbedding, topK = 20 }) {
  ensurePreparedStatements();
  if (!isVectorModeEnabled()) return null;

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
 * 清理过期记忆 + 孤儿向量。
 */
export function cleanupTtlAndVectors() {
  ensurePreparedStatements();
  const tx = db.transaction(() => {
    const removedMemories = deleteExpiredMemoriesStmt.run().changes;
    const removedVectors = deleteOrphanVectorsStmt.run().changes;
    return { removedMemories, removedVectors };
  });
  return tx();
}

/**
 * 按 importance 批量清理低价值记忆，并同步清理孤儿向量。
 */
export function pruneLowImportanceMemories(minKeepImportance) {
  ensurePreparedStatements();
  const boundedMinKeepImportance = Math.max(
    SERVER_CONFIG.memory.minImportance,
    Math.min(SERVER_CONFIG.memory.maxImportance, Math.floor(Number(minKeepImportance) || SERVER_CONFIG.memory.minImportance))
  );

  const tx = db.transaction(() => {
    const removedMemories = deleteLowImportanceMemoriesStmt.run(boundedMinKeepImportance).changes;
    const removedVectors = deleteOrphanVectorsStmt.run().changes;
    return { removedMemories, removedVectors };
  });
  return tx();
}
