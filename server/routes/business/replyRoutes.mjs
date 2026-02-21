import crypto from 'node:crypto';
import { SERVER_CONFIG } from '../../config.mjs';
import { getMemoryDigestByTrip, getProfileByTrip, insertMemory, listMemoriesByTrip } from '../../db/index.mjs';
import { appendReplyLog } from '../../services/replyLogger.mjs';
import { generateDeepSeekReply, generateDeepSeekReplyTwoPass, isReplyServiceReady } from '../../services/replyService.mjs';
import {
  toImportanceThreshold,
  toMemoryDigestContext,
  toProfileContext,
  toOptionalBoolean,
  toPositiveLimit,
  toReplyPipelineMode,
} from './helpers.mjs';

/**
 * 模块职责：
 * 注册回复生成路由，并处理记忆注入与记忆回写。
 */
export function registerReplyRoutes(app) {
  /**
   * POST /api/reply/deepseek
   * 主回复接口：
   * - 读取上下文（history/profile/memory digest）
   * - 调用 single/two_pass pipeline
   * - 根据阈值决定记忆落库
   */
  app.post('/api/reply/deepseek', async (req, res) => {
    try {
      if (!isReplyServiceReady()) {
        res.status(500).json({ ok: false, error: 'DEEPSEEK_API_KEY is missing on API server' });
        return;
      }

      const targetTrip = req.body?.targetTrip ? String(req.body.targetTrip) : '';
      const roomId = req.body?.room_id ? String(req.body.room_id) : null;
      const promptMinImportance = toImportanceThreshold(
        req.body?.memory_prompt_min_importance,
        SERVER_CONFIG.memory.promptMinImportance
      );
      const promptMemoryLimit = toPositiveLimit(
        req.body?.memory_prompt_limit,
        SERVER_CONFIG.memory.promptMaxItems
      );
      const storeMinImportance = toImportanceThreshold(
        req.body?.memory_store_min_importance,
        SERVER_CONFIG.memory.storeMinImportance
      );
      const requestStoreEnabled = toOptionalBoolean(req.body?.memory_store_enabled);
      const storeEnabled = requestStoreEnabled ?? SERVER_CONFIG.memory.storeEnabled;
      const requestedPipelineMode = req.body?.reply_pipeline_mode;
      const pipelineMode = requestedPipelineMode === undefined
        ? SERVER_CONFIG.reply.pipelineMode
        : toReplyPipelineMode(requestedPipelineMode);

      const memoryContext = targetTrip
        ? listMemoriesByTrip({
          tripCode: targetTrip,
          minImportance: promptMinImportance,
          limit: promptMemoryLimit,
        }).map((item) => ({
          user_trip: item.trip_code,
          text: item.text,
          importance: item.importance,
          tags: item.tags,
          source_room: item.room_id,
          created_at: item.created_at,
        }))
        : [];
      const memoryDigest = targetTrip ? getMemoryDigestByTrip(targetTrip) : null;
      const profile = targetTrip ? getProfileByTrip(targetTrip) : null;
      const profileContextFromDb = toProfileContext(profile);
      const memoryDigestContext = toMemoryDigestContext(memoryDigest);
      const profileContext = [profileContextFromDb, memoryDigestContext]
        .filter((item) => typeof item === 'string' && item.trim().length > 0)
        .join('\n\n');

      const modelParams = {
        history: req.body?.history,
        personality: req.body?.personality,
        targetMessage: req.body?.targetMessage,
        targetSender: req.body?.targetSender,
        profileContext,
        memoryContext,
      };
      const modelResult = pipelineMode === 'two_pass'
        ? await generateDeepSeekReplyTwoPass(modelParams)
        : await generateDeepSeekReply(modelParams);

      const candidateItems = Array.isArray(modelResult.memory?.items)
        ? modelResult.memory.items
        : [];
      const memoryItemsToStore = candidateItems.filter((item) => {
        if (!item || typeof item !== 'object') return false;
        if (typeof item.text !== 'string' || item.text.trim().length === 0) return false;
        const importance = Number(item.importance);
        if (!Number.isFinite(importance) || importance < storeMinImportance) return false;
        return Boolean(targetTrip);
      }).map((item) => ({
        text: String(item.text).trim(),
        importance: toImportanceThreshold(item.importance, SERVER_CONFIG.memory.defaultImportance),
        tags: Array.isArray(item.tags)
          ? item.tags.filter((tag) => typeof tag === 'string' && tag.trim().length > 0)
          : [],
      }));

      const finalMemoryItems = storeEnabled ? memoryItemsToStore : [];

      if (finalMemoryItems.length > 0) {
        const displayName = req.body?.targetSender ? String(req.body.targetSender) : '';
        for (const memoryItem of finalMemoryItems) {
          insertMemory({
            memory_id: crypto.randomUUID(),
            room_id: roomId,
            trip_code: targetTrip,
            display_name: displayName,
            text: memoryItem.text,
            tags_json: JSON.stringify(memoryItem.tags),
            importance: memoryItem.importance,
            ttl_days: SERVER_CONFIG.memory.defaultTtlDays,
            embedding: null,
          });
        }
      }

      const responsePayload = {
        reply: String(modelResult.reply || ''),
        memory: {
          items: finalMemoryItems,
        },
      };

      appendReplyLog({
        pipeline_mode: pipelineMode,
        deepseek_reply: modelResult,
      });

      res.json(responsePayload);
    } catch (error) {
      res.status(500).json({
        ok: false,
        error: error instanceof Error ? error.message : 'unknown error',
      });
    }
  });
}
