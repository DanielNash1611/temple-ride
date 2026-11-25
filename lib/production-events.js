import { BlobStateBackend } from './blob-backend.js';
import { cleanDate, cleanTime, StoreError } from './store.js';
import { createWeekState } from './week-store.js';

export function eventFromPilot(pilot) {
  if (pilot?.version !== 3 || !Array.isArray(pilot.trips)) throw new Error('Expected a version 3 production roster.');
  const state = createWeekState();
  if (pilot.trips.length === 0 && pilot.activeTripId === null) return state;
  const [trip] = pilot.trips;
  if (pilot.trips.length !== 1 || !trip?.id || pilot.activeTripId !== trip.id) {
    throw new Error('Cannot identify a single active trip. The original roster has been preserved.');
  }
  cleanDate(trip.date);
  cleanTime(trip.sessionTime, 'Session time');
  if (!trip.temple || !Array.isArray(trip.drivers) || !Array.isArray(trip.waitlist) || !Array.isArray(trip.changeLog)) {
    throw new Error('The production trip is missing roster details.');
  }
  const end = new Date(trip.date + 'T12:00:00Z');
  end.setUTCDate(end.getUTCDate() + 6);
  state.week = {id:trip.id, revision:1, temple:trip.temple, startDate:trip.date,
    endDate:end.toISOString().slice(0, 10), notes:trip.notes, publishedSessionId:trip.id};
  // Existing seated riders are already confirmed. The session UI treats the legacy
  // absence of rideApproval as accepted and preserves the original roster entries.
  state.trips = [{...trip, revision:1, attendees:[]}];
  return state;
}

export function productionBlobs() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) throw new Error('Private Blob access is required.');
  const pathname = process.env.TEMPLE_CARPOOL_BLOB_PATH || 'temple-ride/app-data.json';
  return {
    pilot:new BlobStateBackend({pathname}),
    events:new BlobStateBackend({pathname:pathname + '.events-v4.json'})
  };
}

// Between the code release and the one-time import, readers can still see the trip.
// Only the import can initialize the destination. All subsequent writes require an ETag.
export class ProductionEventBackend {
  constructor({pilot, events}) {
    this.pilot = pilot;
    this.events = events;
  }
  async read() {
    const saved = await this.events.read();
    if (saved) return saved;
    const source = await this.pilot.read();
    return {state:eventFromPilot(source?.state), revision:null};
  }
  async write(state, revision) {
    if (!revision) throw new StoreError('Signups are briefly paused while this event is being upgraded. Please try again shortly.', 503);
    return this.events.write(state, revision);
  }
}

export async function importProductionEvent({pilot, events}) {
  if (await events.read()) return false;
  const snapshot = await pilot.read();
  const converted = eventFromPilot(snapshot?.state);
  const latest = await pilot.read();
  if (!snapshot.revision || latest?.revision !== snapshot.revision) throw new Error('Roster changed during import. Retry with the latest roster.');
  await events.write(converted, null);
  return true;
}
