# Temple Ride

Temple Ride is a deliberately simple mobile web app for organizing carpools to temple trips. Members can:

- offer a ride with their name and number of open passenger seats;
- tap a driver's open seat and join using only their name; or
- switch to the Names view to see every driver's and rider's full name;
- add their name to the rider list when no seats are available;
- review possible duplicate and family-name matches before saving; and
- edit, move, or remove roster entries after retyping the affected name.

Everyone sees one current temple trip—there is no trip picker. Administrators can update its temple, date, session time, and note, replace it when needed, remove names, and review the current trip's change log. The admin area and change log are protected by a PIN so the regular member flow stays focused.

## Hosted events

The production site uses the event planner in PRD §§14–15. The existing active trip carries forward as a Temple Session. Production event data lives in a separate private Blob beside the original pilot document. To initialize it after production traffic reaches the event release, run `node scripts/import-production-event.js --publish` with the production Blob environment. Omitting the flag rehearses the conversion. Subsequent runs preserve the existing event store. During cutover the site displays the pilot session and pauses writes until the import completes. Recover using the private event document after new signups are accepted. The original pilot document is a pre-cutover copy.

## Run it

Temple Ride requires Node.js 20 or newer.

```bash
npm start
```

Open [http://localhost:3000](http://localhost:3000). The demo admin PIN is `2468`.

Before sharing the app, set a private admin PIN:

```bash
TEMPLE_CARPOOL_ADMIN_PIN="your-pin" npm start
```

To open the local app on phones connected to the same Wi-Fi network, use the computer's local network address with port 3000. A hosted deployment is required for access outside that network.

## Data and privacy

- The app asks only for a name. It does not collect phone numbers, email addresses, home addresses, accounts, or messages.
- Everyone with access can see the current roster. The initial pilot treats that audience as a trusted group, so members can correct or remove entries without identity verification.
- Name matching is advisory and does not save or claim a family or household relationship.
- Trip and signup data is shared by the server and stored in `data/app-data.json`.
- On Vercel, the same state is stored as one private Vercel Blob document. Blob writes use ETags so simultaneous sign-ups do not overwrite one another.
- Coordination happens outside the app.
- The local JSON file and private Blob store are suitable for a small pilot. Before a broader launch, add backups, rate limiting, stronger administrator authentication, and a managed database.

## Deploy to Vercel

Link the project, create a private Blob store, and set a private administrator PIN before deploying:

```bash
vercel link
vercel blob create-store temple-ride-data --access private --yes --environment production --environment preview
vercel env add TEMPLE_CARPOOL_ADMIN_PIN production
vercel --prod
```

Vercel supplies `BLOB_READ_WRITE_TOKEN` when the store is connected. Neither that token nor the administrator PIN belongs in the repository.

## Local Temple Week experiment

The approved experiment in PRD section 14 supports one organizer-configured temple and seven-day period, with multiple endowment times per day, displayed session languages, shared rides, self-transportation, and independent company requests.

```bash
npm run dev:temple-week
```

Open [http://localhost:3001](http://localhost:3001). The local demo PIN is `2468` unless `TEMPLE_CARPOOL_ADMIN_PIN` is set. Choose **Admin**, set the temple and first day, and post the endowment times and languages from the current official temple schedule. Members return to **Temple week**, expand a day and choose a session time, then use **Add my car**, **I need a ride**, or **I have my own transportation**. A ride request fills an open car first and joins the waiting list if none are available. The week stays visible until the organizer changes or removes it.

This launcher binds to localhost, uses only the ignored `data/temple-week-experiment.json`, and disables Blob access even if hosted credentials are present. It ignores the pilot data-file and port environment variables; use `TEMPLE_WEEK_PORT=3002 npm run dev:temple-week` if port 3001 is occupied. Restart the launcher after server changes. The normal `npm start` entrypoint still serves the single-trip pilot. The local launcher never imports pilot data.

Members can select **I need a ride** even while seats remain available. Company requests do not take seats, pair people, or clear automatically when a ride is found. Use **Edit plans** to change transportation or company preferences; changes and removals require the displayed name. Coordination remains outside the app.

The local week includes the organizer-provided Friday/Saturday chart from previous research (PRD §14.5), with the three specified Saturday languages. Blank languages show “Language not set.” This chart has not been freshly verified against the Church’s signed-in reservation system. Earlier sample plans remain demo data.

Organizer-facilitated support is available. Other ordinance types and companion pairing are deferred. Before considering a live rollout, observe less technology-confident members using the three main flows without coaching. See [Temple Week verification](docs/temple-week-verification.md) for the current evidence and remaining gate.

## Checks

```bash
npm run check
npm test
```

The local experiment also supports **My time is flexible**: select a day and a range of listed session starts. Flexible plans reserve no seats and appear separately from each session roster. After coordinating, open the flexible name and choose one session; the server atomically replaces availability with that session's signup. Drivers offer capacity only at the confirmed time; riders receive a current seat or a clearly labeled waiting entry. See PRD §14.6.

Flexible cars now accept intended-seat requests: pending and accepted riders hold capacity and narrow the car's possible sessions to times everyone can attend. The driver accepts/declines riders, then picks one compatible final time for the whole car. Fixed-session requests also await driver acceptance in the experiment. Typed driver names record a trusted-group decision; they do not authenticate the driver. PRD §14.7 supersedes the earlier unconnected-availability behavior above.

The primary entry is now **choose day(s) → select exact sessions → offer/request a ride** (PRD §14.8). Multiple selections, including gaps and different days, mean alternatives for one visit. Afternoon/evening shortcuts only select posted starts. Existing cars are under the initially closed browsing disclosure; fresh loads have no selected days or expanded sessions.
