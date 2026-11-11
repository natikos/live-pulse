# Study notes: stories from the project

Written by Claude from real history (issues, PRs, experiments, bugs). Facts only, nothing invented.
Each story should be retellable in about 60 seconds. See [HANDBOOK_GUIDE.md](HANDBOOK_GUIDE.md).

## Template

### <Short title>
- **When / where:** <date, issue #N, PR #M, experiment>
- **Situation:** <what was observed, in symptoms>
- **How it was diagnosed:** <tools, order of steps, what was ruled out>
- **Fix:** <what changed and why this fix>
- **Takeaway:** <the reusable lesson, in one or two sentences>
- **Related chapter:** <link to docs/topics/...>

---

<!-- Stories go below, newest first. -->

### 1.93 GB for 50,000 rows, and where it went
- **When / where:** 2026-11-11, issue #4, PR #9 (the events table in the web app).
- **Situation:** the event list loaded 50,000 rows and the tab became sluggish; while rows were loading the table stuttered, and columns seemed to appear and disappear.
- **How it was diagnosed:** Firefox heap snapshots of the production build at 100, 10,000 and 50,000 rows, read by type. `TR` and `TD` matched the row count exactly (10,001 and 50,000), so the snapshot was clean. Per row: about 124 `Object`, 57 `Function` and 5 cells of DOM, 39 KB in total, the same at 10k and 50k (linear). The event data itself (`strings`) was under 1 KB per row. So the memory was in the DOM and the component tree, not in the cache.
- **Fix:** virtualize the table (only the visible rows plus 15 of overscan are in the DOM). Same snapshots after: 13.5 MB at 10k, 47 MB at 50k, `TR` 31 and `TD` 146 at both sizes. A cost per row of about 0.8 KB, almost all data.
- **Takeaway:** measure the layers separately before choosing the fix. The idea to cap the cache would have saved about 2%; virtualization saved 97%. Two snapshots give a slope, one gives only a number (an early guess of 450 B per event was off by almost half).
- **Related chapter:** [typescript-react-patterns.md](topics/typescript-react-patterns.md)

### The columns that vanished at 10,000 rows
- **When / where:** 2026-11-11, issue #4, PR #9.
- **Situation:** on a long list the Device ID and Source columns disappeared one after the other (Source first), but on a page of 100 rows everything was fine.
- **How it was diagnosed:** at first it looked like slow repainting of a huge DOM, which was wrong. The code had five columns and nothing hid them. The developer found the columns were still there, pushed out of view by a very wide User ID column. A query on the database found `user_id` values of 128 characters (the API maximum) in the seed data; they simply had not appeared in the first 100 rows.
- **Fix:** fixed table layout with explicit widths, truncation, and the full value in the `title`. This also prepared the table for virtualization, where auto-sized columns would change width while scrolling.
- **Takeaway:** test the UI with the maximum the API allows, not the typical value, and check the data before blaming the renderer. The first explanation (slow repainting) was plausible and wrong.
- **Related chapter:** [typescript-react-patterns.md](topics/typescript-react-patterns.md)

### A green test that checked nothing
- **When / where:** 2026-10-20, issue #1, PR #3 (writing the e2e tests).
- **Situation:** the first e2e tests passed, but one of them compared the response to an array that could never match, and another had `expect(res.body.length === 10)`.
- **How it was diagnosed:** reviewing the test code. `request(app).get(...)` was not awaited or returned, so the test finished before the response arrived; `expect(x)` without a matcher (`.toBe`, `.toEqual`) does nothing. Then each test was **broken on purpose** in the code under test (`limit(10)` -> `limit(11)`, `desc` -> `asc`, `DO NOTHING` -> `DO UPDATE`, removing the validation pipe) to see whether it turned red.
- **Fix:** `await` every request, use real matchers, state the expected result as a literal, and check that each test fails when the behaviour is broken.
- **Takeaway:** a test is only trustworthy once you have seen it fail. Check the failing case before trusting the green one.
- **Related chapter:** [nestjs.md](topics/nestjs.md)

### The schema was tested, but nothing applied it
- **When / where:** 2026-10-20, issue #1, PR #3.
- **Situation:** `POST /events` with `type: "erfror"` returned a 500; the log said `invalid input value for enum event_type: "erfror"` from Postgres, even though the schema had passing unit tests.
- **How it was diagnosed:** running the schema on the same payload alone gave a clear rejection, so the rules were right. Reading how `@Body({ schema })` works in Nest 12 showed it only attaches the schema as metadata; a grep for pipes in `main.ts` and `AppModule` found none registered. An HTTP-level test with the real `AppModule` confirmed a 400 once the pipe was registered.
- **Fix:** register `StandardSchemaValidationPipe` as `APP_PIPE` in `AppModule`, and add e2e tests that assert `400` and that nothing was stored.
- **Takeaway:** unit tests prove the rules, only an end-to-end request proves the rules are applied. The database was the last line of defence and turned a client error into a 500.
- **Related chapter:** [nestjs.md](topics/nestjs.md)
