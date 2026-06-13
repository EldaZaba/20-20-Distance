import { ChangeEvent, KeyboardEvent, MouseEvent, useEffect, useState } from 'react';
import {
  Card,
  CardContent,
  Chip,
  Divider,
  FormControlLabel,
  LinearProgress,
  Button,
  Stack,
  Switch,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography
} from '@mui/material';
import { emit, listen } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import {
  isPermissionGranted,
  requestPermission,
  sendNotification
} from '@tauri-apps/plugin-notification';
import TrayMenu from './TrayMenu';
import { useSettings, useStats, useTimer } from '../lib/hooks';
import { formatCountdown } from '../lib/time';
import { getTodayKey } from '../lib/storage';

const INTERVALS = [1, 10, 20, 30, 45, 60];

const Settings = () => {
  const { settings, updateSettings } = useSettings();
  const { stats, refreshStats } = useStats();
  const { remainingSeconds, totalSeconds, paused } = useTimer();
  const [audioDir, setAudioDir] = useState<string>('');
  const [notificationPermission, setNotificationPermission] = useState<
    NotificationPermission | 'unsupported'
  >('default');
  const [customInterval, setCustomInterval] = useState('');
  const [timeLimitInput, setTimeLimitInput] = useState(
    settings.timeLimitMinutes > 0 ? String(settings.timeLimitMinutes) : '120'
  );

  useEffect(() => {
    const unlisten = listen('settings:open', () => {
      refreshStats();
    });

    return () => {
      void unlisten.then((fn) => fn());
    };
  }, [refreshStats]);

  useEffect(() => {
    invoke<string | null>('get_audio_dir')
      .then((dir) => {
        if (dir) setAudioDir(dir);
      })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    isPermissionGranted()
      .then((granted) => {
        setNotificationPermission(granted ? 'granted' : 'default');
      })
      .catch(() => {
        setNotificationPermission('unsupported');
      });
  }, []);

  const applyInterval = async (minutes: number) => {
    if (!minutes || minutes < 1) return;
    const next = updateSettings({ intervalMinutes: minutes });
    void emit('settings:update', { intervalMinutes: next.intervalMinutes });
    try {
      await invoke('set_interval', { minutes });
    } catch {
      // backend may be busy
    }
  };

  const handleIntervalChange = async (_: MouseEvent<HTMLElement>, value: number | null) => {
    if (!value) return;
    await applyInterval(value);
    setCustomInterval('');
  };

  const handleCustomIntervalApply = async () => {
    const value = parseInt(customInterval, 10);
    if (isNaN(value) || value < 1) return;
    await applyInterval(value);
    setCustomInterval('');
  };

  const handleCustomIntervalKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') void handleCustomIntervalApply();
  };

  const applyTimeLimitInput = () => {
    const v = parseInt(timeLimitInput, 10);
    if (v >= 1) {
      const next = updateSettings({ timeLimitMinutes: v });
      void emit('settings:update', { timeLimitMinutes: next.timeLimitMinutes });
    } else {
      setTimeLimitInput(String(settings.timeLimitMinutes || 120));
    }
  };

  const handleTimeLimitKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') applyTimeLimitInput();
  };

  const handleTimeLimitToggle = (_: ChangeEvent<HTMLInputElement>, checked: boolean) => {
    const minutes = checked ? (parseInt(timeLimitInput, 10) || 120) : 0;
    if (checked && !timeLimitInput) setTimeLimitInput('120');
    const next = updateSettings({ timeLimitMinutes: minutes });
    void emit('settings:update', { timeLimitMinutes: next.timeLimitMinutes });
  };

  const handleSoundChange = (_: ChangeEvent<HTMLInputElement>, checked: boolean) => {
    const next = updateSettings({ soundEnabled: checked });
    void emit('settings:update', { soundEnabled: next.soundEnabled });
  };

  const handleResetTimer = async () => {
    try {
      await invoke('reset_timer');
    } catch {
      // backend may be busy
    }
  };

  const handleToggleTimer = async () => {
    try {
      await invoke(paused ? 'resume_timer' : 'pause_timer');
    } catch {
      // backend may be busy
    }
  };

  const handleEnableNotifications = async () => {
    try {
      const permission = await requestPermission();
      setNotificationPermission(permission);
      if (permission === 'granted') {
        sendNotification({ title: '20-20 Break', body: 'Notifications are enabled.' });
      }
    } catch {
      setNotificationPermission('unsupported');
    }
  };

  const handleTestNotification = () => {
    if (notificationPermission === 'granted') {
      sendNotification({ title: '20-20 Break', body: 'Test notification.' });
    }
  };

  const todayKey = getTodayKey();
  const today = stats.daily[todayKey] ?? { sessions: 0, points: 0 };
  const countdownLabel = formatCountdown(remainingSeconds);
  const progress =
    totalSeconds && remainingSeconds !== null && totalSeconds > 0
      ? ((totalSeconds - remainingSeconds) / totalSeconds) * 100
      : null;
  const notificationStatusLabel =
    notificationPermission === 'granted'
      ? 'Enabled'
      : notificationPermission === 'denied'
        ? 'Blocked'
        : notificationPermission === 'default'
          ? 'Not granted'
          : 'Unsupported';

  return (
    <div className="app-shell">
      <div className="app-bg-orb app-bg-orb-left" />
      <div className="app-bg-orb app-bg-orb-right" />
      <div className="relative mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-8 sm:px-6">
        <div className="mb-1">
          <Typography variant="h4" gutterBottom>
            20-20 Distance
          </Typography>
          <Typography variant="body2" color="text.secondary">
            The app runs in the tray. Open this window anytime to update reminders and sound.
          </Typography>
        </div>

        <Card className="glass-card">
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Next Break
            </Typography>
            <Typography variant="h3">{countdownLabel}</Typography>
            {progress !== null && (
              <div className="mt-3">
                <LinearProgress variant="determinate" value={progress} />
              </div>
            )}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button variant="outlined" size="small" onClick={handleResetTimer}>
                Reset Countdown
              </Button>
              <Button
                variant="contained"
                size="small"
                color={paused ? 'success' : 'warning'}
                onClick={handleToggleTimer}
              >
                {paused ? 'Resume Timer' : 'Pause Timer'}
              </Button>
              <Chip
                size="small"
                color={paused ? 'warning' : 'success'}
                label={paused ? 'Paused' : 'Running'}
              />
            </div>
            <Typography variant="caption" color="text.secondary" display="block" className="mt-2">
              Time remaining until your next 20-second break.
            </Typography>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Reminder Interval
            </Typography>
            <ToggleButtonGroup
              color="primary"
              value={settings.intervalMinutes}
              exclusive
              onChange={handleIntervalChange}
              className="flex-wrap gap-2"
            >
              {INTERVALS.map((minutes) => (
                <ToggleButton key={minutes} value={minutes} className="min-w-[68px]">
                  {minutes} min
                </ToggleButton>
              ))}
            </ToggleButtonGroup>
            <div className="mt-3 flex items-center gap-2">
              <TextField
                size="small"
                label="Custom (min)"
                type="number"
                value={customInterval}
                onChange={(e) => setCustomInterval(e.target.value)}
                onKeyDown={handleCustomIntervalKeyDown}
                inputProps={{ min: 1, max: 480 }}
                sx={{ width: 140 }}
              />
              <Button size="small" variant="outlined" onClick={() => void handleCustomIntervalApply()}>
                Set
              </Button>
            </div>
            <Typography variant="caption" color="text.secondary" display="block" className="mt-2">
              Current: {settings.intervalMinutes} min — changes apply after the current cycle ends.
            </Typography>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Sound
            </Typography>
            <FormControlLabel
              control={<Switch checked={settings.soundEnabled} onChange={handleSoundChange} />}
              label={settings.soundEnabled ? 'Sound enabled' : 'Muted'}
            />
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardContent>
            <Typography variant="h6" gutterBottom>
              PC Time Limit
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Dostaneš upozornění se zvukem, když jsi na PC stanovenou dobu.
            </Typography>
            <FormControlLabel
              control={
                <Switch
                  checked={settings.timeLimitMinutes > 0}
                  onChange={handleTimeLimitToggle}
                />
              }
              label={settings.timeLimitMinutes > 0 ? 'Enabled' : 'Disabled'}
              className="mt-2"
            />
            {settings.timeLimitMinutes > 0 && (
              <div className="mt-3 flex items-center gap-3">
                <TextField
                  size="small"
                  label="Minutes"
                  type="number"
                  value={timeLimitInput}
                  onChange={(e) => setTimeLimitInput(e.target.value)}
                  onBlur={applyTimeLimitInput}
                  onKeyDown={handleTimeLimitKeyDown}
                  inputProps={{ min: 1, max: 1440 }}
                  sx={{ width: 120 }}
                />
                <Typography variant="body2" color="text.secondary">
                  {settings.timeLimitMinutes >= 60
                    ? `${Math.floor(settings.timeLimitMinutes / 60)}h${settings.timeLimitMinutes % 60 > 0 ? ` ${settings.timeLimitMinutes % 60}min` : ''}`
                    : `${settings.timeLimitMinutes} min`}
                </Typography>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Notifications
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Status: {notificationStatusLabel}
            </Typography>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Button
                variant="outlined"
                size="small"
                onClick={handleEnableNotifications}
                disabled={notificationPermission === 'granted'}
              >
                Enable Notifications
              </Button>
              <Button
                variant="outlined"
                size="small"
                onClick={handleTestNotification}
                disabled={notificationPermission !== 'granted'}
              >
                Send Test Notification
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Progress
            </Typography>
            <Stack direction="row" spacing={2} flexWrap="wrap">
              <Chip label={`Streak: ${stats.streak} days`} color="primary" />
              <Chip label={`Points: ${stats.points}`} />
              <Chip label={`Sessions total: ${stats.totalSessions}`} />
              <Chip label={`Today: ${today.sessions} sessions (${today.points} points)`} />
            </Stack>
          </CardContent>
        </Card>

        <Divider />

        <Card className="glass-card">
          <CardContent>
            <Typography variant="h6" gutterBottom>
              Custom Sound
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Put an `alert.wav` file in the project's `sounds` folder. It will play on break start.
            </Typography>
            <div className="mt-3 rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-xs font-mono text-white/80">
              {audioDir || 'Loading...'}
            </div>
          </CardContent>
        </Card>

        <TrayMenu />
      </div>
    </div>
  );
};

export default Settings;
