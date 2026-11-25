# Temple Week local experiment — verification

Verified September 8, 2026 against the isolated local launcher. This is a working local experiment, not a production release. The normal entrypoint continues to serve the single-trip pilot.

## Requirements covered

| Behavior | Governing PRD sections and acceptance criteria |
| --- | --- |
| Organizer-configured seven-day period; chronological endowment overview; multiple posted times and languages | §14.1–14.2 explicitly extend §§3–6, §7.1, §7.4, and §12’s one-current-trip criterion. Equal-time plans share one session. |
| Cars, seat claiming, rider list, own transportation, independent company preference | §14.2 extends §7.2 and the seat-claiming/member-editing criteria in §12. Company never consumes a seat or clears automatically on a ride change. |
| Per-session name matching, all organizations sharing one roster | §14.2 preserves §7.3 and §12’s shared-roster and advisory-warning criteria. Other sessions do not trigger name warnings. |
| Typed-name edits/removals; preserved participants and riders | §14.2–14.3 preserve and extend §7.2 and §12’s removal/capacity requirements. Leaving a driver role retains the driver’s participant ID and moves riders to the same session’s rider list. |
| PIN on every protected request; private per-session log | §14.3 preserves §§7.4–7.5 and §8. Member plan submission is the approved session-creation exception. |
| Stale form rejection; concurrent writes; polling without interruption | §14.3–14.4 preserve §§7.1–7.3, §7.6, §9, and §12’s shared-refresh and capacity criteria. |
| Local storage separation; no Blob access or production migration | §14.4, extending §9’s development-storage requirement. |

## Automated checks

- `npm run check`: passed for both application entrypoints, both stores, shared persistence, and both browser scripts.
- `npm test`: 44 tests passed, including all 18 original pilot regressions and 26 experiment tests.
- `git diff --check`: passed.

Experiment tests cover inclusive week boundaries and year rollover; invalid names, times, transportation, and company flags; the 20 KB request limit and invalid JSON bodies; atomic session-plus-participant creation; equal-time session reuse; two store instances sharing a revision backend; concurrent changes to different sessions and contention for the last seat; advisory matches including own-transportation entries; cross-session name independence; car-filling assignment with a waiting-list fallback; role/company edits; typed confirmations; rider preservation; stale forms and deletion; session collision rejection; week replacement; private logs; and pilot/experiment schema isolation.

HTTP tests verify that PIN verification alone does not grant later access; member corrections remain account-free; every protected call carries the PIN; public responses omit logs and use `no-store`; normal mode retains its original interface/API; and the experiment works locally despite unusable Blob credentials. The launcher ignores pilot storage environment overrides. Tests use temporary files; generated experiment state is ignored and excluded from deployment packaging.

## Browser verification

The running app was exercised through real browser controls using synthetic names only:

- Organizer setup, note editing, session-time correction, and private change-log viewing.
- Offering seats with a company request; requesting a ride while seats were available; own transportation with and without company; clearing company independently of transportation.
- Direct open-seat joining, full-car state, and explicit **Join any car** from the rider list. An incorrect typed name kept the move action unavailable.
- Occupied seats opened the member’s name and **Change cars** before destination choices. Destination selection revealed typed confirmation.
- A family-name warning showed the existing status and eligible car; choosing that car rechecked availability and retained the company request.
- A driver stopped offering a car after the disclosure and named confirmation. Both assigned riders remained on the rider list, with their company preferences intact. The same participant subsequently offered a car again.
- Incorrect typed removal was blocked; correct confirmation removed only the selected sample entry.
- One member appeared in separate sessions without a duplicate warning. The overview displayed separate Tuesday, Wednesday, and Thursday sessions with accurate counts.
- An open form retained its draft and original roster while another viewer changed plans. Saving refreshed the shared roster immediately. After an organizer changed a session from 6:00 to 6:30, submission from the old form was rejected without mutation; closing the form showed the corrected time.
- A fresh idle-viewer update appeared in **3,268 ms** in the measured run, within the accepted ten-second polling interval. This is one local observation, not a production latency guarantee.
- Layouts checked at **390 × 844**, **320 × 740**, and **1200 × 900**. No horizontal overflow was observed. The long driver form fit within the phone viewport and scrolled inside its dialog.
- Seats/Names switching, browser back to the week, a skip link that preserves the selected session, Tab wrapping within dialogs, Escape dismissal, focus restoration, and visible status/error feedback were exercised. Console inspection of the final browser session showed no warnings or errors.

Browser checks found and resolved a missing selected-view treatment, an inherited mobile-dialog margin, and keyboard-focus behavior before completion. Motion respects the existing reduced-motion preference through the experiment stylesheet.

## Endowment and ride-flow refinement (September 8, 2026)

The user-approved refinement is recorded in §14.2–14.4, extending §§5–6 and §7.2’s member flows, §7.1/§7.4’s session setup, and §12’s seat, capacity, and accessible-phone criteria. The original car illustration and clickable seats are reused in the experiment. The normal pilot retains its random **Join any car** behavior.

A separate temporary UI-test week (clearly labeled as a fixture, not LA timetable data) verified:

- Three posted endowment slots on the same day, with English/Spanish labels and an empty roster visible before signup.
- **Add my car** asks only for name, passenger-seat count, and the independent company checkbox. Its confirmation repeats date, time, and language.
- **I need a ride** chose the car with one open seat ahead of the car with three, kept the company request, and announced the driver. In another session with no cars, it saved and announced the waiting-list placement.
- Adding a car did not silently move existing waiting riders. **Add to a car** offered the unified any-car choice and required the displayed name before moving the participant.
- Car-heading buttons open the car’s names; occupied seats and driver seats remain manageable. Seats/Names view switching displays company status beside names.
- The initial refinement required time and language; the chart update below makes language optional when unknown. Browser testing posted an additional empty slot and displayed it in chronological order.
- Phone widths of 320 and 390 pixels had no horizontal overflow; the 1200-pixel layout showed two cars side by side. Dialog initial focus, Tab wrapping, post-save focus and announcements, and browser navigation worked. No browser warnings or errors were captured.

Automated additions cover two simultaneous automatic requests for one remaining seat (one assigned, one waiting, neither lost); car-fill priority; company-only waiting-list edits; session-language length validation; same-time collision protection; language-change stale forms; PIN-protected empty-slot posting; private logs and no-store responses.

**Schedule source update:** The organizer subsequently supplied a Friday/Saturday chart from previous research. Its 17 slots were loaded into the local week for September 11–12, 2026: six Friday times and eleven hourly Saturday times. Saturday 6:30 AM is Samoan, 10:30 AM Spanish, and 11:30 AM ASL. Unlabeled languages remain absent in persisted state and display “Language not set.” Friday 5:30–7:30 was interpreted as evening; Saturday 1:30–3:30 as afternoon. Source and interpretation are recorded in PRD §14.5. This is organizer-provided experiment data, not a claim of fresh official verification.

The store and organizer form now allow an unset language, consistent with §14.3. Added coverage verifies unknown-language posting and signup, preserving a known language when an edit omits it, explicitly clearing it, retaining participants, and readable logs. An HTTP regression checks that an unknown language is not persisted as a guessed value. Existing sessions and all eight sample participants were compared before/after import and remained unchanged. Browser verification at 390 × 844 confirmed all Friday/Saturday rows in chronological order, all three language labels, no horizontal overflow, and the Samoan session’s date/time/language in the car form. `npm run check`, all 44 tests, and `git diff --check` passed.

The [official reservation system](https://www.churchofjesuschrist.org/temples/schedule/appointment?lang=eng&templeOrgId=40) previously required Church sign-in. Fresh verification of timetable changes and closures remains a rollout check; it does not block use of the user-supplied chart in this local experiment.

## Day accordion refinement

The approved day-first selection flow is recorded in PRD §14.2, extending §6’s member experience and §12’s accessible-phone criterion while preserving §7.3/§9 polling behavior. The initial week overview shows all seven day controls collapsed, each with a date, session count, and chevron. One day can be expanded at a time. Its times retain the existing language and roster summaries. Empty days remain visible with an explicit message.

Browser verification covered Enter to expand, Space to collapse, opening another day closing the previous one, and Tab skipping all collapsed session links. Returning from the Samoan session via browser back restored Saturday and all eleven times. Friday’s expansion and focused day button survived an eleven-second idle interval spanning the polling cadence. Testing found and fixed a scroll shift when a long preceding day collapsed; opening a day now brings its heading and first times into view.

Layouts were checked at 390 × 844, 320 × 740, and 1200 × 900, with no horizontal overflow at the narrow phone width. The browser’s expanded/collapsed state matched each panel’s visibility. This presentation-only change uses the existing roster APIs and storage; `npm run check`, all 44 existing tests, and `git diff --check` passed.

## Running and remaining gates

Use `npm run dev:temple-week` and open `http://localhost:3001`. The local demo PIN is `2468` unless a PIN is configured. The current local sample week is explicitly labeled as a demo; its generated state is not checked in. A fresh checkout starts with the organizer setup empty state.

The launcher runs one local server process with serialized file mutations. Revision-backend tests verify conflict retries for shared persistence, but the experimental launcher deliberately does not connect to hosted storage. No production rollout, real roster migration, or changes to production credentials were performed.

Before a live rollout, observe less technology-confident members offering a car, requesting a ride, and requesting company without coaching. The under-one-minute car-offer goal and need for guided onboarding remain human-verification gates. Screen-reader and physical-phone trials have not been conducted; browser keyboard and responsive checks do not replace them.

The existing pilot wording in §12 says unauthorized requests cannot remove people, while §§7.2 and 7.4 explicitly allow member removal without a PIN after name confirmation. The experiment follows the explicit trusted-group policy in §14; this work does not reinterpret pilot authorization. Childcare, other ordinance types, in-app companion arrangements, and production deployment remain deferred.

## October 2, 2026 — flexible one-session availability

PRD mapping: §14.6 extends §§14.2–14.4; preserves §§7.2–9 and §12 capacity, name-warning, shared-state, and accessible-phone safeguards. Fixed-session rider entry stays short; flexible scheduling is optional. No pilot data migration or deployment.

- `npm run check`, `npm test`: pass, 50 tests total (including the existing pilot regressions). Added range/snapshot validation, no phantom capacity, identity/company preservation, atomic single resolution, cross-store contention, overlapping-only advisory name review, named edits/removal, week replacement with only availability remaining, and public/private API boundaries.
- Browser: 390×844 and 320×740 phone layouts, 1200×900 desktop. No horizontal document overflow at those sizes. Native selects show published time/language choices. Verified optional driver capacity controls and fixed-session default actions.
- Saved a flexible rider without a seat, confirmed exactly one session into its waiting list, then confirmed a flexible driver into a three-seat car using the original car visual. The existing waiting rider stayed waiting. Removed those temporary signups afterward through the API.
- Keyboard: Enter opens the day; dialog receives focus; Tab wraps from Cancel to Close; Escape closes; browser Back retains expanded day. No browser console errors observed.
- Two viewers: another viewer's availability save did not erase an in-progress name/range; closing refreshed it. A subsequent availability edit appeared in the idle second viewer through polling without reload. The browser tool's first short selector wait expired before the poll; a later observation showed the updated entry. No precise propagation latency claim is made.
- Corrected a save-status issue found during browser testing: saving flexibility from a session now navigates to the week before announcing the range confirmation.
- Mobile screenshot: `/private/tmp/temple-flexible-mobile.jpg` (temporary local evidence).
- Local experiment remains available at http://localhost:3001/#week. Sample week intentionally remains configured until explicit organizer replacement.
- Still deferred: observation with less technology-confident members, physical-device/screen-reader trials, official timetable re-verification for rollout, and production rollout.

Potential simplicity improvements to test with members (not additional implemented scope): role-specific entry wording, an optional guided rider flow if observation shows confusion, and letting a trusted helper confirm an agreed session on a rider's behalf using the existing named-confirmation model. No accounts, contact data, or automated pairing are implied.

## October 2, 2026 — intended seats and driver acceptance

PRD mapping: §14.7 explicitly refines §§14.2 and 14.6; retains §§7.2–9, §12, and §14.4 safeguards in the isolated experiment. The earlier unconnected-availability evidence above describes the previous iteration.

- `npm run check`, `npm test`: pass, 57 tests total, including all pilot regressions. Added coverage for shared-session intersection (including one-time riders), pending seat capacity, concurrent requests, stale decisions, typed driver confirmation, rejection/cancellation restoring availability, preserving riders on driver removal/role change, atomic group resolution, fixed-session approval, preserving company-only acceptance, and resetting acceptance after car/session changes. HTTP tests exercise both driver-decision routes and private-log protection.
- Phone browser end-to-end: offered a two-place car for 10:30–12:30; a rider requested 11:30–12:30, removing 10:30 from the possible sessions. The pending request held one place. Choosing a final time was disabled until driver acceptance. Wrong typed driver name disabled saving. Acceptance showed “ride accepted; session time not yet chosen.” The final selector offered only 11:30 ASL and 12:30 language-unset; choosing 11:30 moved driver/rider together and preserved company status.
- Fixed-session browser: **I need a ride** held a place pending acceptance. Opened driver review from Names, accepted the rider, then declined the ride; the rider remained on the session waiting list. Original car visual retained in both flexible and fixed rosters.
- Layouts exercised at 390×844, 320×740, and 1200×900. Narrow-phone document width matched the viewport. Driver decision controls use the existing accessible dialog focus/keyboard infrastructure. Reused the existing ten-second polling and interaction-pause mechanism; two-viewer pause/resume was exercised in the preceding iteration, not repeated for every new decision action.
- Screenshot: `/private/tmp/temple-intended-seat-mobile.jpg`, showing accepted rider, compatible sessions, and time-not-chosen status.
- Temporary demo entries from this verification are removed afterward. Local server restarted with updated backend; no pilot data migration or production deployment.
- Driver acceptance remains a trusted-group recorded action, not authenticated identity. Human usability trials and a production authentication decision remain outside this local implementation.

## October 2, 2026 — day-first signup and exact session selection

PRD mapping: §14.8 supersedes the earlier primary accordion/flexibility choice and broadens one-attendance availability to exact choices across days. §14.7's intended-seat and driver-acceptance safeguards remain.

- Landing uses the existing `/assets/los-angeles-temple-approach.jpg` image with a light text overlay. Signup starts with unselected day checkboxes; no sessions are visible until **Choose sessions**. Existing rosters live in an initially closed **See cars and existing plans** disclosure, with initially collapsed day accordions.
- Browser at 390×844: selected Friday and Saturday, verified zero preselected sessions, used **Select evenings** (exactly Friday 5:30/6:30/7:30), and independently added Saturday 10:30 Spanish. Offered one car against those four alternatives, with advisory name review exercised. Successful save cleared the day selection and left browsing closed.
- Browser single-time rider path: selected Saturday 11:30 ASL, chose **I need a ride**, entered name, and reached the clearly labeled waiting list. No range/flexibility classification or transportation dropdown was required.
- Browser intended-seat path: a car with four choices across Friday/Saturday offered only those choices to its prospective rider. Selecting only Saturday 10:30 saved one intended place and narrowed compatibility accordingly.
- Browser at 320×740: **Select afternoons** selected exactly Saturday 12:30, 1:30, 2:30, 3:30; no horizontal overflow. Tab wraps from the final Back control to Close, and Escape returns to the day picker. Phone-first controls remain at least 44px high. Desktop layout checked separately before handoff.
- Automated tests cover exact nonconsecutive/cross-day choices, no implicit gap filling, revision validation, removed/corrected selections, precise intended-seat intersection, and atomic group resolution. Existing range data remains readable without migrating pilot state.
- Long selections use a count/day summary with exact times available under **Review selected times**. Short selections show full day/time/language directly.
- Human low-tech usability observation remains outstanding. No production deployment. Temporary test signups are removed; final handoff is a freshly reloaded landing page with no selections/disclosures open.

## Explicit ride matching — October 2, 2026

PRD §§14.7–14.9: added rider **Join any matching car** and driver **Add available riders**, covering flexible availability and fixed-session waiting lists. Rider matches are pending; driver collection records acceptance. No-match requests remain available; each assignment recomputes compatibility and capacity inside the conflict-retried write.

Validation: `npm run check`, all 67 tests, and `git diff --check` pass. Added coverage for smallest-capacity selection, incompatible groups, fixed/flexible transfers, preserved IDs/company, stale snapshots, concurrent driver collection and final-seat contention, no-store API responses and private logs. At 390×844, exercised both actual buttons: rider became pending, driver added a second rider as accepted while leaving the first pending; no horizontal overflow. At 1200×900 the control remained visible and Escape dismissed the dialog. Screenshot: `/private/tmp/temple-one-click-matching.jpg`. Removed only the three matching-demo entries after verification. Human usability trials remain deferred; no production rollout.
