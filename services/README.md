# Services

Future standalone services live here.

The docs currently prefer Next.js API routes/server actions for normal web backends. Add a Rust/Axum service here only when a workload clearly needs a separate service boundary, higher throughput, native processing, or a long-running worker model.

Likely future services:

- `engine/` - Rust/Axum shared service for cross-app orchestration or high-throughput internal APIs.
- `workers/` - background processing services if Inngest/package-level jobs are not enough.

Do not add a Cargo workspace until the first Rust service is actually started.
