import { useEffect, useState } from 'react';
import { listen } from '@tauri-apps/api/event';
import {
  Settings,
  Stats,
  applySettingsUpdate,
  loadSettings,
  loadStats,
  saveStats
} from './storage';

export const useSettings = () => {
  const [settings, setSettings] = useState<Settings>(loadSettings());

  const updateSettings = (partial: Partial<Settings>) => {
    const next = applySettingsUpdate(partial);
    setSettings(next);
    return next;
  };

  useEffect(() => {
    const unlistenUpdate = listen<Partial<Settings>>('settings:update', (event) => {
      updateSettings(event.payload ?? {});
    });

    const unlistenToggle = listen('settings:toggleSound', () => {
      const current = loadSettings();
      updateSettings({ soundEnabled: !current.soundEnabled });
    });

    return () => {
      void unlistenUpdate.then((fn) => fn());
      void unlistenToggle.then((fn) => fn());
    };
  }, []);

  return { settings, updateSettings };
};

export const useStats = () => {
  const [stats, setStats] = useState<Stats>(loadStats());

  const refreshStats = () => {
    const next = loadStats();
    setStats(next);
    return next;
  };

  const updateStats = (next: Stats) => {
    saveStats(next);
    setStats(next);
  };

  return { stats, refreshStats, updateStats };
};

type TimerTick = {
  remainingSeconds: number;
  totalSeconds: number;
};

export const useTimer = () => {
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [totalSeconds, setTotalSeconds] = useState<number | null>(null);

  useEffect(() => {
    const unlistenTick = listen<TimerTick>('timer:tick', (event) => {
      const payload = event.payload;
      if (!payload) return;
      setRemainingSeconds(payload.remainingSeconds);
      setTotalSeconds(payload.totalSeconds);
    });

    return () => {
      void unlistenTick.then((fn) => fn());
    };
  }, []);

  return { remainingSeconds, totalSeconds };
};
