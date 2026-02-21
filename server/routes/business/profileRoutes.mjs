import { SERVER_CONFIG } from '../../config.mjs';
import {
  getMemoryDigestByTrip,
  getProfileByTrip,
  ingestIdentity,
  upsertProfile,
  upsertRoom,
  upsertUser,
} from '../../db/index.mjs';
import { extractProfileWithDeepSeek, mergeProfile, parseSetProfileInput } from '../../services/profileExtractor.mjs';

/**
 * 模块职责：
 * 注册用户身份与画像相关路由。
 */
export function registerProfileRoutes(app) {
  /**
   * POST /api/ingest-message
   * 同步 trip 身份心跳（rooms/users）。
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
   * POST /api/profile/upsert
   * 直接覆盖写入某用户画像。
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
   * POST /api/profile/from-message
   * 从 setprofile 指令抽取画像并合并写库。
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
   * GET /api/profile/:tripCode
   * 读取用户画像与记忆梗概。
   */
  app.get('/api/profile/:tripCode', (req, res) => {
    const tripCode = String(req.params.tripCode);
    const profile = getProfileByTrip(tripCode);
    const memoryDigest = getMemoryDigestByTrip(tripCode);
    res.json({
      ok: true,
      profile_json: profile || {},
      memory_digest_json: memoryDigest || {},
    });
  });
}
