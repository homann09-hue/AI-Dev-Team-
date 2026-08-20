export interface TimelineEvent {
  type: string;
  timestamp: string;
  message: string;
}

export function buildTimeline(events: TimelineEvent[]): TimelineEvent[] {
  return [...events].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}
