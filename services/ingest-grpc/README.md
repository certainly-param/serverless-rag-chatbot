# Optional: gRPC Bulk Ingest (Proto & Design)

Proto and design for a **gRPC** bulk-ingest gateway that would forward requests to the app's REST `/api/ingest`. Use when you need high-throughput ingestion from backend systems (batch jobs, other services) and prefer gRPC.

**Resume-relevant**: **gRPC**, **Backend & Systems Architecture** — implement the server in Go/Node per your stack.

## Proto

See `ingest.proto`. RPC: `BulkIngest(BulkIngestRequest) returns (BulkIngestResponse)`.

## Implementation

Implement a small gRPC server (e.g. Go with `protoc` + `protoc-gen-go`, or Node with `@grpc/grpc-js` + `@grpc/proto-loader`) that:

1. Listens for `BulkIngest` calls.
2. Maps request to the same JSON shape as `/api/ingest` (source, chunks, optional docId).
3. POSTs to `INGEST_HTTP_BASE_URL/api/ingest` and returns the result.

The main app stays HTTP-only (Vercel serverless); this is an optional sidecar for gRPC clients.
