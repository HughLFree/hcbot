import crypto from 'node:crypto';
import { SERVER_CONFIG } from '../../config.mjs';
import {
  getDbInfo,
  insertMemory,
  isVectorModeEnabled,
  listMemoriesGroupedByTripForDigest,
  pruneLowImportanceMemories,
  searchMemories,
  upsertMemoryDigest,
  upsertUser,
} from '../../db/index.mjs';
import { isMemoryDigestServiceReady, summarizeUserMemoryDigest } from '../../services/memoryDigestService.mjs';
import { toImportanceThreshold, toPositiveLimitWithMax } from './helpers.mjs';

/**
 * 模块职责：
 * 注册记忆写入、检索、梗概整合与清理相关路由。
 */
export function registerMemoryRoutes(app) {
  /**
   * POST /api/memories/consolidate
   * 按用户聚合记忆 -> 生成梗概 -> 回写 user_profile -> 按阈值清理旧记忆。
   */
  app.post('/api/memories/consolidate', async (req, res) => {
    try {
      if (!isMemoryDigestServiceReady()) {
        res.status(500).json({ ok: false, error: 'DEEPSEEK_API_KEY is missing on API server' });
        return;
      }

      const sourceMinImportance = toImportanceThreshold(
        req.body?.source_min_importance,
        SERVER_CONFIG.memory.digestSourceMinImportance
      );
      const sourceMaxItemsPerUser = toPositiveLimitWithMax(
        req.body?.source_max_items_per_user,
        SERVER_CONFIG.memory.digestSourceMaxItemsPerUser,
        200
      );
      const pruneBelowImportance = toImportanceThreshold(
        req.body?.prune_below_importance,
        SERVER_CONFIG.memory.digestPruneBelowImportance
      );

      const grouped = listMemoriesGroupedByTripForDigest({
        minImportance: sourceMinImportance,
        maxItemsPerUser: sourceMaxItemsPerUser,
      });

      const now = Math.floor(Date.now() / 1000);
      let processedUsers = 0;
      let updatedUsers = 0;
      let skippedUsers = 0;
      const errors = [];

      for (const [tripCode, items] of grouped.entries()) {
        processedUsers += 1;
        try {
          const digest = await summarizeUserMemoryDigest({
            tripCode,
            memories: items,
            now,
          });
          upsertUser(String(tripCode), '', now);
          upsertMemoryDigest(String(tripCode), digest, now);
          updatedUsers += 1;
        } catch (error) {
          skippedUsers += 1;
          errors.push({
            trip_code: String(tripCode),
            error: error instanceof Error ? error.message : 'unknown error',
          });
        }
      }

      const pruneResult = pruneLowImportanceMemories(pruneBelowImportance);
      res.json({
        ok: true,
        processed_users: processedUsers,
        updated_users: updatedUsers,
        skipped_users: skippedUsers,
        source_min_importance: sourceMinImportance,
        source_max_items_per_user: sourceMaxItemsPerUser,
        prune_below_importance: pruneBelowImportance,
        pruned_memories: pruneResult.removedMemories,
        pruned_vectors: pruneResult.removedVectors,
        errors,
      });
    } catch (error) {
      res.status(500).json({
        ok: false,
        error: error instanceof Error ? error.message : 'unknown error',
      });
    }
  });

  /**
   * POST /api/memories
   * 写入单条记忆（支持可选 embedding）。
   */
  app.post('/api/memories', (req, res) => {
    const body = req.body || {};
    if (!body.text) {
      res.status(400).json({ ok: false, error: 'text is required' });
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
      room_id: body.room_id ? String(body.room_id) : null,
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
   * POST /api/memories/search
   * 执行向量检索并返回候选记忆。
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
}
