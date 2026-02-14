export const formatCountdown = (seconds: number | null): string => {
  if (seconds === null || Number.isNaN(seconds)) {
    return '--:--';
  }

  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remaining = safeSeconds % 60;
  return `${minutes}:${remaining.toString().padStart(2, '0')}`;
};
