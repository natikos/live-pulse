# NestJS

Covers: dependency injection and provider scopes, modules, abstract classes as injection tokens, request lifecycle.

## The problem it solves
In a growing backend, classes that create their own dependencies are hard to test, swap and reason about. NestJS gives a structure: **modules** group code, **providers** declare what can be injected, and a **DI container** wires instances. The result: swappable implementations (Postgres vs in-memory) and explicit boundaries, which is also what makes extracting microservices later feasible.

## Mental model

```
Module A ── exports ──> ProviderX ──┐
Module B ── imports A ───────────────┴─> can inject ProviderX
Controller -> Service -> Repository (abstract class = token) -> PostgresRepository | InMemoryRepository
```

- **Provider** = anything injectable (service, repository, factory, value).
- **Container** builds a dependency graph at startup and creates instances according to **scope**.
- **Module** = encapsulation unit. A provider is private unless the module **exports** it. This is the boundary mechanism of a modular monolith.

**Scopes:**

| Scope | Instances | Lifetime |
|-------|-----------|----------|
| DEFAULT (singleton) | one per app | app lifetime |
| REQUEST | one per incoming request | request |
| TRANSIENT | one per consumer that injects it | its consumer |

**Request lifecycle** (HTTP):
`Middleware -> Guards -> Interceptors (before) -> Pipes -> Controller handler -> Interceptors (after) -> Exception filters (on error)`.

## Trade-offs and when to choose what

| Choice | Pros | Cons |
|--------|------|------|
| Singleton (default) | fastest, no per-request cost | must be stateless or safely shared |
| Request scope | per-request state (tenant, user context) | **bubbles up**: everything that depends on it becomes request-scoped; instance creation per request; harder to use in consumers/cron |
| Transient | isolated instance per consumer | more instances; rarely needed |

**Injection tokens:**

| Token type | Pros | Cons |
|------------|------|------|
| Abstract class | exists at runtime; works as a token with no extra string; can carry shared base logic | single inheritance; not a pure contract |
| Interface + string/Symbol token | pure contract | interfaces vanish at runtime, so you need a manual token and `@Inject` |

Rule of thumb: abstract class when it is a port with one obvious token; interface + Symbol when you want a pure type contract or several unrelated implementers.

**Context-like state without request scope:** use `AsyncLocalStorage` (CLS) to carry per-request data while keeping providers singleton.

## Failure modes and how to reason about them
- **Stateful singleton:** a singleton service stores per-request data in a field. Two concurrent requests overwrite each other. Symptom: wrong data under load only. Fix: pass state as arguments or use request scope / AsyncLocalStorage.
- **Scope bubbling:** one request-scoped dependency silently makes a whole chain request-scoped; latency and GC pressure rise. Check which providers are actually request-scoped.
- **Circular dependency:** two providers/modules import each other; `forwardRef` hides a design smell. Fix the boundary (extract a third piece, or use events).
- **Leaky modules:** exporting everything or deep-importing another module's internals destroys the boundaries you need for Stage 5.
- **Lifecycle:** not handling shutdown hooks drops in-flight work (consumers, connections) on restart.

## Key details that matter
- Request scope is **not** available in the same way for message consumers (no HTTP request); a consumer handler needs its own context handling.
- A provider's scope is decided by the provider **and** its dependencies.
- Interceptors wrap the handler (logging, timing, caching, response mapping); guards decide access; pipes validate/transform input; filters map exceptions to responses.
- DTO validation belongs at the boundary (pipes), domain rules in services.
- Modules + exports = enforced public API. Inter-module calls through exported services or events keep extraction cheap.

## In 30 seconds
"NestJS wires classes through a DI container organised in modules; a provider is private to its module unless exported, which is how I keep boundaries in a modular monolith. The default scope is singleton, which is fast but must be stateless; request scope gives per-request instances at a cost and bubbles up the dependency chain. I use abstract classes as injection tokens because they exist at runtime, so a repository can be swapped between Postgres and in-memory in tests."

**Follow-ups:**
- *Why not request scope everywhere?* Per-request instantiation cost and it infects every dependent.
- *Interface as a token?* Interfaces don't exist at runtime; use an abstract class or a Symbol token.
- *Guard vs interceptor vs pipe?* Authorize vs wrap/cross-cut vs validate/transform.
- *How do you carry a request id without request scope?* AsyncLocalStorage.
- *How does this help microservices?* Module boundaries and injected ports are the seams where you cut.

## In Live Pulse
_Stub. Claude fills as the project progresses._
- Experiments: E10 (provider scopes) in [EXPERIMENTS.md](../EXPERIMENTS.md).
- Planned: `EventRepository` abstract class with Postgres and in-memory implementations (Stage 1).
- Issues / PRs: _(none yet)_

## Lessons from building it
_Stub. Real findings go here._
