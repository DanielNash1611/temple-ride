# Temple Ride agent guidance

## Product source of truth

Before planning, reviewing, or implementing product work, read `docs/PRD.md` in full. It is the approved source of truth for product scope, user needs, requirements, non-goals, launch readiness, and acceptance criteria.

- Map every behavior change to the relevant PRD section(s) and acceptance criterion. Include that mapping in the work plan and final handoff.
- Re-read the relevant PRD text immediately before changing behavior; do not rely on a summary in this file or on memory from an earlier task.
- Preserve the PRD's distinction between the checked-in baseline, initial pilot requirements, and deferred ideas. In particular, do not claim that advisory name matching, member editing, or the change log exists without verifying it in the current code and runtime.
- If a request conflicts with the PRD, falls outside its scope, or depends on an unresolved item in PRD section 13, surface the conflict or decision explicitly. Do not silently invent product policy.
- Do not change the PRD merely to make an implementation appear compliant. PRD changes should record an approved product decision and should remain separate from speculative proposals.
- When code and the PRD disagree, report the gap. Treat checked-in behavior as evidence of the current baseline, not as authority to redefine the intended product.

## Repository map

- `docs/PRD.md`: approved product requirements and acceptance criteria.
- `server.js`: HTTP routes, request limits, static serving, and administrator authorization.
- `lib/store.js`: validation, current-trip rules, roster mutations, and local persistence.
- `lib/blob-backend.js`: private Vercel Blob persistence and conflict detection.
- `public/`: the mobile-first member and organizer interface.
- `tests/`: store, server, authorization, persistence, and concurrency coverage.
- `data/app-data.json`: local runtime state; never treat its sample contents as product requirements.

## Development workflow

1. Read the PRD and identify the governing sections before proposing a solution.
2. Inspect the actual end-to-end path—browser UI, API route, store, persistence backend, and tests—as applicable.
3. State whether the work maintains the pilot baseline, implements a next-release requirement, or proposes a PRD change.
4. Make the smallest coherent change that satisfies the mapped requirement without expanding into a non-goal.
5. Add or update tests at the layer where the behavior is enforced. User-visible or timing-sensitive requirements also need realistic runtime verification when practical.
6. Run `npm run check` and `npm test` before declaring implementation complete. Report any check that was not run or any requirement that remains unverified.
7. In the final handoff, list the PRD sections satisfied, verification performed, and any known gaps or follow-up decisions.

## Product and data guardrails

- Maintain one shared active-trip roster; do not introduce separate EQ and RS state.
- Keep the main member flow account-light and keep organizer controls out of that path.
- Enforce authorization and validation on the server. Client-side controls are not security boundaries.
- Carry the administrator PIN on every protected request; successful PIN verification alone must not authorize later API calls.
- Preserve the initial pilot's intentional trusted-group model: members may edit or remove roster entries without identity verification or private recovery tokens, but removal must require the PRD-defined confirmation.
- Keep the administrator change log PIN-protected, limited to the current trip, and free of claims about an unauthenticated actor's identity.
- Treat concurrent writes and stale trip IDs as expected cases. Never allow one successful signup to silently overwrite another.
- Implement exact-name and possible-family last-name checks only as advisory warnings defined by the PRD. Never persist a spouse, family, or household relationship or claim that a last-name match proves one.
- Collect and expose only the minimum data approved by the PRD. Do not add contact details, addresses, general messaging, analytics, or public directory behavior without an approved product change.
- Do not commit deployment secrets, `.env` files, Vercel credentials, local roster data, or test data.
- Preserve `no-store` behavior for roster API data and private access for hosted state.
- Keep the product scoped to one ward or closely connected group and one shared local time zone unless the PRD is explicitly expanded.

## Experience guardrails

- Design and verify phone-sized layouts first, then larger screens.
- Preserve keyboard access, accessible names, focus behavior, status announcements, and accessible dialogs.
- Use plain-language errors for invalid input, stale trips, unavailable cars, full cars, and concurrent changes.
- Avoid interrupting an in-progress form or dialog when applying background roster updates.
- Use member-facing terms consistently. If internal storage names differ from product language, keep that distinction out of the UI.

## Review checklist

Before considering product work complete, confirm:

- The change is traceable to `docs/PRD.md`.
- Current behavior and intended behavior are not being conflated.
- Server-side validation, authorization, stale-state handling, and conflict behavior remain correct.
- Relevant automated checks pass.
- Mobile and accessibility effects were considered and, for UI changes, exercised.
- Documentation describes only verified behavior.
