# Temple Ride — Product Requirements Document

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
