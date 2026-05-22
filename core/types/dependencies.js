/**
 * @fileoverview Shared JSDoc typedefs for DI dependency objects across all managers.
 */

/**
 * Validates that required/optional dependencies are present at construction time.
 * @param {object} deps
 * @param {string} managerName
 * @param {{ required?: string[], optional?: string[] }} opts
 */
export function validateDeps(deps, managerName, { required = [], optional = [] } = {}) {
  for (const key of required) {
    if (deps[key] == null) {
      throw new Error(`${managerName}: required dependency "${key}" is missing`);
    }
  }
  for (const key of optional) {
    if (deps[key] == null) {
      // eslint-disable-next-line no-console
      console.warn(`${managerName}: optional dependency "${key}" is missing`);
    }
  }
}

/**
 * @typedef {object} SessionCoordinatorDeps
 * @property {string} agentsDir
 * @property {() => object} getAgent - 当前焦点 agent
 * @property {() => string} getActiveAgentId
 * @property {() => import('../model-manager.js').ModelManager} getModels
 * @property {() => object} getResourceLoader
 * @property {() => import('../skill-manager.js').SkillManager} getSkills
 * @property {(cwd: string, customTools?: any[], opts?: object) => object} buildTools
 * @property {(event: string, sp: string) => void} emitEvent
 * @property {() => string|null} getHomeCwd
 * @property {(path: string) => string|null} agentIdFromSessionPath
 * @property {(id: string) => Promise} switchAgentOnly - 仅切换 agent 指针
 * @property {() => object} getConfig
 * @property {() => Map} getAgents
 * @property {(agentId: string) => object} getActivityStore
 * @property {(agentId: string) => object|null} getAgentById
 * @property {() => object} listAgents - 列出所有 agent
 * @property {(text: string, level?: string) => void} [emitDevLog]
 * @property {() => object} [getConfirmStore]
 * @property {() => object} [getDeferredResultStore]
 * @property {() => object} [getTaskRegistry]
 * @property {() => object} [getEngine]
 * @property {(sessionPath: string) => Promise<void>} [closeTerminalsForSession]
 * @property {() => Promise<void>} [closeAllTerminals]
 * @property {(cwd: string) => Promise<void>} [onBeforeSessionCreate]
 * @property {object} [memoryPressure]
 * @property {object} [sessionListProjectionCache]
 */

/**
 * @typedef {object} AgentManagerDeps
 * @property {string} agentsDir
 * @property {string} productDir
 * @property {string} userDir
 * @property {string} channelsDir
 * @property {() => import('../preferences-manager.js').PreferencesManager} getPrefs
 * @property {() => import('../model-manager.js').ModelManager} getModels
 * @property {() => import('../skill-manager.js').SkillManager} getSkills
 * @property {() => object} getSearchConfig
 * @property {() => object} resolveUtilityConfig
 * @property {() => object} getSharedModels
 * @property {() => import('../channel-manager.js').ChannelManager} getChannelManager
 * @property {() => import('../session-coordinator.js').SessionCoordinator} getSessionCoordinator
 * @property {() => object} getEngine
 * @property {() => object|null} [getHub]
 * @property {() => object} [getResourceLoader]
 */

/**
 * @typedef {object} ConfigCoordinatorDeps
 * @property {string} hanakoHome
 * @property {string} agentsDir
 * @property {() => object} getAgent - 当前焦点 agent
 * @property {(id: string) => object|null} getAgentById - 按 ID 查找 agent
 * @property {() => string} getActiveAgentId - 当前焦点 agent ID
 * @property {() => Map} getAgents - 所有 agent Map
 * @property {() => import('../model-manager.js').ModelManager} getModels
 * @property {() => import('../preferences-manager.js').PreferencesManager} getPrefs
 * @property {() => import('../skill-manager.js').SkillManager} getSkills
 * @property {() => object|null} getSession - 当前 session
 * @property {() => import('../session-coordinator.js').SessionCoordinator|null} getSessionCoordinator
 * @property {() => object|null} getHub
 * @property {(event: string, sp: string) => void} emitEvent
 * @property {(text: string, level?: string) => void} emitDevLog
 * @property {() => string|null} getCurrentModel - currentModel name
 */

/**
 * @typedef {object} BridgeSessionManagerDeps
 * @property {() => object} getAgent - 返回当前 agent（需 sessionDir, yuanPrompt）
 * @property {(id: string) => object|null} getAgentById - 按 ID 获取 agent
 * @property {() => import('../model-manager.js').ModelManager} getModelManager
 * @property {() => object} getResourceLoader
 * @property {() => object} getPreferences
 * @property {(cwd: string, customTools?: any[], opts?: object) => {tools: any[], customTools: any[]}} buildTools
 * @property {() => string} getHomeCwd
 * @property {(event: string, sp: string) => void} emitEvent
 * @property {(agentId: string) => Promise<object>} ensureAgentRuntime
 * @property {() => string} getHanakoHome
 * @property {(fileId: string, opts?: object) => object} registerSessionFile
 * @property {(fileId: string, opts?: object) => object} getSessionFile
 * @property {(filePath: string, opts?: object) => object} getSessionFileByPath
 * @property {() => Map<string, object>|object[]|undefined} [getAgents] - 返回所有 agent（reconcile 用）
 * @property {() => object} [getVisionBridge]
 * @property {() => boolean} [isVisionAuxiliaryEnabled]
 */

/**
 * @typedef {object} ChannelManagerDeps
 * @property {string} channelsDir - 频道目录
 * @property {string} agentsDir - agents 根目录
 * @property {string} userDir - 用户数据目录
 * @property {() => object|null} getHub - 返回 Hub（可能为 null）
 */

/**
 * @typedef {object} PluginManagerDeps
 * @property {string} dataDir
 * @property {object} bus
 * @property {string[]} [pluginsDirs]
 * @property {string} [pluginsDir]
 * @property {object} [preferencesManager]
 * @property {string} [appVersion]
 * @property {() => string|null} [getSessionPath]
 * @property {(fileId: string, opts?: object) => object} [registerSessionFile]
 * @property {object} [slashRegistry]
 * @property {number} [loadTimeoutMs]
 * @property {number} [lifecycleTimeoutMs]
 * @property {Function} [logSink]
 * @property {object} [runtimeContext]
 */
