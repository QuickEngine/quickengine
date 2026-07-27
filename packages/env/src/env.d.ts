// Intentionally empty.
//
// This file previously declared a minimal `process` global as a stand-in for Node's
// types. Because a `declare const` in an ambient file **replaces** the real global
// rather than augmenting it, that declaration leaked into every package whose type
// graph reached this one — and `process.cwd`, `process.exitCode`, and
// `process.loadEnvFile` all stopped existing there. It surfaced the moment auth
// began resolving through db into env.
//
// `@types/node` provides the real declarations. Do not reintroduce a hand-written
// `process` here.
export {};
