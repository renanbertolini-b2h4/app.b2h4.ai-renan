export type ChangelogEntryType = 'feature' | 'fix' | 'improvement';

export interface ChangelogEntry {
  id: string;
  version: string;
  date: string;
  type: ChangelogEntryType;
  title: string;
  description: string;
  icon?: string;
  details?: string[];
  screens?: string[];
  docLink?: string;
  docTitle?: string;
}

export interface ChangelogData {
  version: string;
  entries: ChangelogEntry[];
}

export interface ChangelogGroup {
  key: string;
  label: string;
  entries: ChangelogEntry[];
}
