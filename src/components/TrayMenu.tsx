import { Card, CardContent, List, ListItem, ListItemIcon, ListItemText, Typography } from '@mui/material';
import SettingsIcon from '@mui/icons-material/Settings';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import MusicNoteIcon from '@mui/icons-material/MusicNote';
import BarChartIcon from '@mui/icons-material/BarChart';
import ExitToAppIcon from '@mui/icons-material/ExitToApp';
import { useSettings, useStats } from '../lib/hooks';

const TrayMenu = () => {
  const { settings } = useSettings();
  const { stats } = useStats();

  return (
    <Card className="glass-card">
      <CardContent>
        <Typography variant="h6" gutterBottom>
          Tray Menu Preview
        </Typography>
        <List dense>
          <ListItem>
            <ListItemIcon>
              <SettingsIcon />
            </ListItemIcon>
            <ListItemText primary="Settings" secondary="Opens this settings window" />
          </ListItem>
          <ListItem>
            <ListItemIcon>
              <AccessTimeIcon />
            </ListItemIcon>
            <ListItemText
              primary={`Interval: ${settings.intervalMinutes} min`}
              secondary="Quick change from 1 to 60 min"
            />
          </ListItem>
          <ListItem>
            <ListItemIcon>
              <MusicNoteIcon />
            </ListItemIcon>
            <ListItemText
              primary={settings.soundEnabled ? 'Sound: On' : 'Sound: Off'}
              secondary="Toggles reminder audio"
            />
          </ListItem>
          <ListItem>
            <ListItemIcon>
              <BarChartIcon />
            </ListItemIcon>
            <ListItemText
              primary={`Progress: ${stats.points} points`}
              secondary="Streak and daily summary"
            />
          </ListItem>
          <ListItem>
            <ListItemIcon>
              <ExitToAppIcon />
            </ListItemIcon>
            <ListItemText primary="Quit" secondary="Closes the app" />
          </ListItem>
        </List>
      </CardContent>
    </Card>
  );
};

export default TrayMenu;
