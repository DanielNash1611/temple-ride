import assert from 'node:assert/strict';
import test from 'node:test';
import { createInitialState } from '../lib/store.js';
import { WeekStore } from '../lib/week-store.js';
import { eventFromPilot, importProductionEvent, ProductionEventBackend } from '../lib/production-events.js';

function storage(state) {
  let revision = state ? 1 : null;
  return {
    async read() { return state ? {state:structuredClone(state), revision} : null; },
    async write(next, expected) {
      assert.equal(expected, revision);
      state = structuredClone(next);
      revision = (revision ?? 0) + 1;
      return revision;
    }
  };
}

test('cutover keeps legacy IDs, capacity, assigned riders, waiting riders, private log and notes', async () => {
  const initial = createInitialState();
  const [trip] = initial.trips;
  trip.date = '2026-12-31';
  trip.drivers.push({id:'car', name:'Driver', seats:2, riders:[{id:'seated', name:'Passenger'}]});
  trip.waitlist.push({id:'waiting', name:'Waiting'});
  const blobs = {pilot:storage(initial), events:storage(null)};
  const store = new WeekStore(null, {backend:new ProductionEventBackend(blobs)});
  const before = await store.read();
  assert.equal(before.week.publishedSessionId, trip.id);
  assert.equal(before.week.endDate, '2027-01-06');
  assert.deepEqual(before.trips, [{...trip, revision:1, attendees:[]}]);
  const context = {weekId:before.week.id, weekRevision:1, tripId:trip.id, sessionRevision:1, date:trip.date, sessionTime:trip.sessionTime};
  const join = () => store.addPlan({...context, transport:'need', name:'Later Guest'});
  await assert.rejects(join, error => error.status === 503);
  // A final pilot signup that lands before the import must be present as well.
  const finalPilot = structuredClone(initial);
  finalPilot.trips[0].waitlist.push({id:'last', name:'Last Arrival'});
  await blobs.pilot.write(finalPilot, 1);
  assert.equal(await importProductionEvent(blobs), true);
  assert.deepEqual(await store.read(), eventFromPilot(finalPilot));
  await join();
  assert.equal(await importProductionEvent(blobs), false);
  const [after] = (await store.read()).trips;
  assert.equal(after.drivers[0].riders.length,2);
  assert.equal(after.drivers[0].riders[1].rideApproval,'pending');
  assert.deepEqual((await blobs.pilot.read()).state, finalPilot);
});

test('unexpected or changing production source cannot initialize an empty replacement', async () => {
  const initial = createInitialState();
  assert.throws(() => eventFromPilot(undefined));
  assert.throws(() => eventFromPilot({...initial, activeTripId:'missing'}));
  assert.equal(eventFromPilot({version:3, trips:[], activeTripId:null}).week,null);
  const events = storage(null);
  let revision = 0;
  await assert.rejects(importProductionEvent({events, pilot:{read:async () => ({state:initial,revision:++revision})}}), /changed during import/);
  assert.equal(await events.read(),null);
});
