# Temple Ride

Temple Ride is a deliberately simple mobile web app for organizing carpools to temple trips. Members can:

- offer a ride with their name and number of open passenger seats;
- tap a driver's open seat and join using only their name; or
- switch to the Names view to see every driver's and rider's full name;
- add their name to the rider list when no seats are available;
- review possible duplicate and family-name matches before saving; and
- edit, move, or remove roster entries after retyping the affected name.

Everyone sees one current temple trip—there is no trip picker. Administrators can update its temple, date, session time, and note, replace it when needed, remove names, and review the current trip's change log. The admin area and change log are protected by a PIN so the regular member flow stays focused.

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

## Checks

```bash
npm run check
npm test
```
