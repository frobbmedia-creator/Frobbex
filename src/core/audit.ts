export interface AuditEvent {
  timestamp: number;
  correlationId: string;
  tool: string;
  targetClass: "browser" | "computer" | "bridge";
  resultCode: string;
  durationMs: number;
}

export class AuditLogger {
  constructor(private readonly sink: (event: AuditEvent) => void = defaultSink) {}

  record(event: AuditEvent): void {
    this.sink({
      timestamp: event.timestamp,
      correlationId: event.correlationId,
      tool: event.tool,
      targetClass: event.targetClass,
      resultCode: event.resultCode,
      durationMs: event.durationMs,
    });
  }
}

function defaultSink(event: AuditEvent): void {
  process.stderr.write(`${JSON.stringify(event)}\n`);
}
