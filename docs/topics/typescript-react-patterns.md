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

### Long lists in the browser

| Approach | DOM size | What the reader gets | What it costs |
|----------|----------|----------------------|---------------|
| "Load more", render everything loaded | grows with every page | simple; scrolling back works | DOM, memory and render time grow with the list; if every page triggers a full re-render, total time grows roughly with N squared |
| Replace the page (Prev / Next) | bounded by the page size | flat memory | no scrolling through history; hard to keep the reader's place |
| Infinite scroll + virtualization | visible rows + overscan | smooth scroll at any depth, place kept | fixed row height; `Ctrl+F` cannot find unrendered rows; extra accessibility work |
| Virtualization + a cache window (`maxPages`) | bounded | bounded memory too | needs paging in both directions; only pays off at hundreds of thousands of rows |

Choose by what the reader does (scan, search, jump to a time), not by what is easiest to build. **Virtualization limits the DOM, not the data:** the loaded rows stay in the cache, so memory still grows with the data, just far slower.

### Server state of a paged list (TanStack Query)
- **Refetch on focus / reconnect reloads every loaded page** and swaps them in. For a list that must change only when the reader asks, turn both off on that query; make it a global default only when the whole app follows the same rule.
- **Retry by cause.** A 4xx gets the same answer again, so do not retry it (except 408 and 429, which are temporary). Retry 5xx and network failures, with a cap. A network failure has no response, so the error type must carry the HTTP status from the response, not from the body.
- **Auto-loading the next page:** one request at a time (`fetchNextPage` has `cancelRefetch: true` by default, so a second call during a fetch cancels the first and restarts). After a failure stop loading and offer a manual retry; otherwise a broken server gets a request loop from every open tab.

## Failure modes and how to reason about them
- **Interface vs type confusion in unions:** you can't express a union with `interface`; if you need it, it's a `type`.
- **Interface as DI token:** compiles, then fails at runtime ("can't resolve dependency") because it was erased.
- **`any` / unchecked casts at boundaries:** types lie about external data. Validate at the edge (DTO validation), trust types inside.
- **Stale closures in hooks:** an effect/callback captures old state; fix dependencies, use functional updates, or refs.
- **Re-render storms:** a context value recreated each render, an inline object/function prop to a memoized child, or one giant state object updated at stream rate. Symptom: React Profiler shows many components committing per message.
- **Memory leaks in the browser:** subscriptions/WebSocket listeners/timers not cleaned in effect cleanup; unbounded arrays of streamed events.
- **Huge lists:** DOM node count is the cost; virtualize.
- **Cost that grows with the loaded rows:** without virtualization the render after every page touches every row, so loading gets slower the deeper the reader goes (loading 500 pages was a long wait before virtualization and took about 10 s after it; a rough feel, not timed).
- **A failed next page must not erase the list.** The query reports `error` while keeping the loaded rows; a screen that replaces itself on `error` alone wipes everything the reader had. Show the full error only when there is no data. (Not yet reproduced against a stopped server.)
- **Columns sized by the longest value.** With `table-layout: auto`, one 128-character `user_id` widened its column and pushed Device ID and Source out of view; it appeared only after more pages loaded. With virtualization it would also change while scrolling. Fix: fixed layout, explicit widths, truncate with the full value in `title`.
- **Diagnosis order (slow UI):** React Profiler (what re-rendered and why) -> Chrome Performance (long tasks, layout, scripting) -> Memory tab (leak) -> fix the cause (batching, virtualization, state shape) -> re-measure.

## Key details that matter
- Discriminated unions give exhaustive, safe handling of event kinds (`type Event = Click | View`, switch on `kind`).
- `satisfies`, `as const`, and generics keep literal types without widening.
- Effects: cleanup function is how you unsubscribe; dependency array is correctness, not optimization.
- Batch streaming updates (e.g. flush every N ms) instead of setting state per message.
- Keep high-frequency data outside React state when possible (refs/external store with subscriptions) and render on a schedule.
- **Measuring browser memory:** take heap snapshots at N and 5N rows with the same browser. If `(bytes(5N) - bytes(N)) / 4N` is constant, growth is linear and that number is the cost of one row. Read the counts by type to see which layer pays: `TR` / `TD` are the DOM, `Object` / `Function` / `Call` are components and closures, `strings` are mostly data and text.
- Virtualization needs a **known row height** (a constant that must equal the real one), a scroll container with a bounded height, and two spacer rows that stand in for the rows outside the window. `overscan` (rows kept beyond the window) is about smooth drawing, one screen is a reasonable start; the prefetch distance to the end of the data is a separate number, between "visible + overscan" and one page.

## In 30 seconds
"Types are erased at runtime, so I use `interface` for extendable object contracts and `type` for unions and mapped types; when I need a token that exists at runtime, such as a NestJS injection token, I use an abstract class. In React I extract stateful logic into custom hooks, compose with children instead of inheritance, and memoize only after the Profiler shows a real cost. For streaming data I batch updates and virtualize large lists, and wrap risky widgets in error boundaries. A virtualized list renders only the visible rows, so the DOM stays constant while the data keeps growing; it costs fixed row heights and in-page search."

**Follow-ups:**
- *Declaration merging?* Two interfaces with the same name merge; useful to augment third-party types.
- *Why abstract class as a token?* It survives compilation; interfaces don't.
- *Context vs Redux/Zustand?* Context re-renders all consumers on any change; fine for rarely-changing values, poor for high-frequency state.
- *When not to memoize?* When props change every render anyway or the render is cheap.
- *Controlled vs uncontrolled?* Controlled: React owns the value; uncontrolled: DOM owns it, read via ref.
- *Hook vs HOC vs render prop?* Hooks are the default now; the others remain for legacy or headless cases.
- *Why virtualize instead of paginating?* Pagination bounds the DOM by replacing rows (the place is lost); virtualization keeps one continuous scroll over any depth. Both can sit on top of cursor paging on the server.
- *Does virtualization fix memory?* The DOM and component part, yes; the data in the cache still grows, about 0.8 KB per event here.
- *Should a list refetch when the tab regains focus?* Not a list that shifts under the reader; refresh only on an explicit action.

## In Live Pulse
- **Events list (#4 / PR #9):** React + TanStack Query (`useInfiniteQuery`, cursor from the server), TanStack Table for the model, TanStack Virtual for the window, in `web/src/features/events/`. The table component only draws; `useVirtualRows` holds the window and the "near the end" trigger.
- **Numbers** (Firefox heap snapshots, 5 columns per row):

| Loaded rows | Before virtualization | After |
|-------------|----------------------|-------|
| 10,000 | about 392 MB, `TR` 10,001, `TD` 50,000 | about 13.5 MB, `TR` 31, `TD` 146 |
| 50,000 | about 1.93 GB, `Object` 6.2M | about 47 MB, `Object` 267k |

- Constants: row 44 px, `overscan` 15 (about one screen), prefetch 40 rows before the end with pages of 100.
- Planned, not built yet: `useEventStream`, error boundary, `lazy` charts, context + reducer for filters.
- Experiments: E11 in [EXPERIMENTS.md](../EXPERIMENTS.md) (partly done, see there).
- Issues / PRs: #4 / PR #9; #8 (bundle size).

## Lessons from building it
- **Before virtualization, one row cost about 39 KB, and the event itself less than 1 KB.** Per row: about 124 objects, 57 functions and 5 cells of DOM. Growth was linear (39 KB per row at 10k, 38.6 KB at 50k), so two snapshots were enough to extrapolate (100k about 3.8 GB) without waiting for a 100k run.
- **After virtualization, one row costs about 0.8 KB** (between the 10k and 50k snapshots: (47.2 - 13.5) MB / 40,000), almost all of it the data. The table model (`useTable`) turned out to be cheap: `Object` per row fell from 124 to about 5. The expensive part had been cells, DOM and component state, not the row model.
- **A first estimate was wrong and was corrected by data.** From one snapshot, "about 450 B per event" was guessed; two points gave 0.8 KB. One measurement gives a number, two give a slope.
- **The 128-character `user_id` was valid data**, so the UI has to survive the maximum the API allows, not the typical value. It was found only at 10k+ rows.
- **The reviewer's schema claim was wrong, the pasted error was right.** The OpenAPI schema declared no body for 400, but the server returned `{ statusCode, error, message[] }`. The contract drifted from the behaviour; the fix was to describe the body in the schema (`BadRequestError`) and regenerate the client types, rather than cast in the client.
- **Auto-refetch on focus is a behaviour, not a default to ignore.** Returning to the tab re-requested every loaded page (around 2,500 requests during one measurement, by the developer's count) and could have shifted rows under the reader.
- **A button that flickers is a UX bug even when it is correct.** With automatic loading, "Load more" turned into "Loading…" on every page. It now keeps its label, ignores clicks while a request runs, and only changes on failure.
