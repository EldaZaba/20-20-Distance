import { useEffect, useState } from 'react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { invoke } from '@tauri-apps/api/core';
import { enable, isEnabled } from '@tauri-apps/plugin-autostart';
import OverlayTimer from './components/OverlayTimer';
import Settings from './components/Settings';
import { loadSettings } from './lib/storage';

const App = () => {
  const [label, setLabel] = useState('overlay');

  useEffect(() => {
    try {
      const current = getCurrentWindow();
      setLabel(current.label);
    } catch {
      setLabel('overlay');
    }
  }, []);

  useEffect(() => {
    const settings = loadSettings();
    invoke('set_interval', { minutes: settings.intervalMinutes }).catch(() => undefined);
    isEnabled()
      .then((enabled) => {
        if (!enabled) return enable();
        return undefined;
      })
      .catch(() => undefined);
  }, []);

  return label === 'settings' ? <Settings /> : <OverlayTimer />;
};

export default App;
