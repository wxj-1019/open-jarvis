/**
 * gui-whitelist.js - GUI 白名单管理路由
 *
 * 处理前端发送的 GUI 白名单批准/拒绝请求
 */

import { Hono } from 'hono';

/**
 * 创建 GUI 白名单路由
 * @param {object} engine - HanaEngine 实例
 * @param {object} hub - Hub 实例（用于事件总线）
 * @returns {Hono}
 */
export function createGuiWhitelistRoute(engine, hub = null) {
  const route = new Hono();

  /**
   * POST /api/sandbox/gui-whitelist
   * 
   * 处理用户对 GUI 白名单请求的响应
   */
  route.post('/sandbox/gui-whitelist', async (c) => {
    try {
      const { executable, approved } = await c.req.json();

      if (!executable || typeof approved !== 'boolean') {
        return c.json({ error: 'executable and approved are required' }, 400);
      }

      if (approved) {
        // 用户批准，添加到白名单
        engine._addExecutableToGuiWhitelist?.(executable);
        
        // 通知沙盒执行层继续
        hub?.eventBus?.emit?.({
          type: 'gui-whitelist-response',
          executable,
          approved: true,
        });

        return c.json({ ok: true, approved: true });
      } else {
        // 用户拒绝，通知沙盒执行层中止
        hub?.eventBus?.emit?.({
          type: 'gui-whitelist-response',
          executable,
          approved: false,
        });

        return c.json({ ok: true, approved: false });
      }
    } catch (err) {
      return c.json({ error: err.message }, 500);
    }
  });

  return route;
}
