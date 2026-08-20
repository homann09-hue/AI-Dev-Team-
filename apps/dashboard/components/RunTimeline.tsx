export interface TimelineEvent {
  time: string;
  agent: string;
  status: string;
  summary: string;
}

export function RunTimeline({ events }: { events: TimelineEvent[] }) {
  return events.map((event) => ({
    time: event.time,
    title: `${event.agent}: ${event.status}`,
    summary: event.summary,
  }));
}
