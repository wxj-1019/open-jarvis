export interface BackupRecord {
  filename: string;
  agentId: string;
  agentName: string;
  size: number;
  createdAt: string;
  checksum: string;
}

export interface BackupConfig {
  enabled: boolean;
  frequency: 'daily' | 'weekly' | 'monthly';
  time: string;
  retainCount: number;
}

export interface BackupApiResponse {
  success: boolean;
  backup?: BackupRecord;
  backups?: BackupRecord[];
  config?: BackupConfig;
  error?: string;
}
