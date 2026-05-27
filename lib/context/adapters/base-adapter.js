/**
 * 内容适配器基类
 * 所有适配器必须实现 static supports(app, title) 和 static async extract(app, title)
 */
export class ContentAdapter {
  static supports(_app, _title) {
    return false;
  }
  static async extract(_app, _title) {
    return { type: "unknown", content: null, metadata: {} };
  }
}
