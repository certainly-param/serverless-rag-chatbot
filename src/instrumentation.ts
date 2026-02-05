/**
 * Next.js instrumentation: OpenTelemetry tracing.
 * Export: set OTEL_EXPORTER_OTLP_TRACES_ENDPOINT (and optional OTEL_* vars) or use Vercel's tracing integration.
 */
import { registerOTel } from "@vercel/otel";

export async function register() {
  registerOTel({
    serviceName: process.env.OTEL_SERVICE_NAME || "serverless-rag",
  });
}
