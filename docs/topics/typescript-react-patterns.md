# TypeScript and React patterns

Covers: `type` vs `interface`, abstract classes vs interfaces, and the React patterns worth knowing.

## The problem it solves
Types document and enforce contracts at compile time; patterns keep growing code understandable and cheap to change. The skill is knowing *which tool for which job* and justifying it, not memorizing syntax.

## Mental model

**TypeScript types are erased at runtime.** `type` and `interface` leave no trace in the JS output. A **class** (including an abstract class) does exist at runtime. That one fact decides most of the abstract-class-vs-interface questions.

**React:** UI = function of state. Re-render happens when state/props/context change; cost is about *how much* re-renders and *how heavy* each render is, not "re-render = bad".

## Trade-offs and when to choose what

### `type` vs `interface`

| | `interface` | `type` |
|---|---|---|
| Object shapes | yes | yes |
| Extending | `extends`; clear errors | intersection `&` |
| Declaration merging | **yes** (same name merges; used for augmenting libraries) | no (duplicate error) |
| Unions, tuples, primitives, conditional/mapped types | no | **yes** |
| Implemented by classes | yes | yes (object-shaped) |

Rule: `interface` for public object contracts that others may extend or augment; `type` for unions, mapped/conditional types and aliases. Be consistent; the difference is small for plain objects.

```ts
type Status = 'ok' | 'error';                       // union -> type
type Readonly2<T> = { readonly [K in keyof T]: T[K] }; // mapped -> type
interface Event { id: string; type: string }        // object contract -> interface
```

### Abstract class vs interface

| | Interface | Abstract class |
|---|---|---|
| Exists at runtime | no | **yes** |
| Usable as NestJS injection token | no (needs Symbol/string + `@Inject`) | **yes** |
| Shared implementation | no | yes (concrete methods) |
| Multiple inheritance | implement many | extend one |

Use an interface for a pure contract. Use an abstract class when you want an injectable port (`EventRepository`) and/or shared base behavior.

### React patterns

| Pattern | Solves | Use when | Watch out |
|---------|--------|----------|-----------|
| Custom hook | reusing stateful logic | any logic shared or worth isolating | hooks share logic, not state |
| Composition (`children`, slots) | avoiding prop drilling and giant prop lists | layout, wrappers | prefer over inheritance always |
| Compound components | related parts sharing implicit state (`<Tabs><Tab/></Tabs>`) | flexible UI kits | context under the hood |
| Controlled vs uncontrolled | who owns input state | controlled for validation/sync; uncontrolled for simple forms/perf | don't switch between them |
| Context + reducer | app-wide state without a library | low-frequency shared state | **every consumer re-renders on change**; split contexts, memoize value |
| Memoization (`memo`, `useMemo`, `useCallback`) | skipping wasted renders/work | measured cost; stable props to memoized children | adds complexity; useless if props change every time |
| Error boundary | one failing subtree shouldn't blank the page | around widgets/routes | catches render errors, not async/event-handler errors |
| `lazy` + `Suspense` | smaller initial bundle | heavy, rarely used screens/charts | need fallback UI |
| Container/presentational | separate data from display | testability, reuse; today mostly hooks do the container's job | don't over-layer |
| Render props | share behavior by passing a render function | mostly replaced by hooks | still useful for headless components |
| HOC | wrap components to add behavior | legacy, cross-cutting wrappers | wrapper hell, prop collisions; prefer hooks |

**Memoization honesty:** profile first. Memoize when a measured expensive subtree re-renders for unrelated changes; not by default.

## Failure modes and how to reason about them
- **Interface vs type confusion in unions:** you can't express a union with `interface`; if you need it, it's a `type`.
- **Interface as DI token:** compiles, then fails at runtime ("can't resolve dependency") because it was erased.
- **`any` / unchecked casts at boundaries:** types lie about external data. Validate at the edge (DTO validation), trust types inside.
- **Stale closures in hooks:** an effect/callback captures old state; fix dependencies, use functional updates, or refs.
- **Re-render storms:** a context value recreated each render, an inline object/function prop to a memoized child, or one giant state object updated at stream rate. Symptom: React Profiler shows many components committing per message.
- **Memory leaks in the browser:** subscriptions/WebSocket listeners/timers not cleaned in effect cleanup; unbounded arrays of streamed events.
- **Huge lists:** DOM node count is the cost; virtualize.
- **Diagnosis order (slow UI):** React Profiler (what re-rendered and why) -> Chrome Performance (long tasks, layout, scripting) -> Memory tab (leak) -> fix the cause (batching, virtualization, state shape) -> re-measure.

## Key details that matter
- Discriminated unions give exhaustive, safe handling of event kinds (`type Event = Click | View`, switch on `kind`).
- `satisfies`, `as const`, and generics keep literal types without widening.
- Effects: cleanup function is how you unsubscribe; dependency array is correctness, not optimization.
- Batch streaming updates (e.g. flush every N ms) instead of setting state per message.
- Keep high-frequency data outside React state when possible (refs/external store with subscriptions) and render on a schedule.

## In 30 seconds
"Types are erased at runtime, so I use `interface` for extendable object contracts and `type` for unions and mapped types; when I need a token that exists at runtime, such as a NestJS injection token, I use an abstract class. In React I extract stateful logic into custom hooks, compose with children instead of inheritance, and memoize only after the Profiler shows a real cost. For streaming data I batch updates and virtualize large lists, and wrap risky widgets in error boundaries."

**Follow-ups:**
- *Declaration merging?* Two interfaces with the same name merge; useful to augment third-party types.
- *Why abstract class as a token?* It survives compilation; interfaces don't.
- *Context vs Redux/Zustand?* Context re-renders all consumers on any change; fine for rarely-changing values, poor for high-frequency state.
- *When not to memoize?* When props change every render anyway or the render is cheap.
- *Controlled vs uncontrolled?* Controlled: React owns the value; uncontrolled: DOM owns it, read via ref.
- *Hook vs HOC vs render prop?* Hooks are the default now; the others remain for legacy or headless cases.

## In Live Pulse
_Stub. Claude fills as the project progresses._
- Planned appearances: `EventRepository` abstract class (Postgres + in-memory), `useEventStream` hook, virtualized table, error boundary around charts, `lazy` for the charts bundle, context + reducer for filters.
- Experiments: E11 (100k rows) in [EXPERIMENTS.md](../EXPERIMENTS.md).
- Issues / PRs: _(none yet)_

## Lessons from building it
_Stub. Real findings go here._
