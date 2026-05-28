import { createModuleLogger } from "../debug-log.js";

const log = createModuleLogger("pattern-miner");

const TIME_BUCKETS = [
  { name: "early", start: 5, end: 8 },
  { name: "morning", start: 9, end: 12 },
  { name: "afternoon", start: 13, end: 17 },
  { name: "evening", start: 18, end: 22 },
  { name: "night", start: 23, end: 4 },
];

function categorizeApp(appName) {
  const lower = appName.toLowerCase();
  if (lower.includes("code") || lower.includes("cursor") || lower.includes("idea")) return "coding";
  if (lower.includes("chrome") || lower.includes("firefox") || lower.includes("safari")) return "browsing";
  if (lower.includes("slack") || lower.includes("discord") || lower.includes("teams")) return "communication";
  if (lower.includes("vlc") || lower.includes("steam") || lower.includes("spotify")) return "entertainment";
  return "other";
}

function getTimeBucket(hour) {
  for (const bucket of TIME_BUCKETS) {
    if (bucket.start <= bucket.end) {
      if (hour >= bucket.start && hour <= bucket.end) return bucket.name;
    } else {
      if (hour >= bucket.start || hour <= bucket.end) return bucket.name;
    }
  }
  return "unknown";
}

export class PatternMiner {
  constructor() {
    this._minSupport = 2;
    this._maxPatternLength = 4;
  }

  encodeState(event) {
    const date = new Date(event.timestamp);
    const category = categorizeApp(event.app);
    const timeBucket = getTimeBucket(date.getHours());
    const dayOfWeek = date.getDay();
    return `${category}|${timeBucket}|${dayOfWeek}`;
  }

  buildMarkovModel(events) {
    if (!events || events.length < 2) {
      return { states: [], transitions: {} };
    }

    const sorted = [...events].sort((a, b) => a.timestamp - b.timestamp);
    const states = new Set();
    const transitions = {};
    const stateCounts = {};

    for (let i = 0; i < sorted.length - 1; i++) {
      const current = this.encodeState(sorted[i]);
      const next = this.encodeState(sorted[i + 1]);

      states.add(current);
      states.add(next);

      stateCounts[current] = (stateCounts[current] ?? 0) + 1;

      if (!transitions[current]) transitions[current] = {};
      transitions[current][next] = (transitions[current][next] ?? 0) + 1;
    }

    // Normalize to probabilities
    for (const [state, nextStates] of Object.entries(transitions)) {
      const total = stateCounts[state] ?? 1;
      for (const next of Object.keys(nextStates)) {
        nextStates[next] /= total;
      }
    }

    return {
      states: Array.from(states),
      transitions,
      stateCounts,
    };
  }

  predictNext(model, currentState) {
    const nextStates = model.transitions[currentState];
    if (!nextStates) return null;

    let bestState = null;
    let bestProb = 0;

    for (const [state, prob] of Object.entries(nextStates)) {
      if (prob > bestProb) {
        bestProb = prob;
        bestState = state;
      }
    }

    return bestState ? { state: bestState, probability: bestProb } : null;
  }

  findFrequentPatterns(events, minSupport = 2) {
    if (!events || events.length === 0) return [];

    const sorted = [...events].sort((a, b) => a.timestamp - b.timestamp);
    const stateSequence = sorted.map((e) => this.encodeState(e));

    const patterns = [];

    for (let length = 2; length <= this._maxPatternLength; length++) {
      const candidates = new Map();

      for (let i = 0; i <= stateSequence.length - length; i++) {
        const sequence = stateSequence.slice(i, i + length);
        const key = sequence.join("\u2192");
        candidates.set(key, (candidates.get(key) ?? 0) + 1);
      }

      for (const [key, count] of candidates.entries()) {
        if (count >= minSupport) {
          patterns.push({
            sequence: key.split("\u2192"),
            support: count,
            length,
          });
        }
      }
    }

    return patterns.sort((a, b) => b.support - a.support);
  }

  findPeriodicPatterns(events) {
    const patterns = [];
    const hourlyAppCounts = {};

    for (const event of events) {
      const date = new Date(event.timestamp);
      const hour = date.getHours();
      const category = categorizeApp(event.app);
      const key = `${hour}:${category}`;
      hourlyAppCounts[key] = (hourlyAppCounts[key] ?? 0) + 1;
    }

    for (const [key, count] of Object.entries(hourlyAppCounts)) {
      if (count >= 3) {
        const [hour, category] = key.split(":");
        patterns.push({
          description: `Frequently use ${category} at ${hour}:00`,
          hour: parseInt(hour),
          category,
          confidence: Math.min(count / 7, 1.0),
        });
      }
    }

    return patterns.sort((a, b) => b.confidence - a.confidence);
  }
}
