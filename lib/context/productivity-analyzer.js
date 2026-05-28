import { UsageStatistics } from "./usage-statistics.js";
import { createModuleLogger } from "../debug-log.js";

const log = createModuleLogger("productivity-analyzer");

/**
 * App category → work type
 */
const WORK_TYPE_MAP = {
  coding: "deep",
  browsing: "shallow",
  communication: "interruption",
  entertainment: "interruption",
  tools: "shallow",
  other: "shallow",
};

export class ProductivityAnalyzer {
  /**
   * @param {object} options
   * @param {import('../db/window-events-store.js').WindowEventsStore} options.store
   */
  constructor(options) {
    this._store = options.store;
    this._usageStats = new UsageStatistics({ store: options.store });
  }

  /**
   * Generate daily report
   * @param {Date} [date]
   * @returns {Promise<object>}
   */
  async generateDailyReport(date = new Date()) {
    const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    const endOfDay = startOfDay + 86400000;

    const events = this._store.queryRange(startOfDay, endOfDay);
    const appDurations = this._store.getAppDurationStats(startOfDay, endOfDay);
    const switchCount = this._store.getSwitchCount(startOfDay, endOfDay);

    const totalDuration = Object.values(appDurations).reduce((a, b) => a + b, 0);

    // Classify work types
    const workTypes = { deep: 0, shallow: 0, interruption: 0 };
    for (const [app, duration] of Object.entries(appDurations)) {
      const category = this._usageStats.categorizeApp(app);
      const workType = WORK_TYPE_MAP[category] ?? "shallow";
      workTypes[workType] += duration;
    }

    // Deep work periods
    const deepWorkPeriods = this._usageStats.findDeepWorkPeriods(events, 30);

    // App distribution (percentages)
    const appDistribution = Object.entries(appDurations)
      .map(([app, duration]) => ({
        app,
        duration,
        percentage: totalDuration > 0 ? (duration / totalDuration) * 100 : 0,
        category: this._usageStats.categorizeApp(app),
      }))
      .sort((a, b) => b.duration - a.duration);

    // Peak hours (hourly stats)
    const hourlyStats = this._calculateHourlyStats(events);
    const peakHours = hourlyStats
      .filter((h) => h.duration > 0)
      .sort((a, b) => b.duration - a.duration)
      .slice(0, 3);

    // Interruption sources
    const interruptions = appDistribution.filter(
      (a) => WORK_TYPE_MAP[a.category] === "interruption"
    );

    return {
      date: date.toISOString().split("T")[0],
      totalDuration,
      workTypes: {
        deep: { duration: workTypes.deep, percentage: this._pct(workTypes.deep, totalDuration) },
        shallow: { duration: workTypes.shallow, percentage: this._pct(workTypes.shallow, totalDuration) },
        interruption: { duration: workTypes.interruption, percentage: this._pct(workTypes.interruption, totalDuration) },
      },
      deepWork: {
        periods: deepWorkPeriods.length,
        totalDuration: deepWorkPeriods.reduce((a, p) => a + p.duration, 0),
        longestPeriod: deepWorkPeriods.length > 0
          ? deepWorkPeriods.reduce((max, p) => (p.duration > max.duration ? p : max))
          : null,
      },
      contextSwitches: switchCount,
      appDistribution,
      peakHours,
      interruptions,
      hourlyStats,
    };
  }

  /**
   * Generate weekly report
   * @param {Date} [weekStart]
   * @returns {Promise<object>}
   */
  async generateWeeklyReport(weekStart = new Date()) {
    // Adjust to Monday of the week
    const monday = new Date(weekStart);
    monday.setDate(monday.getDate() - monday.getDay() + 1);
    monday.setHours(0, 0, 0, 0);

    const dailyReports = [];
    for (let i = 0; i < 7; i++) {
      const day = new Date(monday);
      day.setDate(day.getDate() + i);
      dailyReports.push(await this.generateDailyReport(day));
    }

    const totals = dailyReports.reduce(
      (acc, day) => ({
        totalDuration: acc.totalDuration + day.totalDuration,
        deepWork: acc.deepWork + day.deepWork.totalDuration,
        switches: acc.switches + day.contextSwitches,
      }),
      { totalDuration: 0, deepWork: 0, switches: 0 }
    );

    return {
      weekStart: monday.toISOString().split("T")[0],
      dailyReports,
      summary: {
        avgDailyDuration: totals.totalDuration / 7,
        totalDeepWork: totals.deepWork,
        avgDailySwitches: totals.switches / 7,
        mostProductiveDay: dailyReports.reduce((best, day) =>
          day.deepWork.totalDuration > best.deepWork.totalDuration ? day : best
        ),
      },
    };
  }

  /**
   * Calculate hourly statistics
   * @private
   */
  _calculateHourlyStats(events) {
    const hours = Array.from({ length: 24 }, (_, i) => ({
      hour: i,
      duration: 0,
      apps: new Set(),
    }));

    for (const event of events) {
      const d = new Date(event.timestamp);
      const hour = d.getHours();
      hours[hour].duration += event.duration_ms ?? 0;
      hours[hour].apps.add(event.app);
    }

    return hours.map((h) => ({
      hour: h.hour,
      duration: h.duration,
      appCount: h.apps.size,
      label: `${h.hour}:00`,
    }));
  }

  /**
   * Calculate percentage
   * @private
   */
  _pct(part, total) {
    return total > 0 ? Math.round((part / total) * 100) : 0;
  }
}
