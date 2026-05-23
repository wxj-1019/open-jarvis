/**
 * validate.js — 请求体校验中间件工厂
 * 使用 TypeBox Value.Check / Value.Errors 对请求体做 Schema 校验
 */
import { Value } from "typebox/value";

/**
 * 创建校验中间件
 * @param {object} [schema] - TypeBox Schema (Type.Object / Type.Union 等)，传入 null 则仅校验 JSON 格式
 * @returns {Function} Hono 中间件
 *
 * 用法:
 *   app.post('/api/xxx', validateBody(Schemas.XxxBody), async (c) => {
 *     const body = c.get('validatedBody');
 *     ...
 *   });
 *
 *   // 仅 JSON 校验（用于动态字段）
 *   app.post('/api/yyy', validateBody(null), async (c) => {
 *     const body = c.get('validatedBody');
 *     ...
 *   });
 */
export function validateBody(schema) {
  return async (c, next) => {
    let body;
    try {
      const text = await c.req.text();
      try {
        body = text ? JSON.parse(text) : {};
      } catch {
        return c.json({ error: "invalid_json" }, 400);
      }
    } catch {
      return c.json({ error: "failed_to_read_body" }, 400);
    }

    if (schema && !Value.Check(schema, body)) {
      const errors = [...Value.Errors(schema, body)].map((e) => ({
        path: e.path,
        message: e.message,
      }));
      return c.json({ error: "validation_error", detail: errors }, 422);
    }

    c.set("validatedBody", body);
    return next();
  };
}
