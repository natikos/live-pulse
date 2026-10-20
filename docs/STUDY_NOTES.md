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
