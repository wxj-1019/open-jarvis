/**
 * 应用兼容性矩阵
 * 记录高频应用支持的 action 列表，用于操作前检查
 */

const COMPATIBILITY_MATRIX = {
  // Windows 应用
  "windows:uia": {
    "chrome": {
      processName: "chrome.exe",
      supportedActions: [
        "click_element",
        "type_text",
        "scroll",
        "click_point",
        "double_click",
      ],
      unsupportedActions: ["drag", "press_key"],
      notes: "Chrome UIA 树稳定，支持 element 操作",
    },
    "vscode": {
      processName: "Code.exe",
      supportedActions: [
        "click_element",
        "type_text",
        "scroll",
        "click_point",
      ],
      unsupportedActions: ["double_click", "drag", "press_key"],
      notes: "VS Code 自定义 UI，部分元素不可见",
    },
    "explorer": {
      processName: "explorer.exe",
      supportedActions: [
        "click_element",
        "type_text",
        "scroll",
        "click_point",
        "double_click",
        "drag",
      ],
      unsupportedActions: [],
      notes: "Windows Explorer 完整 UIA 支持",
    },
    "notepad": {
      processName: "notepad.exe",
      supportedActions: [
        "click_element",
        "type_text",
        "press_key",
      ],
      unsupportedActions: ["scroll", "click_point", "double_click", "drag"],
      notes: "Notepad 简单 UIA 支持",
    },
    "edge": {
      processName: "msedge.exe",
      supportedActions: [
        "click_element",
        "type_text",
        "scroll",
        "click_point",
        "double_click",
      ],
      unsupportedActions: ["drag", "press_key"],
      notes: "Edge 与 Chrome 类似",
    },
  },
  
  // macOS 应用（预留）
  "macos:cua": {
    "safari": {
      processName: "Safari",
      supportedActions: ["click_element", "type_text", "scroll"],
      unsupportedActions: ["click_point", "double_click", "drag", "press_key"],
      notes: "Safari AX 支持有限",
    },
  },
};

export class CompatibilityMatrix {
  constructor(matrix = COMPATIBILITY_MATRIX) {
    this._matrix = matrix;
  }

  /**
   * 检查应用是否支持指定操作
   * @param {string} providerId - Provider ID (windows:uia / macos:cua)
   * @param {string} appName - 应用名称
   * @param {string} actionType - 操作类型
   * @returns {boolean}
   */
  supportsAction(providerId, appName, actionType) {
    const provider = this._matrix[providerId];
    if (!provider) return true; // 未知 provider，默认允许
    
    const app = provider[appName.toLowerCase()];
    if (!app) return true; // 未知应用，默认允许
    
    return app.supportedActions.includes(actionType);
  }

  /**
   * 获取应用支持的所有操作
   * @param {string} providerId
   * @param {string} appName
   * @returns {string[]}
   */
  getSupportedActions(providerId, appName) {
    const provider = this._matrix[providerId];
    if (!provider) return [];
    
    const app = provider[appName.toLowerCase()];
    if (!app) return [];
    
    return [...app.supportedActions];
  }

  /**
   * 获取应用信息
   * @param {string} providerId
   * @param {string} appName
   * @returns {{processName: string, notes: string} | null}
   */
  getAppInfo(providerId, appName) {
    const provider = this._matrix[providerId];
    if (!provider) return null;
    
    const app = provider[appName.toLowerCase()];
    if (!app) return null;
    
    return {
      processName: app.processName,
      notes: app.notes,
    };
  }

  /**
   * 动态添加应用兼容性记录
   * @param {string} providerId
   * @param {string} appName
   * @param {{processName: string, supportedActions: string[], unsupportedActions: string[], notes: string}} appData
   */
  registerApp(providerId, appName, appData) {
    if (!this._matrix[providerId]) {
      this._matrix[providerId] = {};
    }
    this._matrix[providerId][appName.toLowerCase()] = appData;
  }

  /**
   * 导出完整矩阵
   * @returns {object}
   */
  export() {
    return JSON.parse(JSON.stringify(this._matrix));
  }
}

// 单例导出
export const compatibilityMatrix = new CompatibilityMatrix();
