/**
 * ========================
 * Module: businessRoutes
 * Layer: Backend Route
 * Responsibility:
 * - 注册核心业务 API（reply/profile/memory/maintenance）
 * - 处理请求参数校验、调用 service/db、返回 JSON 结果
 * ========================
 */
import crypto from 'node:crypto';
import { SERVER_CONFIG } from '../config.mjs';
import {
  cleanupTtlAndVectors,
  getDbInfo,
  getProfileByTrip,
  ingestIdentity,
  insertMemory,
  isVectorModeEnabled,
  searchMemories,
  upsertProfile,
  upsertRoom,
  upsertUser,
} from '../db/index.mjs';
import { extractProfileWithDeepSeek, mergeProfile, parseSetProfileInput } from '../services/profileExtractor.mjs';
import { generateDeepSeekReply, isReplyServiceReady } from '../services/replyService.mjs';

/**
 * [Function]
 * Name: registerBusinessRoutes
 * Purpose: 挂载所有主体业务路由。
 * Input: app
 * Output: void
 */
export function registerBusinessRoutes(app) {
  /**
   * [Function]
   * Name: GET /api/health
   * Purpose: 返回服务健康状态与数据库基础信息。
   */
  app.get('/api/health', (_req, res) => {
    const info = getDbInfo();
    res.json({
      ok: true,
      db_path: info.dbPath,
      vector_mode: info.vectorMode,
      embedding_dim: info.embeddingDim,
    });
  });

  /**
   * [Function]
   * Name: POST /api/reply/deepseek
   * Purpose: 调用模型服务生成回复文本。
   */
  app.post('/api/reply/deepseek', async (req, res) => {
    try {
      if (!isReplyServiceReady()) {
        res.status(500).json({ ok: false, error: 'DEEPSEEK_API_KEY is missing on API server' });
        return;
      }

      const text = await generateDeepSeekReply({
        history: req.body?.history,
        personality: req.body?.personality,
        targetMessage: req.body?.targetMessage,
        targetSender: req.body?.targetSender,
        profileContext: req.body?.profileContext,
      });

      res.json({ ok: true, text });
    } catch (error) {
      res.status(500).json({
        ok: false,
        error: error instanceof Error ? error.message : 'unknown error',
      });
    }
  });

  /**
   * [Function]
   * Name: POST /api/ingest-message
   * Purpose: 接收聊天消息中的身份信息并落库。
   */
  app.post('/api/ingest-message', (req, res) => {
    const { room_id: roomId, trip_code: tripCode, display_name: displayName } = req.body || {};
    if (!tripCode) {
      res.json({ ok: true, skipped: true, reason: 'missing_trip_code' });
      return;
    }
    if (!roomId || !displayName) {
      res.status(400).json({ ok: false, error: 'room_id and display_name are required when trip_code exists' });
      return;
    }
    const seenAtRaw = Number(req.body?.seen_at);
    const seenAt = Number.isFinite(seenAtRaw) ? Math.floor(seenAtRaw) : Math.floor(Date.now() / 1000);
    ingestIdentity({
      roomId: String(roomId),
      tripCode: String(tripCode),
      displayName: String(displayName),
      seenAt,
    });
    res.json({ ok: true, skipped: false });
  });

  /**
   * [Function]
   * Name: POST /api/profile/upsert
   * Purpose: 直接写入/覆盖指定 trip 的结构化画像。
   */
  app.post('/api/profile/upsert', (req, res) => {
    const { trip_code: tripCode, profile_json: profileJson } = req.body || {};
    if (!tripCode) {
      res.status(400).json({ ok: false, error: 'trip_code is required' });
      return;
    }
    const now = Math.floor(Date.now() / 1000);
    const profile = typeof profileJson === 'string' ? JSON.parse(profileJson || '{}') : (profileJson || {});
    upsertUser(String(tripCode), '', now);
    upsertProfile(String(tripCode), profile, now);
    res.json({ ok: true, updated: true, profile_json: profile });
  });

  /**
   * [Function]
   * Name: POST /api/profile/from-message
   * Purpose: 从 setprofile 消息中抽取并合并用户画像。
   */
  app.post('/api/profile/from-message', async (req, res) => {
    try {
      const { room_id: roomId, trip_code: tripCode, display_name: displayName, message_text: messageText } = req.body || {};
      if (!tripCode) {
        res.json({ ok: true, updated: false, skipped: true, reason: 'missing_trip_code' });
        return;
      }
      if (!displayName || typeof displayName !== 'string') {
        res.status(400).json({ ok: false, updated: false, error: 'display_name is required' });
        return;
      }
      if (!messageText || typeof messageText !== 'string') {
        res.status(400).json({ ok: false, updated: false, error: 'message_text is required' });
        return;
      }

      const parsed = parseSetProfileInput(messageText);
      if (!parsed.matched) {
        res.json({ ok: true, updated: false, skipped: true, reason: 'not_setprofile_command' });
        return;
      }
      if (!parsed.content) {
        res.json({ ok: true, updated: false, skipped: true, reason: 'empty_profile_content' });
        return;
      }
      if (parsed.content.length > SERVER_CONFIG.profile.maxInputChars) {
        res.json({
          ok: true,
          updated: false,
          skipped: true,
          reason: 'profile_content_too_long',
          max_chars: SERVER_CONFIG.profile.maxInputChars,
        });
        return;
      }

      const now = Math.floor(Date.now() / 1000);
      if (roomId) upsertRoom(String(roomId), now);
      upsertUser(String(tripCode), String(displayName), now);

      const extractedProfile = await extractProfileWithDeepSeek(parsed.content);
      const oldProfile = getProfileByTrip(String(tripCode)) || {};
      const mergedProfile = mergeProfile(oldProfile, extractedProfile, String(displayName), now);
      upsertProfile(String(tripCode), mergedProfile, now);

      res.json({
        ok: true,
        updated: true,
        profile_json: mergedProfile,
      });
    } catch (error) {
      console.error('profile/from-message error:', error);
      res.status(500).json({
        ok: false,
        updated: false,
        error: error instanceof Error ? error.message : 'unknown error',
      });
    }
  });

  /**
   * [Function]
   * Name: GET /api/profile/:tripCode
   * Purpose: 按 tripCode 读取画像 JSON。
   */
  app.get('/api/profile/:tripCode', (req, res) => {
    const profile = getProfileByTrip(String(req.params.tripCode));
    res.json({
      ok: true,
      profile_json: profile || {},
    });
  });

  /**
   * [Function]
   * Name: POST /api/memories
   * Purpose: 写入事件记忆（支持可选 embedding）。
   */
  app.post('/api/memories', (req, res) => {
    const body = req.body || {};
    if (!body.room_id || !body.text) {
      res.status(400).json({ ok: false, error: 'room_id and text are required' });
      return;
    }

    const memoryId = body.memory_id || crypto.randomUUID();
    const tagsJson = typeof body.tags_json === 'string'
      ? body.tags_json
      : JSON.stringify(Array.isArray(body.tags) ? body.tags : []);

    const importanceValue = Number(body.importance);
    const importance = Number.isFinite(importanceValue)
      ? Math.max(SERVER_CONFIG.memory.minImportance, Math.min(SERVER_CONFIG.memory.maxImportance, Math.floor(importanceValue)))
      : SERVER_CONFIG.memory.defaultImportance;

    const ttlValue = Number(body.ttl_days);
    const ttlDays = Number.isFinite(ttlValue)
      ? Math.max(1, Math.floor(ttlValue))
      : SERVER_CONFIG.memory.defaultTtlDays;

    insertMemory({
      memory_id: String(memoryId),
      room_id: String(body.room_id),
      trip_code: body.trip_code ? String(body.trip_code) : null,
      display_name: body.display_name ? String(body.display_name) : '',
      text: String(body.text),
      tags_json: tagsJson,
      importance,
      ttl_days: ttlDays,
      created_at: body.created_at ? Number(body.created_at) : undefined,
      embedding: Array.isArray(body.embedding) ? body.embedding : null,
    });

    res.json({
      ok: true,
      memory_id: memoryId,
      vector_mode: getDbInfo().vectorMode,
    });
  });

  /**
   * [Function]
   * Name: POST /api/memories/search
   * Purpose: 执行向量检索并返回筛选后的记忆集合。
   */
  app.post('/api/memories/search', (req, res) => {
    if (!isVectorModeEnabled()) {
      res.status(501).json({
        ok: false,
        error: 'vector extension unavailable; set SQLITE_VECTOR_EXTENSION_PATH to enable vec0 search',
      });
      return;
    }

    const { room_id: roomId, trip_code: tripCode, query_embedding: queryEmbedding } = req.body || {};
    const topKRaw = Number(req.body?.top_k);
    const topK = Number.isFinite(topKRaw) ? Math.max(1, Math.min(100, Math.floor(topKRaw))) : 20;

    if (!roomId || !Array.isArray(queryEmbedding) || queryEmbedding.length === 0) {
      res.status(400).json({ ok: false, error: 'room_id and query_embedding are required' });
      return;
    }

    const items = searchMemories({
      roomId: String(roomId),
      tripCode: tripCode ? String(tripCode) : undefined,
      queryEmbedding,
      topK,
    });
    res.json({ ok: true, items: items || [] });
  });

  /**
   * [Function]
   * Name: POST /api/maintenance/cleanup-ttl
   * Purpose: 触发一次 TTL 清理与向量孤儿清理。
   */
  app.post('/api/maintenance/cleanup-ttl', (_req, res) => {
    const result = cleanupTtlAndVectors();
    res.json({ ok: true, ...result });
  });
}
