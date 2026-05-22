/**
 * MCP Server Registry — search and discover community MCP servers.
 *
 * Uses the official MCP registry API when available, with a built-in
 * fallback list of popular servers for offline / network-restricted use.
 */

const REGISTRY_API = "https://registry.modelcontextprotocol.io";

// Built-in popular servers (curated fallback)
const BUILTIN_SERVERS = [
  {
    id: "github",
    name: "GitHub",
    description: "GitHub API integration — repositories, issues, PRs, search",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-github"],
    envHints: ["GITHUB_TOKEN"],
    category: "development",
  },
  {
    id: "filesystem",
    name: "Filesystem",
    description: "Secure filesystem access — read, write, search files",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-filesystem"],
    envHints: [],
    category: "system",
  },
  {
    id: "brave-search",
    name: "Brave Search",
    description: "Web search via Brave Search API",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-brave-search"],
    envHints: ["BRAVE_API_KEY"],
    category: "search",
  },
  {
    id: "google-maps",
    name: "Google Maps",
    description: "Google Maps API — geocoding, places, directions",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-google-maps"],
    envHints: ["GOOGLE_MAPS_API_KEY"],
    category: "location",
  },
  {
    id: "slack",
    name: "Slack",
    description: "Slack API — channels, messages, users",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-slack"],
    envHints: ["SLACK_BOT_TOKEN", "SLACK_TEAM_ID"],
    category: "communication",
  },
  {
    id: "memory",
    name: "Memory (Knowledge Graph)",
    description: "Persistent memory using a local knowledge graph",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-memory"],
    envHints: [],
    category: "memory",
  },
  {
    id: "postgres",
    name: "PostgreSQL",
    description: "PostgreSQL database access — query, schema inspection",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-postgres"],
    envHints: ["DATABASE_URL"],
    category: "database",
  },
  {
    id: "sqlite",
    name: "SQLite",
    description: "SQLite database access — query, schema inspection",
    transport: "stdio",
    command: "npx",
    args: ["-y", "mcp-server-sqlite"],
    envHints: [],
    category: "database",
  },
  {
    id: "puppeteer",
    name: "Puppeteer",
    description: "Browser automation via Puppeteer — screenshots, navigation, interaction",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-puppeteer"],
    envHints: [],
    category: "browser",
  },
  {
    id: "fetch",
    name: "Fetch",
    description: "HTTP fetch — make requests, retrieve web content",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-fetch"],
    envHints: [],
    category: "network",
  },
  {
    id: "everything",
    name: "Everything (Reference)",
    description: "Reference MCP server with all features for testing",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-everything"],
    envHints: [],
    category: "testing",
  },
  {
    id: "sequential-thinking",
    name: "Sequential Thinking",
    description: "Structured sequential thinking for complex problem solving",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-sequential-thinking"],
    envHints: [],
    category: "reasoning",
  },
  {
    id: "notion",
    name: "Notion",
    description: "Notion API — pages, databases, search",
    transport: "stdio",
    command: "npx",
    args: ["-y", "mcp-server-notion"],
    envHints: ["NOTION_API_KEY"],
    category: "productivity",
  },
  {
    id: "linear",
    name: "Linear",
    description: "Linear API — issues, projects, teams",
    transport: "stdio",
    command: "npx",
    args: ["-y", "mcp-server-linear"],
    envHints: ["LINEAR_API_KEY"],
    category: "project-management",
  },
  {
    id: "home-assistant",
    name: "Home Assistant",
    description: "Home Assistant API — smart home devices, automations, states",
    transport: "stdio",
    command: "npx",
    args: ["-y", "mcp-server-home-assistant"],
    envHints: ["HASS_HOST", "HASS_TOKEN"],
    category: "iot",
  },
];

/**
 * Search servers from the built-in registry.
 * Falls back to local list if remote API is unavailable.
 */
export async function searchRegistryServers(query, { fetchImpl = globalThis.fetch } = {}) {
  const q = (query || "").trim().toLowerCase();

  // Try remote API first
  try {
    const url = q
      ? `${REGISTRY_API}/search?q=${encodeURIComponent(query)}`
      : `${REGISTRY_API}/search`;
    const resp = await fetchImpl(url, { signal: AbortSignal.timeout(5000) });
    if (resp.ok) {
      const data = await resp.json();
      if (Array.isArray(data?.servers) && data.servers.length > 0) {
        return data.servers.map(normalizeRegistryEntry);
      }
    }
  } catch {
    // Remote unavailable, fall through to built-in
  }

  // Built-in fallback
  const results = BUILTIN_SERVERS.filter((s) => {
    if (!q) return true;
    return (
      s.name.toLowerCase().includes(q) ||
      s.description.toLowerCase().includes(q) ||
      s.id.toLowerCase().includes(q) ||
      s.category.toLowerCase().includes(q)
    );
  });
  return results.map((s) => ({
    id: s.id,
    name: s.name,
    description: s.description,
    transport: s.transport,
    command: s.command,
    args: s.args,
    envHints: s.envHints,
    category: s.category,
    source: "builtin",
  }));
}

/**
 * Get details for a specific server by ID.
 */
export async function getRegistryServerDetail(serverId, { fetchImpl = globalThis.fetch } = {}) {
  // Try remote first
  try {
    const resp = await fetchImpl(`${REGISTRY_API}/servers/${encodeURIComponent(serverId)}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (resp.ok) {
      return normalizeRegistryEntry(await resp.json());
    }
  } catch {
    // Fall through
  }

  // Built-in fallback
  const found = BUILTIN_SERVERS.find((s) => s.id === serverId);
  if (found) {
    return { ...found, source: "builtin" };
  }
  return null;
}

/**
 * Get all available categories from built-in servers.
 */
export function getRegistryCategories() {
  const cats = new Set(BUILTIN_SERVERS.map((s) => s.category));
  return [...cats].sort();
}

function normalizeRegistryEntry(entry) {
  return {
    id: entry.id || entry.name || "",
    name: entry.name || entry.id || "",
    description: entry.description || "",
    transport: entry.transport || "stdio",
    command: entry.command || "",
    args: Array.isArray(entry.args) ? entry.args : [],
    envHints: Array.isArray(entry.envHints) ? entry.envHints : [],
    category: entry.category || "other",
    source: "registry",
  };
}
