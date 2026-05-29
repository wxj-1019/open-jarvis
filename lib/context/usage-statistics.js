import { createModuleLogger } from "../debug-log.js";

const log = createModuleLogger("usage-statistics");

const APP_CATEGORIES = {
  coding: ["Code.exe", "Code - Insiders.exe", "cursor.exe", "idea64.exe", "pycharm64.exe", "Xcode.app", "Android Studio.app"],
  browsing: ["chrome.exe", "firefox.exe", "msedge.exe", "Safari.app", "Google Chrome.app", "Firefox.app"],
  communication: ["Slack.exe", "Discord.exe", "Teams.exe", "Telegram.exe", "WeChat.exe"],
  entertainment: ["vlc.exe", "spotify.exe", "steam.exe", "netflix.exe"],
  tools: ["WindowsTerminal.exe", "Terminal.app", "Finder.app", "explorer.exe"],
};

export class UsageStatistics {
  constructor(options) {
    this._store = options.store;
  }

  async getDailyStats(date = new Date()) {
    const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    const endOfDay = startOfDay + 86400000;

    const appDurations = this._store.getAppDurationStats(startOfDay, endOfDay);
    const switchCount = this._store.getSwitchCount(startOfDay, endOfDay);
    const events = this._store.queryRange(startOfDay, endOfDay);

    const totalDuration = Object.values(appDurations).reduce((a, b) => a + b, 0);
    const deepWorkPeriods = this.findDeepWorkPeriods(events, 30);

    const categoryBreakdown = {};
    for (const [app, duration] of Object.entries(appDurations)) {
      const category = this.categorizeApp(app);
      categoryBreakdown[category] = (categoryBreakdown[category] ?? 0) + duration;
    }

    return {
      date: date.toISOString().split("T")[0],
      totalDuration,
      appBreakdown: appDurations,
      categoryBreakdown,
      switchCount,
      deepWorkPeriods,
      deepWorkTotal: deepWorkPeriods.reduce((a, p) => a + p.duration, 0),
    };
  }

  findDeepWorkPeriods(events, thresholdMinutes = 30) {
    if (!events || events.length === 0) return [];

    const sorted = [...events].sort((a, b) => a.timestamp - b.timestamp);
    const periods = [];
    let current = null;
    const MAX_GAP_MS = 5 * 60 * 1000; // 5 分钟最大间隙

    for (const event of sorted) {
      const isNewPeriod = !current || 
        current.app !== event.app || 
        (event.timestamp - current.end) > MAX_GAP_MS; // 检查时间间隙

      if (isNewPeriod) {
        if (current) {
          const duration = current.end - current.start;
          if (duration >= thresholdMinutes * 60000) {
            periods.push({ ...current, duration });
          }
        }
        current = {
          app: event.app,
          start: event.timestamp,
          end: event.timestamp + (event.duration_ms ?? 0),
        };
      } else {
        current.end = event.timestamp + (event.duration_ms ?? 0);
      }
    }

    if (current) {
      const duration = current.end - current.start;
      if (duration >= thresholdMinutes * 60000) {
        periods.push({ ...current, duration });
      }
    }

    return periods;
  }

  categorizeApp(appName) {
    const lower = appName.toLowerCase();
    for (const [category, apps] of Object.entries(APP_CATEGORIES)) {
      if (apps.some((a) => lower.includes(a.toLowerCase()))) {
        return category;
      }
    }
    return "other";
  }
}
