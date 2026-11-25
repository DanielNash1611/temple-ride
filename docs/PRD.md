# Temple Ride — Product Requirements Document

> Approved scope update, October 1, 2026: Daniel requested analytics across the live products. Temple Ride now counts signup starts and successful saves using fixed event names and tab-session pseudonymous IDs. No names, rides, trip IDs, locations, notes or roster content enter analytics. DNT, GPC and the visible opt-out are honored; local development sends nothing. Organizer feedback remains the pilot success measure. See [analytics notes](DANIEL_ANALYTICS.md).

**Status:** Approved

**Product:** Temple Ride

**Last updated:** July 22, 2026

**Scope:** Product direction, checked-in baseline, initial pilot requirements, and explicitly deferred ideas

## 1. Summary

Temple Ride is a mobile-first web app that gives one ward or closely connected temple-trip group one shared carpool roster. It replaces separate paper sheets maintained by organizations within that group with a single source of truth. For each upcoming trip, members can offer open seats, claim a seat, add themselves to a rider list when no seat is available, and correct or remove roster entries. A designated organizer manages the one trip currently visible to the group.

The intended end state is that Temple Ride is the place the group relies on for temple-trip transportation coordination: the current trip, who is driving, who is riding with whom, who still needs a ride, and any trip-specific coordination notes. It should make duplicate lists and manual reconciliation unnecessary.

The checked-in baseline already supports a shared roster and ten-second polling. The initial pilot also requires advisory exact-name and family-name matching, member editing and removal, and an administrator-visible current-trip change log; those behaviors are not all implemented yet. Persistent spouse or household linking is deferred beyond the initial pilot.

## 2. Problem

Temple-trip carpool planning is currently managed on paper and across separate sheets maintained by different groups, such as Elders Quorum (EQ) and Relief Society (RS). This fragmentation creates duplicate entries, outdated availability, and unnecessary work for organizers. It also makes it easy for spouses to coordinate separately without realizing that the other person has already signed up or offered a ride.

The group needs one live roster that updates for everyone when a person signs up, offers a car, changes plans, or is reassigned. Before a signup is saved, a member should be warned when the entered name exactly matches an existing signup or shares a last name with someone already on the roster.

## 3. Goals

1. Let a member offer a car and declare its available passenger-seat count in under one minute.
2. Let a member claim an available seat using only their name.
3. Make remaining capacity and unassigned riders easy to understand, while warning members about likely duplicate or family-related signups.
4. Keep one shared roster current for both EQ and RS, with updates visible to active viewers within the accepted ten-second polling interval.
5. Let an organizer publish, update, replace, and clean up the one trip currently visible to the group.
6. Make Temple Ride the authoritative place for trip transportation coordination, eliminating parallel paper sheets.
7. Keep the data collected and the operating burden appropriate for a small, trusted group.
8. Let members correct or remove roster entries without accounts or private recovery tokens while reducing accidental removals through explicit confirmation.
9. Give the organizer a concise record of changes to the current trip.

## 4. Non-goals

- General-purpose social messaging, payments, expense sharing, navigation, or route optimization.
- A public directory of phone numbers, email addresses, or home addresses.
- A multi-stakeholder calendar product beyond the currently coordinated temple trip.
- A multi-trip calendar, recurring-trip scheduling, or trip history for members.
- Multi-ward operation, separate group workspaces, or coordination across time zones.
- Accounts, verified member identity, ownership enforcement, or private per-signup edit tokens for the initial pilot.
- Persistent spouse, family, or household linking for the initial pilot.
- Automatic matching of riders to drivers unless a member explicitly selects **Join any car** for that signup.
- Replacing organizer judgment about safety, capacity, assignments, or last-minute exceptions.

The product MAY add focused trip-coordination notes or notices when they are needed to make the roster self-sufficient. It is not intended to become a general chat app.

## 5. Users and needs

| User | Primary need | What success looks like |
| --- | --- | --- |
| Member offering a ride | Quickly show that they can drive and how many passengers they can take. | Their car appears immediately with the correct number of open seats. |
| Member needing a ride | Find a seat or make their need visible. | They can join an open car or the rider list without an account. |
| Member correcting the roster | Fix or remove an outdated or mistaken entry without administrator help. | They can edit an entry or remove it after a clear confirmation. |
| Family or household member | Avoid duplicate or conflicting sign-ups. | A name-match warning shows the possible duplicate or family member’s current car or rider-list status before the new signup is saved. |
| Trip organizer | Keep the shared trip information accurate and understand recent changes. | They can update the trip, manage sign-ups, and review the current trip’s change log without exposing admin controls to ordinary members. |

## 6. Product experience

### 6.1 Member experience

The home screen shows either the current trip or a clear empty state. A current trip includes the temple, date, session time, optional organizer note, and the shared roster for the entire participating group—not separate EQ and RS lists.

Members can use two views of the same group:

- **Seats:** see each driver’s available and filled passenger seats; select an open seat and enter a name to join that car.
- **Names:** see the drivers and riders by name.

A member can also select **Add my car**, enter a name, and offer one to eight passenger seats. A member who does not care which open car they join can explicitly select **Join any car**, enter their full name, and be assigned at random to one currently open passenger seat. If no seat is available, the member can choose **I need a ride** and add their name to the rider list.

Before a signup is saved, the app compares the normalized entered name with names already on the active-trip roster:

- An exact-name match produces a possible-duplicate warning. The warning identifies whether the existing name is driving, riding with a named driver, or waiting for a seat, and asks the member to confirm the new signup or cancel.
- A last-name match produces a possible-family-member warning and shows the matching person’s current status. If that person is associated with a car that still has an open seat, the member can continue the original signup, join that car instead, or cancel. If there is no associated car or the car is full, the member can continue the original signup or cancel.
- If more than one existing person matches, the warning shows each match and its status. Each distinct matching car with an open seat is an available join option.

These warnings are advisory. They do not establish or persist a spouse or household relationship, and the product does not claim that people are related merely because their last names match.

Because the initial pilot is a small, trusted group, any member can edit or remove a roster entry without an account or private recovery token. Editing supports correcting a display name, changing a driver’s offered capacity, or moving a rider between an available car and the rider list. Selecting an occupied seat opens that rider’s management dialog with a **Change cars** action rather than the full destination list. After that action is selected, available cars appear first and the rider-list option appears last. Selecting a destination then reveals the typed-name confirmation required to save the move. Removal from other views uses the same typed-name safeguard. If the entry is a driver, the confirmation also explains that the driver’s assigned riders will move to the rider list.

When someone changes the roster, other active viewers see the new state promptly without having to discover it through another sheet or paper list. The roster is the authoritative record for the trip.

### 6.2 Organizer experience

The organizer enters a PIN to access the administrative area. The organizer can:

- Create or edit the current trip’s temple, date, session time, and optional note.
- Review the current sign-ups.
- Remove a driver, rider, or waitlisted member.
- Review an administrator-only change log for the current trip.
- Remove the current trip; this returns the app to the empty state, where the organizer can post a replacement trip.

If an organizer removes a driver, the driver’s riders move to the rider list rather than disappearing.

## 7. Functional requirements

### 7.1 Current-trip model

- The app MUST show at most one active trip to members.
- A trip MUST include a temple, date, and session time; it MAY include a short note.
- The organizer MUST be able to update the active trip.
- The organizer MUST remove the active trip before creating a replacement.
- A member attempting to change a trip that has just been replaced MUST be told to refresh rather than changing a stale trip.

### 7.2 Driver and rider sign-up

- A driver MUST supply a display name and from one through eight open passenger seats.
- A rider MUST supply a display name.
- The app MUST prevent a rider from claiming a seat once that car is full.
- A rider who does not select a car MUST be added to the rider list.
- When a member explicitly selects **Join any car**, the server MUST choose at random from the passenger seats that are still open when the signup is saved and MUST return the assigned driver.
- **Join any car** MUST fail with a plain-language no-open-seats error rather than adding the rider to the rider list or overfilling a car.
- Any member MUST be able to edit a driver’s display name and offered passenger-seat count.
- An edit MUST NOT reduce a driver’s capacity below the number of riders currently assigned to that car.
- Any member MUST be able to edit a rider’s display name and move the rider to another available car or to the rider list.
- Moving a rider to a car MUST re-check that car’s current capacity when the change is saved.
- Selecting an occupied seat MUST show the rider’s full displayed name and a **Change cars** action without showing the destination list upfront.
- Selecting **Change cars** MUST show available cars before the rider-list option. Selecting a destination MUST then reveal the typed-name confirmation and save action.
- A rider on the rider list MUST have an **Add to a car** action that opens **Join any car** followed by the available specific-car choices. Either choice MUST reveal the same typed-name confirmation before the rider is moved.
- Before a move or removal initiated from an occupied seat is sent, the member MUST type the rider’s displayed name. The server MUST reject the change unless the confirmation matches that current name after case-insensitive whitespace normalization.
- Any member MUST be able to remove a driver, assigned rider, or unassigned rider without an account or private per-signup token.
- Before a removal request is sent, the interface MUST require the member to type the displayed name of the person being removed. The server MUST reject the removal unless the confirmation matches that current name after case-insensitive whitespace normalization. Removing a driver MUST also disclose that the driver’s assigned riders will move to the rider list.
- Removing a driver MUST preserve the driver’s assigned riders by moving them to the rider list.
- The app MUST show names and seat availability from the shared current state after a completed sign-up.
- The service MUST handle simultaneous changes without silently overwriting another successful sign-up.

### 7.3 Shared roster and name-matching safeguards

- There MUST be exactly one shared active-trip roster for all participating groups, including EQ and RS.
- A roster change MUST be persisted once and reflected consistently to every viewer of that trip.
- While the member view is active and no form, dialog, or popover is in progress, the app MUST poll for the shared roster at least once every ten seconds without requiring a manual refresh.
- Background polling MAY pause while a member is completing a form or interacting with a dialog or popover so an update does not interrupt that action. Polling MUST resume afterward, and successful changes MUST refresh the shared state immediately.
- Before saving a new signup or a changed display name, the app MUST compare the entered display name with every other driver, assigned rider, and unassigned rider on the active trip. The entry being edited MUST be excluded from matching against itself.
- Name comparison MUST be case-insensitive after applying the same whitespace normalization used when saving names.
- An exact normalized name match MUST show a possible-duplicate warning with the existing signup’s status and associated driver, if any. The member MUST explicitly confirm the new signup or cancel it.
- When the entered name and an existing name each contain at least two words, an equal final word MUST be treated as a possible last-name match. The app MUST describe this only as a possible family-member match, not as a confirmed relationship.
- A last-name warning MUST identify the matching person and whether they are driving, riding with a named driver, or waiting for a seat.
- If a possible family member is associated with a car that has an open seat, the warning MUST offer that car as an alternative destination. Choosing it MUST re-check capacity when the signup is saved.
- A name-match warning MUST allow the member to continue the originally requested signup or cancel. When multiple names or cars match, the app MUST show all matches and all distinct eligible cars rather than silently choosing one.
- Name matching MUST NOT create or persist a spouse, family, or household link.

### 7.4 Administration

- Trip creation, trip-detail changes, trip deletion, and access to the administrator change log MUST require the administrator PIN.
- Verification of a PIN MUST not by itself grant an unauthenticated API caller permission to change a trip; protected requests MUST carry the PIN.
- The regular member flow MUST keep administrative controls out of the main sign-up path.
- Ordinary member editing and removal described in section 7.2 MUST NOT require the administrator PIN and MUST NOT grant access to other administrator actions.

### 7.5 Current-trip change log

- Trip creation and successful trip-detail updates, roster additions, edits, moves, and removals MUST append an entry to the active trip’s change log.
- Each entry MUST include a timestamp, action type, affected display name, and a concise before-and-after description when applicable.
- An entry MAY distinguish a request carrying the valid administrator PIN from an ordinary member request, but it MUST NOT claim to identify the individual who acted.
- The change log MUST be visible only in the PIN-protected administrator area.
- The product MUST NOT collect IP addresses, device identifiers, or additional personal data for the change log.
- The log is scoped to the current trip and is deleted with that trip. It is not member-visible trip history and does not provide automatic rollback.

### 7.6 Validation and errors

- Names MUST be non-empty, normalized, and no more than 80 characters.
- Temple names MUST be no more than 100 characters; notes MUST be no more than 240 characters.
- Dates and 24-hour session times MUST be valid.
- For the initial single-group deployment, the trip date and session time MUST be interpreted in the shared local time zone used by both the temple and organizer. The product does not need to collect or convert a separate time zone.
- The app MUST return plain-language errors for invalid input, full cars, stale trips, and unavailable cars.
- Requests larger than 20 KB MUST be rejected.

## 8. Privacy and security requirements

- The product MUST collect only the information needed for shared roster participation and advisory name matching.
- The product MUST NOT create a public directory of phone numbers, email addresses, or home addresses.
- Everyone with access to the Temple Ride app MAY see the active trip’s entered names, driver assignments, rider assignments, and rider-list status.
- The product MUST disclose this shared roster visibility before a member submits a signup.
- The product MUST disclose that members of the trusted group can edit or remove roster entries without identity verification.
- The administrator PIN and hosted storage credential MUST be set as deployment secrets and MUST NOT be committed to the repository.
- Hosted state MUST be stored in private storage.
- The pilot’s PIN-based administration is acceptable only for a small, trusted group. A broader launch requires stronger administrator authentication, rate limiting, backups, and a managed database.

## 9. Quality requirements

- The app MUST work well on a phone-sized screen and remain usable with a keyboard and assistive technology.
- The main screen MUST provide a skip link, labeled controls, visible status feedback, and accessible dialogs.
- The app MUST avoid caching roster API responses and MUST poll for current roster state at least every ten seconds while the member view is active and not in an interaction that temporarily pauses updates.
- The system MUST support local file storage for development and private blob-backed storage when deployed to Vercel.
- The shared state store MUST use conflict detection and retry behavior when concurrent writes occur.

## 10. Success measures for the pilot

Because this is a deliberately small pilot, prioritize direct organizer feedback over complex analytics. A pilot is successful when:

- EQ and RS can publish and complete a trip’s carpool roster without paper sheets, parallel spreadsheets, or manual reconciliation between groups.
- Members can independently add a car or claim a seat without organizer assistance.
- Exact-name and possible-family warnings show the relevant existing status before a signup is saved, and no pilot participant reports that the warning led them to the wrong car.
- Members can correct or remove entries without organizer assistance, and typing the affected name before removal prevents reported accidental removals during the pilot.
- The organizer can resolve a cancellation or remove an accidental sign-up without data loss.
- The organizer can use the current-trip change log to understand what changed without the product claiming to identify an unauthenticated member.
- No participant reports uncertainty about whether they or another group member has a seat or still needs a ride.
- The group considers the minimal data collection appropriate for its members.

## 11. Launch readiness

Before sharing outside a local development environment:

1. Set a non-demo `TEMPLE_CARPOOL_ADMIN_PIN` as a deployment secret.
2. Connect a private Vercel Blob store and confirm `BLOB_READ_WRITE_TOKEN` is available to the deployment.
3. Verify the deployed app can create a trip, add a driver, fill a seat, add a waitlisted rider, and remove each type of signup.
4. Verify a roster update appears to another active, idle phone within ten seconds and that polling resumes after an in-progress form or dialog closes.
5. Verify exact-name and possible-family warnings show the correct current status and eligible car choices before saving.
6. Verify a member can edit and remove each signup type, every removal requires the affected name to be typed again, and driver removal preserves riders.
7. Verify the administrator can see accurate current-trip change entries and an ordinary member cannot access them.
8. Confirm that no secret, local data file, or test data has been committed.
9. Give the organizer the PIN through an appropriate private channel and explain that everyone with access to the app can see, edit, and remove roster entries.

## 12. Acceptance criteria

The initial pilot is ready when all of the following are true:

- An organizer can publish one current trip with a temple, date, and session time.
- A member can add a car with one to eight passenger seats.
- Another member can claim an open seat; the available-seat count immediately decreases.
- A member can explicitly choose **Join any car**, enter their full name, and be assigned at random to a seat that is still open when the signup is saved.
- A member cannot overfill a car and receives a useful message if the seat was just taken.
- A member can add themselves to the rider list without choosing a car.
- A member can edit a driver or rider without an account or private recovery token; capacity rules are still enforced.
- Tapping an occupied seat first shows **Change cars**; choosing it shows cars before the rider-list option, and choosing a destination reveals the displayed-name confirmation required to save the move.
- A rider waiting for a seat has an **Add to a car** action that offers **Join any car** before the available specific-car choices and requires the rider’s displayed name before saving.
- A member can remove any roster entry only after typing the affected person’s displayed name; a mismatched confirmation is rejected, and driver removal warns about and preserves assigned riders.
- The group can switch between seat-focused and name-focused views.
- EQ and RS members see the same active-trip roster rather than separate lists.
- An exact normalized name match warns about a possible duplicate, identifies the existing signup’s status and car when applicable, and requires confirmation before another signup is saved.
- A possible last-name match warns about a possible family member, identifies the matching signup’s status, and offers the matching car when it has an open seat.
- When one connected member changes the roster, another active member who is not in the middle of an interaction sees the change within ten seconds without a page refresh.
- An organizer can remove a rider, a waitlisted member, or a driver; removing a driver preserves that driver’s riders on the rider list.
- The PIN-protected administrator area shows a current-trip change log without collecting or claiming an unauthenticated actor identity.
- Unauthorized requests cannot modify trip information or remove people.
- The app is usable on a phone and exposes its main controls with accessible names and feedback.

## 13. Product decisions and open questions

### 13.1 Decided

1. **Name matching:** The initial pilot will use advisory exact-name and possible-family last-name warnings. It will not create persistent spouse or household links.
2. **Roster visibility:** Everyone with access to the app may see entered names and ride assignments, with disclosure before signup.
3. **Roster refresh:** Ten-second polling is acceptable. Updates may pause during an in-progress interaction and must resume afterward.
4. **Member editing and removal:** Any member may edit or remove roster entries without identity verification or a private recovery token. Removal requires typing the affected person’s displayed name again, and driver removal also warns that riders will move to the rider list.
5. **Change log:** The administrator can review a minimal log for the current trip. The log records what changed, not the identity of an unauthenticated member, and is deleted with the trip.
6. **Pilot scope and time:** The initial product serves one ward or closely connected group. The organizer and temple use the same local time zone, so no time-zone selection or conversion is required.
7. **Explicit random assignment:** **Join any car** is the only automatic-assignment behavior in the initial pilot. It runs only after the member chooses it and assigns that new signup to one currently open passenger seat.

### 13.2 Deferred beyond the initial pilot

1. **Richer spouse awareness:** Persistent spouse or household linking beyond advisory last-name recognition is not part of the initial pilot. Its confirmation method, privacy model, and lifecycle remain to be decided if it is pursued later.
2. **Stable requirement identifiers:** Formal requirement IDs and a traceability matrix may be added later; section numbers and acceptance-criterion text are sufficient for the initial pilot.
3. **Broader deployment:** Multi-ward operation, separate group workspaces, and cross-time-zone behavior are outside the intended initial scope and have no planned requirements.

### 13.3 Remaining open questions

1. **Coordination details:** Which focused, in-app trip details are needed for Temple Ride to become the sole coordination surface—meeting instructions, organizer notices, confirmed assignment, or something else?
2. **Pilot ownership:** Who is responsible for updating or deleting the current trip after each visit, and how will EQ/RS organizers share that responsibility?

## 14. Approved local Temple Week experiment

**Status:** Approved for isolated local implementation; production rollout is deferred.

### 14.1 Scope and relationship to the pilot

The normal single-trip pilot in sections 1–13 remains the deployment baseline. This experiment explicitly expands sections 3–4, 5–6, 7.1, 7.4, and the single-trip acceptance criterion in section 12: an organizer configures one temple and seven consecutive local dates, with multiple endowment sessions each day. There is one shared roster per session for all participating organizations. This iteration is specifically for endowment sessions, with a displayed session language. There is no activity-type picker, automatic archiving, recurring weeks, or member-visible history. Childcare, companion pairing, accounts, messaging, and production migration remain deferred.

### 14.2 Member experience and requirements

- The overview shows the complete configured week as a day accordion. All days start collapsed with a date, session count, and expansion indicator. Selecting a day reveals its chronological endowment times, languages, available seats, ride needs, and company requests; opening another day closes the previous one. Selecting the open day collapses it. Keep the selected day open across roster polling and when returning from a session. Day controls must work with a keyboard and expose their expanded state; collapsed session links must not receive keyboard focus. Days with no sessions remain visible and clearly identified.
- Members choose a listed endowment session. **Add my car** asks for name and one through eight passenger seats; it is focused on that selected time slot. **I need a ride** and the secondary **I have my own transportation** action collect the member’s name without a redundant transportation selector. Editing still supports changes among these roles.
- **I’d like someone to attend with** is independent of transportation, never takes a seat, and remains set after joining a car until explicitly cleared. Coordination occurs outside the app.
- Equal day/time plans share a session. Creating a session and saving its initial participant MUST be atomic, including name-review confirmation and concurrent submissions.
- Each session retains Seats and Names views and the original recognizable car visual with clickable passenger seats. **I need a ride** combines the previous any-car and waiting-list choices: assign an open seat in the car with the fewest remaining seats, with stable ordering for ties; if no seat is available at save time, retain the signup on this session’s waiting list. Specific-seat joining still rejects a newly full car. Waiting members may explicitly request any open car from **Add to a car**. Posting a car or editing company status does not automatically move existing waiting members. People with their own transportation are distinct from drivers and waiting riders. This replaces random assignment only in the local experiment; §13.1’s pilot behavior is unchanged.
- Name warnings include every participant in that session, including self-transportation entries, and exclude other sessions. Names do not establish identity across sessions.
- Transportation and company edits retain the participant ID. All experimental participant edits and removals require the current displayed name to be typed. When a driver stops offering a car, assigned riders remain on that session’s rider list; the interface MUST disclose that consequence before confirmation.
- Use inline explanations and optional **How this works** help, with no mandatory tour. Forms and saved confirmations repeat their day, time, and session language; disclosures include shared company-request visibility and trusted-group editing.

### 14.3 Organizer, stale state, and privacy

- Organizers can post empty endowment slots before members sign up, including multiple times on the same day. Copy times and languages from the current official temple schedule; never infer a timetable from historical schedules or assume an unknown language is English. Session language is optional when unknown and must remain unset, displayed as “Language not set.” Language is a session detail, not an individual language preference or a separate roster at the same time. Week setup/replacement, posting empty slots, session corrections/deletion, and session-log access require the PIN on every request. Member plan submission is the only exception to organizer-only session creation.
- Once any session exists, changing the week’s temple or dates requires explicit replacement with a confirmation explaining that all of its sessions, signups, and logs will be removed. The complete week remains visible until explicitly replaced or removed.
- Session time and language corrections invalidate open forms. Session detail changes cannot merge two existing sessions implicitly. Session deletion removes only that session and its private log. Week deletion/replacement removes the old week and its sessions.
- Forms MUST carry their original week/session context. Removed sessions and changed session details must be rejected before mutation with a review-and-refresh message. A roster-only update MUST NOT invalidate unrelated submissions.
- Preserve the existing validation, capacity enforcement, named-removal safeguard, ten-second idle polling with interaction pause/resume, `no-store` responses, and conflict retries from sections 7–9.
- Logs remain PIN-protected and session-scoped, include successful additions/edits/removals and company changes, and never identify an unauthenticated actor. Public API responses MUST omit logs.

### 14.4 Isolation and acceptance

- A dedicated local launcher MUST use separately ignored file storage and disable Blob access even when hosted credentials are present. It MUST NOT read, migrate, or overwrite the pilot roster. The normal entrypoint MUST retain pilot behavior.
- Acceptance extends section 12 with: independent session rosters; atomic equal-time session reuse; participation in multiple sessions without cross-session duplicate warnings; automatic ride assignment with a waiting-list fallback; displayed endowment languages; multiple posted times per day; independent ride/company needs; self-transportation; participant-preserving transportation changes; stale form rejection; and PIN-protected week/session management.
- Automated verification covers week boundaries, simultaneous submissions and seat contention, authorization, private logs, confirmations, state isolation, and the existing pilot regressions. Browser verification covers phone/desktop layouts, keyboard and dialog focus, browser back, and two-viewer polling with interaction pause/resume.
- Before a live rollout, observe less technology-confident members offering seats, requesting rides, and requesting company without coaching. Preserve section 3’s under-one-minute car-offer goal and use observed confusion to decide whether guided onboarding is needed. This human check is a future rollout gate, not proof supplied by automated tests.

### 14.5 Organizer-provided Friday/Saturday chart

For this local experiment, the organizer supplied a Friday/Saturday endowment chart from previous research. Use the supplied chart as local experiment data without claiming fresh official verification. Friday has 10:30 AM, 11:30 AM, 12:30 PM, 5:30 PM, 6:30 PM, and 7:30 PM. Saturday has hourly sessions from 5:30 AM through 3:30 PM, with Samoan at 6:30 AM, Spanish at 10:30 AM, and ASL at 11:30 AM. Unlabeled languages remain unset. These AM/PM interpretations follow the chronological chart; the source did not explicitly include AM/PM. Populate the matching Friday and Saturday in the configured local week, without automatically generating recurring future weeks. Fresh official verification remains a live-rollout requirement. This refines §14.3’s source requirement for the approved local experiment only.

### 14.6 Flexible availability for one session (approved October 2, 2026)

A member may offer availability for **one** session within a range of listed session start times on one day. This is not attendance at every session. Drivers are generally more comfortable with technology than riders; preserve the short, fixed-session rider flow, with flexible scheduling optional. Design and verify phone layouts first.

- Keep the day accordion and fixed-session actions. Offer **My time is flexible** for days with multiple listed sessions and as an optional alternative in new signup forms. Default the day-level flexible form to needing a ride; drivers may select an offer and its passenger capacity. Never infer a member's ability or hide options based on their role.
- Choose earliest and latest listed session starts, with language labels in the choices. The range covers the intervening listed sessions on that day, inclusive. Require at least two different listed starts. Keep company preference independent.
- Store one flexible availability entry at week level, outside every session roster. Show it under **Flexible plans · no seats reserved**, including range, transportation, and company preference. Potential driver seats do not count as open seats; flexible ride requests do not appear as confirmed riders or session waiting entries.
- Members coordinate outside the app, then explicitly choose one currently listed session within the range and type the current displayed name. Atomically replace availability with exactly one session participant, retaining participant ID and company preference. A driver offers their seats only at the selected session. A ride request uses the existing fullest-car-first placement or waiting-list fallback; a confirmation must distinguish a seat from waiting for a ride. No automatic matching, bulk attendance, contact details, or new identity model is introduced.
- Flexible plans can be edited or removed with typed-name confirmation. Their own revision prevents stale edits and duplicate confirmation. Forms retain original week/session details; a changed timetable requires review. A deleted session is no longer selectable; flexible availability remains visible for the day, including when no listed times remain, so members can correct or remove it. Week replacement/removal clears flexible plans too and requires replacement confirmation even if only flexible plans remain.
- Apply advisory name review across the listed sessions covered by a range and overlapping flexible plans. Keep matches advisory; identify flexible matches as availability with no seat reserved. Confirming a range checks the chosen roster again and excludes the availability entry itself. Different nonoverlapping sessions remain independent.
- Availability changes are recorded in the private logs of currently listed sessions covered by the range. No new public log or permanent week history is introduced. Existing session deletion removes only that session's log.
- Acceptance extends §§14.2–14.4 and preserves §§7.2–9 and §12: no phantom seats; exactly-one-session resolution under contention; range validation; preserved company and participant identity; named changes; private logs; stale form rejection; polling pause/resume; mobile and keyboard usability. Human usability observation remains required before rollout.

### 14.7 Intended seats, compatible sessions, and driver acceptance (approved October 2, 2026)

Flexible scheduling is now tied to a specific intended car seat. This supersedes §14.6's requirement that all flexible availability remain unconnected until a session is chosen. Driver acceptance applies to newly requested rides in fixed sessions too, refining §14.2's automatic placement into a held place pending acceptance. The normal pilot remains unchanged.

- Use the original car visual for flexible cars. An open place can receive a rider's request with the listed session starts they can attend (one start or an inclusive range). A member already listed as needing a ride can attach that same entry to a compatible car. Each rider has at most one intended car; do not infer identity or merge entries by name.
- Pending and accepted riders each hold one passenger place in that car, preventing concurrent overbooking. The flexible car remains outside fixed-session seat totals. Distinguish **awaiting driver acceptance**, **ride accepted; time not chosen**, and the final session roster. Mark pending seats with text and a distinct visual treatment, not color alone.
- As soon as a potential rider requests a place, derive the car's possible sessions from the intersection of the driver's original availability and every pending/accepted rider's availability. Reject a request or edit if no currently listed session works for everyone. Show the exact remaining times and languages. Retain original availability so cancelling or declining a request restores times that become compatible again.
- Drivers review each rider and accept or decline in the app. Require typing the driver's current displayed name. This is a trusted-group recorded decision, not verified driver identity; no account or private credential is added. Only record a driver's agreed decision. Cancel requests using the rider's current name. Keep revision checks so stale decisions cannot undo a newer request or acceptance.
- A decline/cancellation releases the held place and preserves the rider's availability, company preference, and ID. Removing a flexible driver or changing them to another transportation role releases all intended riders back to independent ride needs with a warning; never delete those riders. Prevent reducing a car below its held places. A rider's name/time edits require fresh driver acceptance; company-only edits preserve acceptance.
- The driver resolves pending requests before choosing a final time. Only show currently listed sessions that work for everyone. Atomically move the driver and all accepted riders into that one session, retaining IDs, company preferences, and accepted ride status. A linked rider cannot independently confirm a different session without first cancelling their request.
- For fixed-session cars, new specific-seat requests, any-car requests, and moves to a different car hold capacity pending driver acceptance. Driver acceptance confirms the ride; decline preserves the member on that session's waiting list. Existing experimental riders without an acceptance field retain their previous confirmed status. Company-only edits and remaining in the same car preserve acceptance. Corrections to session day/time/language require renewed acceptance; note-only edits do not. The user must be able to review riders from both Seats and Names views.
- Keep PIN-protected private session logs, name warnings, typed-name safeguards, no-store responses, isolated storage, and form-paused polling. Record ride decisions without claiming verified actor identity. No automatic messages, matching, accounts, or production rollout.
- Acceptance: pending-seat contention cannot overbook; all riders share at least one compatible session; rejected/cancelled requests restore capacity and possible times; stale approvals fail; final group resolution is atomic; driver cancellation preserves riders; pending versus accepted labels remain clear on phone and desktop.

### 14.8 Day-first entry and exact session choices (approved October 2, 2026)

The member's primary goal is to offer a ride or request one for the times they can attend. Replace the competing day accordion/flexibility entry points with one mobile-first signup sequence, refining §§14.2, 14.6, and 14.7:

- The landing header uses the original MVP's Los Angeles Temple background image with readable text. Begin with **Which days work for you?** Select one or more configured days, including a consecutive range, using large labeled checkboxes. Initially no day or session is selected; no session list is expanded. Days without posted sessions are identified and disabled for new signup.
- **Choose sessions** shows a grouped checklist of only the selected days' posted sessions, with language beside each time. Select any number, including nonconsecutive choices. Optional **Select afternoons** (12:00 through before 17:00) and **Select evenings** (17:00 onward) add matching listed sessions; individual checkboxes remain editable. No times are silently preselected. Select all/Clear are secondary conveniences.
- After choosing sessions, present **I can offer a ride** and **I need a ride** with the secondary self-transportation option. One selected session follows the existing short fixed-session signup. Multiple choices describe alternatives for one attendance, not a signup at every time. Collect the name and show seat count only for a driver. Do not ask members to classify their schedule as fixed or flexible before stating the times.
- Store exact session IDs with their detail revisions for new multiple-choice availability, including choices across different days. Do not fill unselected gaps or automatically include newly posted sessions. Existing local range entries remain readable. Corrected or removed selected sessions cease to be eligible until the availability is reviewed and saved against current details.
- Intended-seat compatibility uses exact set intersection across all driver/rider choices. Preserve §14.7's capacity holds, driver acceptance, cancellation, and atomic group confirmation. Flexible cars appear under days where a compatible session remains; if none remain, keep an accessible entry for correction/removal. Selecting the final session shows its day, time, and language.
- **See cars and existing plans** is a separate, initially closed browsing disclosure. Its day accordions are also initially closed. Never leave an expanded browse section as the initial testing handoff. Existing selections are retained during an in-progress form and are reset after a successful signup or page reload.
- Summarize longer selections by count/day, with exact choices available for review. Maintain accessible labels, keyboard controls, focus, polling pause during selection/forms, original car visuals, and §§7.2–9 safeguards. Acceptance adds arbitrary nonconsecutive/cross-day selection, truthful shortcut boundaries, no default expanded/selected state, and exact-set seat compatibility. This remains local-only; human usability observation is still deferred.

### 14.9 One-click ride matching (approved October 2, 2026)

- **Join any matching car** matches an independent rider to an open fixed or flexible car within their exact selected sessions. Choose the car with fewest open places, then creation time and ID for stable ties. Hold one place pending driver acceptance; preserve identity and company preference. New multiple-session ride requests can save and match atomically. With no match, keep the availability or waiting entry and explain that no place was found.
- **Add available riders** explicitly records the driver's acceptance and fills open places from independent flexible ride needs and fixed-session waiting entries, oldest first with ID tie-breaks. Recompute the whole car's common sessions after each rider; skip incompatible riders. Pending/accepted riders in other cars are not reassigned. A fixed waiting entry transferred into a flexible car retains that one session as its only choice.
- These two explicit matching buttons are narrow exceptions to typed-name confirmation for existing-entry changes. Bind actions to the original week and participant revision (or exact fixed-entry snapshot and session revision). Keep typed safeguards for editing, cancellation, removal, and individual driver decisions. Trusted-group access is unchanged; acceptance does not prove actor identity.
- Match only on an explicit click, atomically with conflict retries. Never overfill, assign a rider twice, add unselected times, or run background matching. Existing signup name warnings and private session logs remain in place. A flexible car's final session still requires the existing group-confirmation flow.
- Acceptance extends §§14.7–14.8: verify no-match preservation, smallest-capacity selection, driver acceptance, shrinking intersections, fixed/flexible transfers, stale actions, concurrent claims, and mobile buttons. Pilot behavior and production storage remain unchanged.

### 14.10 Browse available rides first (approved November 24, 2026)

In the local experiment, show **Find a ride** before the day picker. This revises the landing order in §14.8. List fixed sessions with open seats chronologically, including day, time, language and remaining capacity. Selecting a time opens its car roster. List each flexible car with space once, using only the times still compatible with everyone in that car. Let the rider choose possible times before requesting a place. Pending and accepted riders both use capacity under §§14.7–14.9.

Keep the complete timetable and existing plans in a secondary disclosure. Keep day selection available for offering a ride, requesting another time, or attending independently. Start with no day selected. If no car has an available place, show that explicitly and direct members to the day picker. Acceptance includes mobile and keyboard access, an empty state, and continued access to full cars and sessions without drivers.

### 14.11 Role selection, day matching and organizer support

Start the local experiment with four equally prominent choices: **I need a ride**, **I’m driving**, **I’m still deciding**, and **I need help to attend**. The fourth button opens the organizer support form directly, with babysitting mentioned at entry. The choice is changeable and does not create a signup. Riders see available rides first, drivers choose days and sessions for their car, and undecided members may browse before choosing transportation. This refines §§14.8–14.10.

Beside each day with an open fixed or compatible flexible car, offer **Join Any Car**. Show the day’s eligible session choices before collecting a name. Allow the rider to change times and use §14.9 matching at save time. The result is a pending place or a retained ride request if no seat remains.

Extend §14.1’s childcare scope only to organizer-facilitated requests. From the role chooser, members may submit their name, optional preferred day and one or more of babysitting, ride, company, questions or family history help. A babysitting request may specify a sitter with nursing credentials. Follow-up and credential checks take place outside the app. A request creates neither a ride signup nor a care assignment.

Store requests with the current week. Only the PIN-protected organizer inbox lists requests and records completed follow-up. Exclude requests from all public roster and name-match data and session logs. Replacement or deletion of the week clears its requests. The shared-PIN local demo is for example requests. Acceptance includes accessible role selection, day-scoped matching, validation of the nursing option, stale-week rejection, and PIN checks on every inbox read and update (§§7–9).

### 14.12 Session-specific ride requests and undecided members

On the local ride finder, label the planning shortcut **Request another time**. Each available session time offers **Join Any Car** for that exact session, using §14.9 matching with driver acceptance. Where multiple times are available on a day, keep §14.11’s broader option as **Any time this day**.

**I’m still deciding** opens the whole week’s session checklist immediately. Show the language, scheduled car count and remaining seats, and identify compatible flexible offers separately. Include sessions with no cars so members can offer a ride there. After selecting one or more times, members can choose to drive or ride, or change their selection. Preserve the exact times, including nonconsecutive choices, through signup (§§14.7–14.9).

### 14.13 Organizer-selected member view

In the local experiment, Admin can show **Temple Week** (the default) or a **Specific Temple Session** from that week. The choice applies to everyone who opens the member page, including members following an older session link. A specific session opens directly to its roster and keeps the session’s seat, ride approval, company, and organizer support actions available.

Switching views preserves every signup and flexible plan. While one session is shown, member reads, signups and matching use that session’s roster. Admin retains access to the full timetable, support inbox and private logs. To remove the published session, first select another session or show the whole week.

Acceptance extends §§7.4, 12 and 14.3–14.4. Every change requires the organizer PIN and current week and session details. Idle viewers see the change on refresh. Open forms retain their original context and reject a save after the organizer changes the view. Switching back restores the full week, including signups made in the specific session.

### 14.14 Saved events, preview and history

Admin can save an event as a single endowment session or a seven-day Temple Week. A new event starts as a private draft. Organizers can edit the temple, dates, session times, languages and note, and preview the member experience before opening signups. Preview is read-only. This extends §14.13 and the experiment’s scope in §§4 and 14.1 to include organizer-visible event history.

The active event card opens the corresponding organizer editor through **Edit session details** or **Edit week details**. On that card, **Change event type** switches the same event between Temple Week and a selected Temple Session using the signup protections in §14.13.

**Make active** publishes the selected event and moves the previous active event into history in one operation. **End event** moves it to history and closes signups until another event is selected. History preserves the event’s schedule, rosters, flexible plans, private requests and logs. Organizers can preview or reactivate an event. The existing local week starts as the active event.

Acceptance extends §§7.1, 7.4, 9, 12 and 14.3–14.4. Draft, preview, history and publication actions require the PIN on every request. Members see at most one active event. Stale forms cannot write across a switch or a subsequent reactivation. Simultaneous publication attempts cannot overwrite the other organizer’s choice. Saving or previewing a draft leaves the active event available to members.
