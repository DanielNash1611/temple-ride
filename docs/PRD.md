# Temple Ride — Product Requirements Document

**Status:** Approved

**Product:** Temple Ride

**Last updated:** July 22, 2026

**Scope:** Product direction, current pilot baseline, and the next release requirements

## 1. Summary

Temple Ride is a mobile-first web app that gives a temple-trip group one shared, live carpool roster. It replaces separate paper sheets maintained by different groups with a single source of truth. For each upcoming trip, members can offer open seats, claim a seat, or add themselves to a rider list when no seat is available. A designated organizer manages the one trip currently visible to the group.

The intended end state is that Temple Ride is the place the group relies on for temple-trip transportation coordination: the current trip, who is driving, who is riding with whom, who still needs a ride, and any trip-specific coordination notes. It should make duplicate lists and manual reconciliation unnecessary.

The checked-in pilot already supports a shared roster, but live push updates and spouse-aware status are next-release requirements; they are not yet implemented behavior.

## 2. Problem

Temple-trip carpool planning is currently managed on paper and across separate sheets maintained by different groups, such as Elders Quorum (EQ) and Relief Society (RS). This fragmentation creates duplicate entries, outdated availability, and unnecessary work for organizers. It also makes it easy for spouses to coordinate separately without realizing that the other person has already signed up or offered a ride.

The group needs one live roster that updates for everyone when a person signs up, offers a car, changes plans, or is reassigned. A member should be able to see their own and their spouse’s trip status before taking any action.

## 3. Goals

1. Let a member offer a car and declare its available passenger-seat count in under one minute.
2. Let a member claim an available seat using only their name.
3. Make remaining capacity, unassigned riders, and each spouse’s status easy to understand at a glance.
4. Keep one shared roster current for both EQ and RS, with updates visible to all active viewers in near real time.
5. Let an organizer publish, update, replace, and clean up the one trip currently visible to the group.
6. Make Temple Ride the authoritative place for trip transportation coordination, eliminating parallel paper sheets.
7. Keep the data collected and the operating burden appropriate for a small, trusted group.

## 4. Non-goals

- General-purpose social messaging, payments, expense sharing, navigation, or route optimization.
- A public directory of phone numbers, email addresses, or home addresses.
- A multi-stakeholder calendar product beyond the currently coordinated temple trip.
- A multi-trip calendar, recurring-trip scheduling, or trip history for members.
- Automatic matching of riders to drivers.
- Replacing organizer judgment about safety, capacity, assignments, or last-minute exceptions.

The product MAY add focused trip-coordination notes or notices when they are needed to make the roster self-sufficient. It is not intended to become a general chat app.

## 5. Users and needs

| User | Primary need | What success looks like |
| --- | --- | --- |
| Member offering a ride | Quickly show that they can drive and how many passengers they can take. | Their car appears immediately with the correct number of open seats. |
| Member needing a ride | Find a seat or make their need visible. | They can join an open car or the rider list without an account. |
| Spouse or household member | Avoid duplicate or conflicting sign-ups. | Before acting, they can see whether their spouse is driving, riding with a driver, or waiting for a seat. |
| Trip organizer | Keep the shared trip information accurate and resolve changes. | They can update the trip and remove sign-ups without exposing admin controls to ordinary members. |

## 6. Product experience

### 6.1 Member experience

The home screen shows either the current trip or a clear empty state. A current trip includes the temple, date, session time, optional organizer note, and the shared roster for the entire participating group—not separate EQ and RS lists.

Members can use two views of the same group:

- **Seats:** see each driver’s available and filled passenger seats; select an open seat and enter a name to join that car.
- **Names:** see the drivers and riders by name.

A member can also select **Add my car**, enter a name, and offer one to eight passenger seats. If no seat is available, the member can choose **I need a ride** and add their name to the rider list. Before sign-up, a member sees an unambiguous status for their linked spouse: driving, riding with a named driver, waiting for a seat, or not yet signed up.

When someone changes the roster, other active viewers see the new state promptly without having to discover it through another sheet or paper list. The roster is the authoritative record for the trip.

### 6.2 Organizer experience

The organizer enters a PIN to access the administrative area. The organizer can:

- Create or edit the current trip’s temple, date, session time, and optional note.
- Review the current sign-ups.
- Remove a driver, rider, or waitlisted member.
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
- The app MUST show names and seat availability from the shared current state after a completed sign-up.
- The service MUST handle simultaneous changes without silently overwriting another successful sign-up.

### 7.3 Shared roster and spouse awareness

- There MUST be exactly one shared active-trip roster for all participating groups, including EQ and RS.
- A roster change MUST be persisted once and reflected consistently to every viewer of that trip.
- Connected viewers MUST receive a roster update within five seconds of a successful change, without manually refreshing the page.
- A member MUST be able to see their own current status and the current status of their linked spouse before submitting a sign-up.
- A spouse link MUST be explicitly established or confirmed; the product MUST NOT infer marital relationships from display names.
- The spouse-status view MUST reveal only the minimum needed to avoid duplicate coordination: not signed up, driving, riding with a driver, or waiting for a seat.
- If a member changes or cancels a sign-up, the linked spouse’s status view MUST reflect that change under the same live-update requirement.

### 7.4 Administration

- Changes to trip details, trip deletion, and removal of people MUST require the administrator PIN.
- Verification of a PIN MUST not by itself grant an unauthenticated API caller permission to change a trip; protected requests MUST carry the PIN.
- The regular member flow MUST keep administrative controls out of the main sign-up path.

### 7.5 Validation and errors

- Names MUST be non-empty, normalized, and no more than 80 characters.
- Temple names MUST be no more than 100 characters; notes MUST be no more than 240 characters.
- Dates and 24-hour session times MUST be valid.
- The app MUST return plain-language errors for invalid input, full cars, stale trips, and unavailable cars.
- Requests larger than 20 KB MUST be rejected.

## 8. Privacy and security requirements

- The product MUST collect only the information needed for shared roster participation and an explicitly confirmed spouse link.
- The product MUST NOT create a public directory of phone numbers, email addresses, or home addresses.
- The product MUST disclose who can see roster names and spouse status before a member establishes a spouse link.
- The administrator PIN and hosted storage credential MUST be set as deployment secrets and MUST NOT be committed to the repository.
- Hosted state MUST be stored in private storage.
- The pilot’s PIN-based administration is acceptable only for a small, trusted group. A broader launch requires stronger administrator authentication, rate limiting, backups, and a managed database.

## 9. Quality requirements

- The app MUST work well on a phone-sized screen and remain usable with a keyboard and assistive technology.
- The main screen MUST provide a skip link, labeled controls, visible status feedback, and accessible dialogs.
- The app MUST avoid caching roster API responses and MUST maintain a live-update channel so members see current state without refresh.
- The system MUST support local file storage for development and private blob-backed storage when deployed to Vercel.
- The shared state store MUST use conflict detection and retry behavior when concurrent writes occur.

## 10. Success measures for the pilot

Because this is a deliberately small pilot, prioritize direct organizer feedback over complex analytics. A pilot is successful when:

- EQ and RS can publish and complete a trip’s carpool roster without paper sheets, parallel spreadsheets, or manual reconciliation between groups.
- Members can independently add a car or claim a seat without organizer assistance.
- Spouses can confirm each other’s status before signing up, and no pilot participant reports a duplicate or conflicting spouse sign-up.
- The organizer can resolve a cancellation or remove an accidental sign-up without data loss.
- No participant reports uncertainty about whether they, their spouse, or another group member has a seat or still needs a ride.
- The group considers the minimal data collection appropriate for its members.

## 11. Launch readiness

Before sharing outside a local development environment:

1. Set a non-demo `TEMPLE_CARPOOL_ADMIN_PIN` as a deployment secret.
2. Connect a private Vercel Blob store and confirm `BLOB_READ_WRITE_TOKEN` is available to the deployment.
3. Verify the deployed app can create a trip, add a driver, fill a seat, add a waitlisted rider, and remove each type of signup.
4. Verify a roster update appears to another connected phone within five seconds.
5. Verify linked spouses see the correct status before and after each relevant roster change.
6. Confirm that no secret, local data file, or test data has been committed.
7. Give the organizer the PIN through an appropriate private channel and explain the roster-visibility and spouse-link privacy boundaries.

## 12. Acceptance criteria

The initial pilot is ready when all of the following are true:

- An organizer can publish one current trip with a temple, date, and session time.
- A member can add a car with one to eight passenger seats.
- Another member can claim an open seat; the available-seat count immediately decreases.
- A member cannot overfill a car and receives a useful message if the seat was just taken.
- A member can add themselves to the rider list without choosing a car.
- The group can switch between seat-focused and name-focused views.
- EQ and RS members see the same active-trip roster rather than separate lists.
- A member sees their linked spouse’s current status before taking a sign-up action.
- When one connected member changes the roster, another connected member sees the change within five seconds without a page refresh.
- An organizer can remove a rider, a waitlisted member, or a driver; removing a driver preserves that driver’s riders on the rider list.
- Unauthorized requests cannot modify trip information or remove people.
- The app is usable on a phone and exposes its main controls with accessible names and feedback.

## 13. Open decisions for review

1. **Spouse link:** What is the least-friction, privacy-respecting way for spouses to establish and confirm their link: a shared household code, mutual confirmation, or organizer-assisted setup?
2. **Roster visibility:** Is showing every rider’s full entered name to every participating member acceptable, or should individual roster detail be limited beyond the linked-spouse status?
3. **Cancellation flow:** Is organizer-only removal sufficient, or should members be able to remove their own sign-up with a confirmation mechanism?
4. **Coordination details:** Which focused, in-app trip details are needed for Temple Ride to become the sole coordination surface—meeting instructions, organizer notices, confirmed assignment, or something else?
5. **Pilot ownership:** Who is responsible for updating or deleting the current trip after each visit, and how will EQ/RS organizers share that responsibility?
