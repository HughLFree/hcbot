import { cleanupTtlAndVectors } from '../../db/index.mjs';

/**
 * 注册维护类路由。
 */
export function registerMaintenanceRoutes(app) {
  /**
   * POST /api/maintenance/cleanup-ttl
   * 手动触发一次过期记忆与孤儿向量清理。
   */
  app.post('/api/maintenance/cleanup-ttl', (_req, res) => {
    const result = cleanupTtlAndVectors();
    res.json({ ok: true, ...result });
  });
}
