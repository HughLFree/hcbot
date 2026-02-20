// @ts-check
/**
 * ======================
 * Module: configRoutes
 * Layer: Backend Route
 * Responsibility:
 * - 注册配置相关 API
 * - 提供前端启动所需 bootstrap 数据
 * ======================
 */
import { SERVER_CONFIG } from '../config.mjs';

/**
 * [Function]
 * Name: registerConfigRoutes
 * Purpose: 挂载配置类路由（当前包含 /api/config/bootstrap）。
 * Input: app
 * Output: void
 */
export function registerConfigRoutes(app) {
  /**
   * [Function]
   * Name: GET /api/config/bootstrap
   * Purpose: 返回前端初始化用的 bootstrap 配置。
   */
  app.get('/api/config/bootstrap', (_req, res) => {
    /** @type {import('../../shared/contracts').BootstrapResponse} */
    const payload = {
      ok: true,
      bootstrap: SERVER_CONFIG.bootstrap,
    };

    res.json(payload);
  });
}
