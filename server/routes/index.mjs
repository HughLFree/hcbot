/**
 * ====================
 * Module: routeIndexer
 * Layer: Backend Route
 * Responsibility:
 * - 聚合各子路由模块
 * - 对外暴露统一 registerRoutes 入口
 * ====================
 */
import { registerBusinessRoutes } from './businessRoutes.mjs';
import { registerConfigRoutes } from './configRoutes.mjs';

/**
 * [Function]
 * Name: registerRoutes
 * Purpose: 将配置路由和业务路由挂载到同一个 Express 应用。
 * Input: app
 * Output: void
 */
export function registerRoutes(app) {
  registerConfigRoutes(app);
  registerBusinessRoutes(app);
}
