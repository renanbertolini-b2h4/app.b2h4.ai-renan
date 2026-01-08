import { useState, useEffect, useMemo, useCallback } from 'react';
import changelogData from '../data/changelog.json';
import type { ChangelogEntry, ChangelogGroup } from '../types/changelog';

const STORAGE_KEY = 'changelog_last_seen_version';

function formatMonthYear(key: string): string {
  const [year, month] = key.split('-');
  const months = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
  ];
  return `${months[parseInt(month, 10) - 1]} de ${year}`;
}

export function useChangelog() {
  const [lastSeenVersion, setLastSeenVersion] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    setLastSeenVersion(stored);
    setIsLoaded(true);
  }, []);

  const entries = useMemo(() => {
    return changelogData.entries as ChangelogEntry[];
  }, []);

  const unreadCount = useMemo(() => {
    if (!isLoaded) return 0;
    if (!lastSeenVersion) return entries.length;
    return entries.filter(entry => entry.version > lastSeenVersion).length;
  }, [lastSeenVersion, entries, isLoaded]);

  const groupedEntries = useMemo((): ChangelogGroup[] => {
    const groups: Record<string, ChangelogEntry[]> = {};
    
    entries.forEach(entry => {
      const date = new Date(entry.date);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(entry);
    });

    return Object.entries(groups)
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([key, groupEntries]) => ({
        key,
        label: formatMonthYear(key),
        entries: groupEntries.sort((a, b) => b.date.localeCompare(a.date))
      }));
  }, [entries]);

  const markAsRead = useCallback(() => {
    localStorage.setItem(STORAGE_KEY, changelogData.version);
    setLastSeenVersion(changelogData.version);
  }, []);

  const openModal = useCallback(() => {
    setIsModalOpen(true);
    markAsRead();
  }, [markAsRead]);

  const closeModal = useCallback(() => {
    setIsModalOpen(false);
  }, []);

  return {
    entries,
    groupedEntries,
    unreadCount,
    isModalOpen,
    openModal,
    closeModal,
    currentVersion: changelogData.version
  };
}
