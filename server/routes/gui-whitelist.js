/**
 * gui-whitelist.js - GUI 白名单管理路由
 *
 * 处理前端发送的 GUI 白名单批准/拒绝请求
 */

import { Router } from 'express';
import { Type } from '../utils/schemas.js';
import { validateBody } from '../utils/validation.js';

/**
 * 创建 GUI 白名单路由
 * @param {object} engine - HanaEngine 实例
 * @returns {Router}
 */
export function createGuiWhitelistRoute(engine) {
  const router = Router();

  const GuiWhitelistBody = Type.Object({
    executable: Type.String(),
    approved: Type.Boolean(),
  });

  /**
   * POST /api/sandbox/gui-whitelist
   * 
   * 处理用户对 GUI 白名单请求的响应
   */
  router.post('/sandbox/gui-whitelist', validateBody(GuiWhitelistBody), async (req, res) => {
    const { executable, approved } = req.body;
    
    try {
      if (!engine) {
        return res.status(503).json({ error: 'engine not available' });
      }
      
      if (approved) {
        // 用户同意，添加到白名单
        engine._addExecutableToGuiWhitelist(executable);
        res.json({ success: true, approved: true });
      } else {
        // 用户拒绝
        res.json({ success: true, approved: false });
      }
    } catch (error) {
      console.error('[gui-whitelist] Error:', error);
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}

export default createGuiWhitelistRoute;
