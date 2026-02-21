import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { SERVER_CONFIG } from '../config.mjs';

/**
 * 模块职责：
 * - 初始化 SQLite 连接
 * - 初始化/迁移基础 schema
 * - 提供数据库运行态信息（路径、向量模式）
 */
const EMBEDDING_DIM = SERVER_CONFIG.embeddingDim;
const DATA_DIR = SERVER_CONFIG.dataDir;
const DB_PATH = path.join(DATA_DIR, SERVER_CONFIG.dbFilename);

fs.mkdirSync(DATA_DIR, { recursive: true });

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

let vectorMode = 'none';
let vectorExtensionTried = false;
let dbInitialized = false;

/**
 * 尝试加载 sqlite 向量扩展。
 * 加载失败时自动回退到 JSON 向量模式。
 */
function tryLoadVectorExtension() {
  if (vectorExtensionTried) return;
  vectorExtensionTried = true;

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

/**
 * 初始化业务表与索引。
 * 在 vec0 可用时创建向量虚表，否则创建 JSON 向量表。
 */
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
      trip_code         TEXT PRIMARY KEY,
      profile_json      TEXT NOT NULL DEFAULT '{}',
      memory_digest_json TEXT NOT NULL DEFAULT '{}',
      updated_at        INTEGER NOT NULL DEFAULT (unixepoch()),
      FOREIGN KEY(trip_code) REFERENCES users(trip_code)
    );

    CREATE TABLE IF NOT EXISTS memories (
      memory_id     TEXT PRIMARY KEY,
      room_id       TEXT,
      trip_code     TEXT,
      text          TEXT NOT NULL,
      tags_json     TEXT NOT NULL DEFAULT '[]',
      importance    INTEGER NOT NULL DEFAULT 3 CHECK(importance BETWEEN 1 AND 10),
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

/**
 * 兼容旧库：当 user_profile 缺少 memory_digest_json 时补列。
 */
function migrateUserProfileSchemaIfNeeded() {
  const columns = db.prepare('PRAGMA table_info(user_profile)').all();
  const hasMemoryDigestColumn = columns.some((column) => column.name === 'memory_digest_json');
  if (hasMemoryDigestColumn) return;

  db.exec(`
    ALTER TABLE user_profile
    ADD COLUMN memory_digest_json TEXT NOT NULL DEFAULT '{}';
  `);
}

/**
 * 兼容旧库：重建 memories 表以满足最新约束。
 * 变更点：
 * - room_id 允许为空
 * - importance 约束升级为 1..10
 */
function migrateMemoriesSchemaIfNeeded() {
  const memoriesTableSqlRow = db.prepare(`
    SELECT sql
    FROM sqlite_master
    WHERE type = 'table' AND name = 'memories'
  `).get();
  const memoriesTableSql = String(memoriesTableSqlRow?.sql || '').toUpperCase();
  const hasImportanceRangeOneToTen = memoriesTableSql.includes('CHECK(IMPORTANCE BETWEEN 1 AND 10)');

  const roomColumn = db.prepare('PRAGMA table_info(memories)').all()
    .find((column) => column.name === 'room_id');
  const roomIsNullable = Boolean(roomColumn) && roomColumn.notnull === 0;
  if (!roomColumn || (roomIsNullable && hasImportanceRangeOneToTen)) return;

  const tx = db.transaction(() => {
    if (vectorMode !== 'vec0') {
      db.exec(`
        CREATE TABLE IF NOT EXISTS memory_vec_backup (
          memory_id      TEXT PRIMARY KEY,
          embedding_json TEXT NOT NULL
        );
        DELETE FROM memory_vec_backup;
        INSERT INTO memory_vec_backup (memory_id, embedding_json)
        SELECT memory_id, embedding_json
        FROM memory_vec;
        DROP TABLE IF EXISTS memory_vec;
      `);
    }

    db.exec(`
      DROP INDEX IF EXISTS idx_memories_room_trip_created;
      DROP INDEX IF EXISTS idx_memories_room_created;

      ALTER TABLE memories RENAME TO memories_legacy;

      CREATE TABLE memories (
        memory_id     TEXT PRIMARY KEY,
        room_id       TEXT,
        trip_code     TEXT,
        text          TEXT NOT NULL,
        tags_json     TEXT NOT NULL DEFAULT '[]',
        importance    INTEGER NOT NULL DEFAULT 3 CHECK(importance BETWEEN 1 AND 10),
        ttl_days      INTEGER,
        created_at    INTEGER NOT NULL DEFAULT (unixepoch()),
        last_used_at  INTEGER NOT NULL DEFAULT (unixepoch()),
        FOREIGN KEY(trip_code) REFERENCES users(trip_code),
        FOREIGN KEY(room_id) REFERENCES rooms(room_id)
      );

      INSERT INTO memories (
        memory_id, room_id, trip_code, text, tags_json, importance, ttl_days, created_at, last_used_at
      )
      SELECT
        memory_id,
        room_id,
        trip_code,
        text,
        tags_json,
        CASE
          WHEN importance < 1 THEN 1
          WHEN importance > 10 THEN 10
          ELSE importance
        END,
        ttl_days,
        created_at,
        last_used_at
      FROM memories_legacy;

      DROP TABLE memories_legacy;

      CREATE INDEX IF NOT EXISTS idx_memories_room_trip_created
        ON memories(room_id, trip_code, created_at);

      CREATE INDEX IF NOT EXISTS idx_memories_room_created
        ON memories(room_id, created_at);
    `);

    if (vectorMode !== 'vec0') {
      db.exec(`
        CREATE TABLE IF NOT EXISTS memory_vec (
          memory_id      TEXT PRIMARY KEY,
          embedding_json TEXT NOT NULL,
          FOREIGN KEY(memory_id) REFERENCES memories(memory_id) ON DELETE CASCADE
        );

        INSERT INTO memory_vec (memory_id, embedding_json)
        SELECT b.memory_id, b.embedding_json
        FROM memory_vec_backup b
        INNER JOIN memories m ON m.memory_id = b.memory_id
        ON CONFLICT(memory_id) DO UPDATE SET
          embedding_json = excluded.embedding_json;

        DROP TABLE IF EXISTS memory_vec_backup;
      `);
    }
  });

  const fkEnabled = Boolean(db.pragma('foreign_keys', { simple: true }));
  try {
    db.pragma('foreign_keys = OFF');
    tx();
  } finally {
    db.pragma(`foreign_keys = ${fkEnabled ? 'ON' : 'OFF'}`);
  }
}

/**
 * 显式初始化数据库：
 * - 加载向量扩展（可选）
 * - 初始化 schema
 * - 执行兼容迁移
 * 该函数幂等，可重复调用。
 */
export function initDb() {
  if (dbInitialized) return getDbInfo();
  tryLoadVectorExtension();
  initSchema();
  migrateUserProfileSchemaIfNeeded();
  migrateMemoriesSchemaIfNeeded();
  dbInitialized = true;
  return getDbInfo();
}

/**
 * 返回数据库基础运行信息，供健康检查与日志输出。
 */
export function getDbInfo() {
  return {
    dbPath: DB_PATH,
    vectorMode: vectorMode === 'vec0' ? 'vec0' : 'json_fallback',
    embeddingDim: EMBEDDING_DIM,
    initialized: dbInitialized,
  };
}

/**
 * 当前是否启用 vec0 向量检索模式。
 */
export function isVectorModeEnabled() {
  return vectorMode === 'vec0';
}

/**
 * 当前数据库是否已完成初始化。
 */
export function isDbInitialized() {
  return dbInitialized;
}
