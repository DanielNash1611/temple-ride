import { eventFromPilot, importProductionEvent, productionBlobs } from '../lib/production-events.js';

const blobs = productionBlobs();
const source = await blobs.pilot.read();
const converted = eventFromPilot(source?.state);
const trip = converted.trips[0];
console.log(trip ? `Temple Session: ${trip.date} ${trip.sessionTime}, ${trip.drivers.length} cars, ${trip.drivers.reduce((n,d) => n+d.riders.length,0)} seated, ${trip.waitlist.length} waiting, ${trip.changeLog.length} log entries.` : 'No active trip.');
if (process.argv[2] === '--publish') {
  console.log(await importProductionEvent(blobs) ? 'Published the production roster.' : 'Event storage is already initialized.');
} else if (process.argv[2]) throw new Error('Use --publish to initialize event storage.');
