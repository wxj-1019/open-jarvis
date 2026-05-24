const MCP_PRESETS = [
  {
    id: "google-calendar",
    name: "Google Calendar",
    description: "Access and manage Google Calendar events, schedules, and reminders",
    category: "calendar",
    icon: "calendar",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-google-calendar"],
    envSchema: {
      GOOGLE_CLIENT_ID: { label: "Google Client ID", required: true, type: "string", secret: false },
      GOOGLE_CLIENT_SECRET: { label: "Google Client Secret", required: true, type: "string", secret: true },
    },
    oauthScopes: [
      "https://www.googleapis.com/auth/calendar.readonly",
      "https://www.googleapis.com/auth/calendar.events",
    ],
    autoStart: false,
    authType: "oauth",
  },
  {
    id: "gmail",
    name: "Gmail",
    description: "Read, send, and manage Gmail emails",
    category: "email",
    icon: "mail",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-gmail"],
    envSchema: {
      GOOGLE_CLIENT_ID: { label: "Google Client ID", required: true, type: "string", secret: false },
      GOOGLE_CLIENT_SECRET: { label: "Google Client Secret", required: true, type: "string", secret: true },
    },
    oauthScopes: [
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/gmail.send",
      "https://www.googleapis.com/auth/gmail.modify",
    ],
    autoStart: false,
    authType: "oauth",
  },
  {
    id: "outlook-mail",
    name: "Outlook Mail",
    description: "Access and manage Outlook/Office 365 emails",
    category: "email",
    icon: "mail",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@microsoft/mcp-server-mail"],
    envSchema: {
      AZURE_CLIENT_ID: { label: "Azure Client ID", required: true, type: "string", secret: false },
      AZURE_CLIENT_SECRET: { label: "Azure Client Secret", required: true, type: "string", secret: true },
      AZURE_TENANT_ID: { label: "Azure Tenant ID", required: true, type: "string", secret: false },
    },
    oauthScopes: [
      "Mail.Read",
      "Mail.Send",
      "Mail.ReadWrite",
    ],
    autoStart: false,
    authType: "oauth",
  },
  {
    id: "outlook-calendar",
    name: "Outlook Calendar",
    description: "Access and manage Outlook/Office 365 calendar events",
    category: "calendar",
    icon: "calendar",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@microsoft/mcp-server-calendar"],
    envSchema: {
      AZURE_CLIENT_ID: { label: "Azure Client ID", required: true, type: "string", secret: false },
      AZURE_CLIENT_SECRET: { label: "Azure Client Secret", required: true, type: "string", secret: true },
      AZURE_TENANT_ID: { label: "Azure Tenant ID", required: true, type: "string", secret: false },
    },
    oauthScopes: [
      "Calendars.Read",
      "Calendars.ReadWrite",
    ],
    autoStart: false,
    authType: "oauth",
  },
];

export function getMcpPresets() {
  return MCP_PRESETS;
}

export function getPresetById(id) {
  return MCP_PRESETS.find((p) => p.id === id) || null;
}

export function getPresetsByCategory(category) {
  return MCP_PRESETS.filter((p) => p.category === category);
}
