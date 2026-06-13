export type Settings = {
  intervalMinutes: number;
  soundEnabled: boolean;
  timeLimitMinutes: number;
};

export type DailyStats = {
  sessions: number;
  points: number;
};

export type Stats = {
  streak: number;
  points: number;
  totalSessions: number;
  lastCompletedDate: string | null;
  daily: Record<string, DailyStats>;
};

const SETTINGS_KEY = '2020.settings';
const STATS_KEY = '2020.stats';

const DEFAULT_SETTINGS: Settings = {
  intervalMinutes: 20,
  soundEnabled: true,
  timeLimitMinutes: 0
};

const DEFAULT_STATS: Stats = {
  streak: 0,
  points: 0,
  totalSessions: 0,
  lastCompletedDate: null,
  daily: {}
};

export const getTodayKey = (date = new Date()): string => {
  return date.toISOString().slice(0, 10);
};

const isYesterday = (prev: string, next: string): boolean => {
  const prevDate = new Date(prev + 'T00:00:00');
  const nextDate = new Date(next + 'T00:00:00');
  const diff = nextDate.getTime() - prevDate.getTime();
  return diff === 24 * 60 * 60 * 1000;
};

export const loadSettings = (): Settings => {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Settings;
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_SETTINGS;
  }
};

export const saveSettings = (settings: Settings): void => {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
};

export const applySettingsUpdate = (partial: Partial<Settings>): Settings => {
  const current = loadSettings();
  const next = { ...current, ...partial };
  saveSettings(next);
  return next;
};

export const loadStats = (): Stats => {
  try {
    const raw = localStorage.getItem(STATS_KEY);
    if (!raw) return DEFAULT_STATS;
    const parsed = JSON.parse(raw) as Stats;
    return { ...DEFAULT_STATS, ...parsed, daily: parsed.daily ?? {} };
  } catch {
    return DEFAULT_STATS;
  }
};

export const saveStats = (stats: Stats): void => {
  localStorage.setItem(STATS_KEY, JSON.stringify(stats));
};

export const updateStatsOnComplete = (): Stats => {
  const stats = loadStats();
  const today = getTodayKey();

  if (!stats.lastCompletedDate) {
    stats.streak = 1;
  } else if (stats.lastCompletedDate === today) {
    // streak remains unchanged
  } else if (isYesterday(stats.lastCompletedDate, today)) {
    stats.streak += 1;
  } else {
    stats.streak = 1;
  }

  stats.lastCompletedDate = today;
  stats.totalSessions += 1;
  stats.points += 10;

  const daily = stats.daily[today] ?? { sessions: 0, points: 0 };
  daily.sessions += 1;
  daily.points += 10;
  stats.daily[today] = daily;

  saveStats(stats);
  return stats;
};
