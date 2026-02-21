import { getDbInfo } from '../../db/index.mjs';

/**
 * 注册健康检查路由。
 */
export function registerHealthRoutes(app) {
  /**
   * GET /api/health
   * 返回服务与数据库运行信息。
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
}
