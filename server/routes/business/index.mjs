import { registerHealthRoutes } from './healthRoutes.mjs';
import { registerMemoryRoutes } from './memoryRoutes.mjs';
import { registerMaintenanceRoutes } from './maintenanceRoutes.mjs';
import { registerProfileRoutes } from './profileRoutes.mjs';
import { registerReplyRoutes } from './replyRoutes.mjs';

/**
 * 统一挂载业务域路由。
 */
export function registerBusinessRoutes(app) {
  registerHealthRoutes(app);
  registerReplyRoutes(app);
  registerProfileRoutes(app);
  registerMemoryRoutes(app);
  registerMaintenanceRoutes(app);
}
