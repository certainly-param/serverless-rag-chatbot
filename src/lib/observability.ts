/**
 * Observability helpers: OpenTelemetry spans (Node runtime) and Langfuse (Edge/Node).
 * Use in API routes to add resume-relevant tracing.
 */
import { trace } from "@opentelemetry/api";

const TRACER_NAME = "serverless-rag";

export function getTracer() {
  return trace.getTracer(TRACER_NAME, "1.0.0");
}

/**
 * Run a function inside an OpenTelemetry span (Node.js only; no-op in Edge).
 */
export async function withSpan<T>(
  name: string,
  attrs: Record<string, string | number | boolean> | undefined,
  fn: () => Promise<T>
): Promise<T> {
  if (typeof process === "undefined" || process.env.NEXT_RUNTIME === "edge") {
    return fn();
  }
  const tracer = getTracer();
  const span = tracer.startSpan(name, { attributes: attrs as never });
  try {
    const result = await fn();
    span.setStatus({ code: 1 }); // OK
    return result;
  } catch (err) {
    span.setStatus({ code: 2, message: String(err) }); // ERROR
    span.recordException(err as Error);
    throw err;
  } finally {
    span.end();
  }
}
