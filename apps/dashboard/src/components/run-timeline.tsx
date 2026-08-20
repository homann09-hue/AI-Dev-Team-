export interface TimelineEvent {
  id: string;
  type: string;
  agent?: string;
  createdAt: string;
}

export function RunTimeline({ events }: { events: TimelineEvent[] }) {
  return (
    <ol>
      {events.map((event) => (
        <li key={event.id}>
          <strong>{event.type}</strong>
          {event.agent ? ` - ${event.agent}` : ''}
          <time>{event.createdAt}</time>
        </li>
      ))}
    </ol>
  );
}
