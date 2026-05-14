export function useScheduler() {
  return {
    isRunning: false,
    start: () => undefined,
    stop: () => undefined
  };
}
