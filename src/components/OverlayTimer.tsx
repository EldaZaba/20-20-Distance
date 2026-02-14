import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Chip, LinearProgress } from '@mui/material';
import { listen } from '@tauri-apps/api/event';
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { useSettings, useTimer } from '../lib/hooks';
import { formatCountdown } from '../lib/time';
import { loadSettings, updateStatsOnComplete } from '../lib/storage';
import {
  isPermissionGranted,
  requestPermission,
  sendNotification
} from '@tauri-apps/plugin-notification';

const OVERLAY_SECONDS = 20;
const INTERVALS = [1, 10, 20, 30, 45, 60];
const SAMPLE_SIZE = { w: 160, h: 120 };
const SOUND_LIMIT_MS = 20_000;

const playTone = () => {
  try {
    const audio = new AudioContext();
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = 'sine';
    osc.frequency.value = 528;
    gain.gain.value = 0.05;
    osc.connect(gain);
    gain.connect(audio.destination);
    osc.start();
    osc.stop(audio.currentTime + 0.3);
    osc.onended = () => audio.close();
  } catch {
    // sound is optional
  }
};

const OverlayTimer = () => {
  const { settings, updateSettings } = useSettings();
  const { remainingSeconds } = useTimer();
  const [active, setActive] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(OVERLAY_SECONDS);
  const [motionDetected, setMotionDetected] = useState(false);
  const [cameraStatus, setCameraStatus] = useState<'idle' | 'active' | 'denied'>('idle');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const motionIntervalRef = useRef<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioStopTimeoutRef = useRef<number | null>(null);

  const progress = useMemo(() => (secondsLeft / OVERLAY_SECONDS) * 100, [secondsLeft]);
  const countdownLabel = formatCountdown(remainingSeconds);

  const setIntervalMinutes = useCallback(
    async (minutes: number) => {
      updateSettings({ intervalMinutes: minutes });
      try {
        await invoke('set_interval', { minutes });
      } catch {
        // backend may be busy
      }
    },
    [updateSettings]
  );

  const handleResetTimer = useCallback(async () => {
    try {
      await invoke('reset_timer');
    } catch {
      // backend may be busy
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (motionIntervalRef.current) {
      window.clearInterval(motionIntervalRef.current);
      motionIntervalRef.current = null;
    }
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }
  }, []);

  const startCamera = useCallback(async () => {
    stopCamera();
    setCameraStatus('idle');
    setMotionDetected(false);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (!videoRef.current) return;

      videoRef.current.srcObject = stream;
      await videoRef.current.play();
      setCameraStatus('active');

      const canvas = document.createElement('canvas');
      canvas.width = SAMPLE_SIZE.w;
      canvas.height = SAMPLE_SIZE.h;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;

      let lastFrame: Uint8ClampedArray | null = null;
      let hitCount = 0;

      motionIntervalRef.current = window.setInterval(() => {
        if (!videoRef.current) return;
        ctx.drawImage(videoRef.current, 0, 0, SAMPLE_SIZE.w, SAMPLE_SIZE.h);
        const frame = ctx.getImageData(0, 0, SAMPLE_SIZE.w, SAMPLE_SIZE.h).data;

        if (lastFrame) {
          let diff = 0;
          for (let i = 0; i < frame.length; i += 4) {
            diff += Math.abs(frame[i] - lastFrame[i]);
            diff += Math.abs(frame[i + 1] - lastFrame[i + 1]);
            diff += Math.abs(frame[i + 2] - lastFrame[i + 2]);
          }

          const avgDiff = diff / (frame.length / 4 * 3);
          if (avgDiff > 12) {
            hitCount += 1;
          } else {
            hitCount = Math.max(0, hitCount - 1);
          }

          if (hitCount >= 3) {
            setMotionDetected(true);
          }
        }

        lastFrame = frame.slice();
      }, 250);
    } catch {
      setCameraStatus('denied');
    }
  }, [stopCamera]);

  const stopActiveAudio = useCallback(() => {
    if (audioStopTimeoutRef.current !== null) {
      window.clearTimeout(audioStopTimeoutRef.current);
      audioStopTimeoutRef.current = null;
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
  }, []);

  const playCustomSound = useCallback(async () => {
    try {
      const path = await invoke<string | null>('get_audio_file');
      if (!path) return false;
      stopActiveAudio();
      const audio = new Audio(convertFileSrc(path));
      audioRef.current = audio;
      audio.volume = 1;
      audioStopTimeoutRef.current = window.setTimeout(() => {
        if (audioRef.current === audio) {
          audio.pause();
          audio.currentTime = 0;
          audioRef.current = null;
        }
      }, SOUND_LIMIT_MS);
      const clearStopTimer = () => {
        if (audioStopTimeoutRef.current !== null) {
          window.clearTimeout(audioStopTimeoutRef.current);
          audioStopTimeoutRef.current = null;
        }
        if (audioRef.current === audio) {
          audioRef.current = null;
        }
      };
      audio.onended = clearStopTimer;
      audio.onerror = clearStopTimer;
      await audio.play();
      return true;
    } catch {
      return false;
    }
  }, [stopActiveAudio]);

  const showNotification = useCallback(async () => {
    try {
      let permissionGranted = await isPermissionGranted();
      if (!permissionGranted) {
        const permission = await requestPermission();
        permissionGranted = permission === 'granted';
      }
      if (permissionGranted) {
        sendNotification({ title: '20-20 Break', body: 'Look 20 meters away for 20 seconds.' });
      }
    } catch {
      // ignore
    }
  }, []);

  const handleTimerElapsed = useCallback(async () => {
    const { soundEnabled } = loadSettings();
    if (soundEnabled) {
      const played = await playCustomSound();
      if (!played) playTone();
    }
    await showNotification();
    updateStatsOnComplete();
  }, [playCustomSound, showNotification, updateStatsOnComplete]);

  const completeSession = useCallback(async () => {
    stopCamera();
    setActive(false);

    try {
      await invoke('session_complete');
    } catch {
      // backend may be busy, but the session can still end
    }

    try {
      await getCurrentWindow().hide();
    } catch {
      // ok
    }
  }, [stopCamera]);

  useEffect(() => {
    if (!active) return;

    const interval = window.setInterval(() => {
      setSecondsLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => window.clearInterval(interval);
  }, [active]);

  useEffect(() => {
    if (!active) return;
    startCamera();
    return () => stopCamera();
  }, [active, startCamera, stopCamera]);

  useEffect(() => {
    return () => stopActiveAudio();
  }, [stopActiveAudio]);

  useEffect(() => {
    if (!settings.soundEnabled) {
      stopActiveAudio();
    }
  }, [settings.soundEnabled, stopActiveAudio]);

  useEffect(() => {
    const unlistenShow = listen('overlay:show', () => {
      setActive(true);
      setSecondsLeft(OVERLAY_SECONDS);
      setMotionDetected(false);
      setCameraStatus('idle');
    });

    const unlistenHide = listen('overlay:hide', () => {
      setActive(false);
      stopCamera();
    });

    return () => {
      void unlistenShow.then((fn) => fn());
      void unlistenHide.then((fn) => fn());
    };
  }, [stopCamera]);

  useEffect(() => {
    const unlistenElapsed = listen('timer:elapsed', () => {
      void handleTimerElapsed();
    });

    return () => {
      void unlistenElapsed.then((fn) => fn());
    };
  }, [handleTimerElapsed]);

  useEffect(() => {
    if (!active) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        void completeSession();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [active, completeSession]);

  if (!active) {
    return (
      <div className="app-shell flex h-full w-full items-center justify-center px-6 text-white/80">
        <div className="app-bg-orb app-bg-orb-left" />
        <div className="app-bg-orb app-bg-orb-right" />
        <div className="relative w-full max-w-2xl rounded-3xl border border-white/15 bg-[#14161e]/85 p-8 text-center shadow-[0_20px_80px_rgba(0,0,0,0.5)] backdrop-blur">
          <div className="text-base">
            The app is running in the background. Your next reminder will appear automatically.
          </div>

          <div className="mt-6 text-sm text-white/60">Quick interval change</div>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            {INTERVALS.map((minutes) => (
              <Button
                key={minutes}
                variant={minutes === settings.intervalMinutes ? 'contained' : 'outlined'}
                color="primary"
                size="small"
                onClick={() => void setIntervalMinutes(minutes)}
              >
                {minutes} min
              </Button>
            ))}
          </div>
          <div className="mt-3 text-xs text-white/50">
            Current interval: {settings.intervalMinutes} min
          </div>
          <div className="mt-2 text-xs text-white/40">Time left: {countdownLabel}</div>
          <div className="mt-4">
            <Button variant="outlined" size="small" onClick={() => void handleResetTimer()}>
              Reset Countdown
            </Button>
          </div>
        </div>
        <video ref={videoRef} className="hidden" />
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 px-6">
      <div className="overlay-panel w-full max-w-3xl rounded-3xl border border-white/15 bg-[#12151d]/95 p-8 text-center md:p-10">
        <div className="text-3xl md:text-5xl font-semibold tracking-wide">
          LOOK 20 METERS AWAY FOR 20 SECONDS
        </div>

        <div className="mt-6 text-7xl font-bold">{secondsLeft}s</div>

        <div className="mt-4">
          <LinearProgress variant="determinate" value={progress} />
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          {cameraStatus === 'active' && (
            <Chip label="Camera active" color="primary" size="small" />
          )}
          {cameraStatus === 'denied' && (
            <Chip label="Camera unavailable" color="warning" size="small" />
          )}
          {motionDetected && (
            <Chip label="Movement detected" color="success" size="small" />
          )}
        </div>

        <div className="mt-8 flex flex-col items-center gap-3">
          <Button
            variant="contained"
            color="primary"
            size="large"
            onClick={() => void completeSession()}
          >
            Done
          </Button>
          <span className="text-sm text-white/60">Press ESC to close quickly</span>
        </div>

        <video ref={videoRef} className="hidden" />
      </div>
    </div>
  );
};

export default OverlayTimer;
