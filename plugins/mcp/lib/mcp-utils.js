export function stringOrEmpty(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeStringRecord(record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) return {};
  return Object.fromEntries(
    Object.entries(record).filter(([key, val]) => typeof key === "string" && typeof val === "string"),
  );
}

export function normalizeTimeoutSeconds(value, defaultValue = 0) {
  if (value === "" || value == null) return defaultValue;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : defaultValue;
}

export function requestTimeoutMs(server, defaultMs = 30_000) {
  const timeout = Number(server?.timeout || 0);
  return Number.isFinite(timeout) && timeout > 0 ? timeout * 1000 : defaultMs;
}
