const DEFAULT_TIMEZONE = "UTC";

let _userTimezone = null;

export function setUserTimezone(timezone) {
  _userTimezone = timezone;
}

export function getUserTimezone() {
  return _userTimezone || Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TIMEZONE;
}

export function resetUserTimezone() {
  _userTimezone = null;
}

export function convertToUserTimezone(isoString, timezone) {
  if (!isoString) return isoString;

  const tz = timezone || getUserTimezone();
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return isoString;

    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });

    const parts = formatter.formatToParts(date);
    const get = (type) => parts.find((p) => p.type === type)?.value || "";

    return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}`;
  } catch {
    return isoString;
  }
}

export function formatMemoryTime(isoString, timezone) {
  if (!isoString) return "";

  const tz = timezone || getUserTimezone();
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) return isoString;

    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "刚刚";
    if (diffMins < 60) return `${diffMins} 分钟前`;
    if (diffHours < 24) return `${diffHours} 小时前`;
    if (diffDays < 7) return `${diffDays} 天前`;

    return convertToUserTimezone(isoString, tz);
  } catch {
    return isoString;
  }
}

export function isToday(isoString, timezone) {
  if (!isoString) return false;

  const tz = timezone || getUserTimezone();
  try {
    const date = new Date(isoString);
    const formatter = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
    const parts = formatter.formatToParts(date);
    const get = (type) => parts.find((p) => p.type === type)?.value || "";

    const todayFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
    const todayParts = todayFormatter.formatToParts(new Date());
    const getToday = (type) => todayParts.find((p) => p.type === type)?.value || "";

    return get("year") === getToday("year") &&
           get("month") === getToday("month") &&
           get("day") === getToday("day");
  } catch {
    return false;
  }
}
