/**
 * Tiny structured-log helper. One JSON line per event so we can grep + aggregate
 * later (`tail -f | jq`). No external deps; the goal is uniformity, not a full
 * tracing stack. Per spec D6.
 */

export interface IngestEvent {
  event: string;
  documentId: string;
  [k: string]: unknown;
}

export interface ChatEvent {
  event: string;
  [k: string]: unknown;
}

export function logIngest(event: IngestEvent): void {
  // eslint-disable-next-line no-console
  console.info('[ingest]', JSON.stringify(event));
}

export function logChat(event: ChatEvent): void {
  // eslint-disable-next-line no-console
  console.info('[chat]', JSON.stringify(event));
}
