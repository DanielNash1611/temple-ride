import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WeekStore, createWeekState, compatibleSessions } from '../lib/week-store.js';
import { CarpoolStore, createInitialState } from '../lib/store.js';

const weekInput = { temple: 'Los Angeles Temple', startDate: '2026-09-07', notes: '' };
const ctx = (state, trip) => ({ weekId: state.week.id, weekRevision: state.week.revision, ...(trip ? { tripId: trip.id, sessionRevision: trip.revision } : {}) });
async function usingStore(run) {
  const directory = await mkdtemp(join(tmpdir(), 'temple-week-test-'));
  try {
    const path = join(directory, 'week.json');
    const store = new WeekStore(path, { random: () => 0 });
    await store.saveWeek(weekInput);
    await run(store, path);
  } finally { await rm(directory, { recursive: true, force: true }); }
}
async function plan(store, values = {}) {
  const state = await store.read();
  return store.addPlan({ ...ctx(state), date: '2026-09-08', sessionTime: '18:00', language: 'English', name: 'Avery North', transport: 'own', ...values });
}
async function edit(store, result, values = {}) {
  const state = await store.read();
  const trip = state.trips.find((item) => item.id === result.tripId);
  return store.updatePerson(trip.id, result.person.id, { ...ctx(state, trip), confirmationName: result.person.name, ...values });
}

class RevisionBackend {
  state = createWeekState();
  revision = 1;
  async read() { return { state: structuredClone(this.state), revision: String(this.revision) }; }
  async write(state, revision) {
    if (revision !== String(this.revision)) throw Object.assign(new Error('conflict'), { code: 'STATE_CONFLICT' });
    this.state = structuredClone(state);
    return String(++this.revision);
  }
}

test('week is seven inclusive dates, including month/year boundaries, with no automatic expiry', () => usingStore(async (store) => {
  let state = await store.read();
  assert.equal(state.week.endDate, '2026-09-13');
  await plan(store, { date: '2026-09-07' });
  await plan(store, { date: '2026-09-13' });
  await assert.rejects(plan(store, { date: '2026-09-06' }), /within temple week/);
  await assert.rejects(plan(store, { date: '2026-09-14' }), /within temple week/);
  await assert.rejects(plan(store, { date: '2026-02-30' }), /valid trip date/);
  await assert.rejects(plan(store, { sessionTime: '24:00' }), /valid session time/);
  state = await store.read();
  await store.saveWeek({ ...weekInput, ...ctx(state), startDate: '2026-12-29', replace: true, confirmationTemple: weekInput.temple });
  assert.equal((await store.read()).week.endDate, '2027-01-04');
}));

test('new session and initial participant commit atomically, with separate day/time rosters', () => usingStore(async (store) => {
  await assert.rejects(plan(store, { name: '', transport: 'offer', seats: 2 }), /Name is required/);
  assert.equal((await store.read()).trips.length, 0);
  await assert.rejects(plan(store, { transport: 'offer', seats: 0 }), /between 1 and 8/);
  assert.equal((await store.read()).trips.length, 0);
  const first = await plan(store, { transport: 'offer', seats: 2 });
  const second = await plan(store, { name: 'Blair South', transport: 'need', lookingForCompany: true });
  const third = await plan(store, { sessionTime: '19:00' });
  const fourth = await plan(store, { date: '2026-09-09' });
  assert.equal(first.tripId, second.tripId);
  assert.notEqual(first.tripId, third.tripId);
  assert.notEqual(first.tripId, fourth.tripId);
  const state = await store.read();
  assert.equal(state.trips.length, 3);
  assert.equal('activeTripId' in state, false);
  assert.equal(state.trips[0].drivers[0].riders.length, 1);
  assert.equal(state.trips[0].drivers[0].riders[0].lookingForCompany, true);
}));

test('concurrent new-session plans across store instances converge without losing either signup', async () => {
  const backend = new RevisionBackend();
  const first = new WeekStore('unused', { backend });
  const second = new WeekStore('unused', { backend });
  await first.saveWeek(weekInput);
  await Promise.all([plan(first), plan(second, { name: 'Blair South', transport: 'offer', seats: 2 })]);
  const state = await first.read();
  assert.equal(state.trips.length, 1);
  assert.equal(state.trips[0].attendees.length, 1);
  assert.equal(state.trips[0].drivers.length, 1);
  assert.equal(state.trips[0].changeLog.filter((entry) => entry.type === 'trip_created').length, 1);
});

test('concurrent submissions to distinct sessions and last-seat contention remain safe', async () => {
  const backend = new RevisionBackend();
  const first = new WeekStore('unused', { backend });
  const second = new WeekStore('unused', { backend });
  await first.saveWeek(weekInput);
  const driver = await plan(first, { transport: 'offer', seats: 1 });
  await Promise.all([plan(first, { name: 'Other Day', date: '2026-09-09' }), plan(second, { name: 'Later Time', sessionTime: '20:00' })]);
  const outcomes = await Promise.allSettled([
    plan(first, { name: 'Blair South', transport: 'car', driverId: driver.person.id }),
    plan(second, { name: 'Casey East', transport: 'car', driverId: driver.person.id })
  ]);
  assert.equal(outcomes.filter((result) => result.status === 'fulfilled').length, 1);
  assert.match(outcomes.find((result) => result.status === 'rejected').reason.message, /filled up/);
  assert.equal((await first.read()).trips.length, 3);
  assert.equal((await first.read()).trips[0].drivers[0].riders.length, 1);
});

test('name warnings include own-transportation people but exclude other sessions', () => usingStore(async (store) => {
  const attendee = await plan(store, { lookingForCompany: true });
  let warning;
  await assert.rejects(plan(store, { name: '  AVERY   NORTH ' }), (error) => {
    warning = error;
    return error.details.code === 'NAME_MATCH_CONFIRMATION_REQUIRED' && error.details.matches[0].placement === 'own';
  });
  assert.equal((await store.read()).trips[0].attendees.length, 1);
  await plan(store, { name: 'Avery North', confirmedMatchIds: warning.details.matches.map((match) => match.id) });
  // Updating company without changing the name does not repeatedly warn about an acknowledged duplicate.
  await edit(store, attendee, { lookingForCompany: false });
  await plan(store, { name: 'Avery North', date: '2026-09-09' });
  await assert.rejects(plan(store, { name: 'Blair North' }), (error) => error.details.matches[0].matchType === 'family');
  await edit(store, attendee, { lookingForCompany: false, confirmedMatchIds: (await store.read()).trips[0].attendees.filter((item) => item.id !== attendee.person.id).map((item) => item.id) });
}));

test('family car alternatives remain advisory and recheck capacity on confirmed submission', () => usingStore(async (store) => {
  const driver = await plan(store, { transport: 'offer', seats: 1 });
  await assert.rejects(plan(store, { name: 'Blair North', transport: 'need' }), (error) => error.details.eligibleCars[0].id === driver.person.id);
  await plan(store, { name: 'Casey East', transport: 'car', driverId: driver.person.id });
  await assert.rejects(plan(store, { name: 'Blair North', transport: 'car', driverId: driver.person.id, confirmedMatchIds: [driver.person.id] }), /filled up/);
}));

test('transportation edits keep IDs and company flags; driver cancellation preserves all riders', () => usingStore(async (store) => {
  const driver = await plan(store, { transport: 'offer', seats: 2, lookingForCompany: true });
  const rider = await plan(store, { name: 'Blair South', transport: 'car', driverId: driver.person.id, lookingForCompany: true });
  const second = await plan(store, { name: 'Casey East', transport: 'car', driverId: driver.person.id });
  await assert.rejects(edit(store, driver, { seats: 1 }), /already has 2 riders/);
  await assert.rejects(edit(store, driver, { transport: 'own', confirmationName: 'wrong' }), /Type Avery North/);
  const cancellation = await edit(store, driver, { transport: 'own' });
  assert.equal(cancellation.person.id, driver.person.id);
  assert.equal(cancellation.movedToWaitlist, 2);
  let trip = (await store.read()).trips[0];
  assert.deepEqual(trip.waitlist.map((item) => item.id), [rider.person.id, second.person.id]);
  assert.equal(trip.waitlist[0].lookingForCompany, true);
  assert.equal(trip.attendees[0].lookingForCompany, true);
  const replacement = await plan(store, { name: 'Devon West', transport: 'offer', seats: 1 });
  const moved = await edit(store, rider, { transport: 'car', assignmentMode: 'any' });
  assert.equal(moved.person.id, rider.person.id);
  assert.equal(moved.person.lookingForCompany, true);
  await edit(store, rider, { lookingForCompany: false });
  trip = (await store.read()).trips[0];
  assert.equal(trip.drivers.find((item) => item.id === replacement.person.id).riders[0].lookingForCompany, false);
  await edit(store, rider, { transport: 'offer', seats: 3 });
  assert.equal((await store.read()).trips[0].drivers.find((item) => item.id === rider.person.id).riders.length, 0);
}));

test('ride requests fill cars first and fall back to this session’s waiting list', () => usingStore(async (store) => {
  await plan(store, { transport: 'offer', seats: 8, sessionTime: '19:00' });
  const waiting = await plan(store, { name: 'Blair South', transport: 'need', lookingForCompany: true });
  assert.equal(waiting.placement, 'need');
  const large = await plan(store, { name: 'Casey East', transport: 'offer', seats: 4 });
  const small = await plan(store, { name: 'Devon West', transport: 'offer', seats: 1 });
  // Company-only edits must not cause implicit movement out of the queue.
  await edit(store, waiting, { transport: 'need', lookingForCompany: false });
  assert.equal((await store.read()).trips.find((trip) => trip.id === waiting.tripId).waitlist.length, 1);
  const moved = await edit(store, waiting, { transport: 'car', assignmentMode: 'any', lookingForCompany: true });
  assert.equal(moved.driverName, small.person.name);
  assert.equal(moved.person.id, waiting.person.id);
  assert.equal(moved.person.lookingForCompany, true);
  for (const name of ['Emery Hill', 'Finley Lake', 'Gale Pine', 'Harper Wood']) {
    const rider = await plan(store, { name, transport: 'need' });
    assert.equal(rider.driverName, large.person.name);
  }
  const overflow = await plan(store, { name: 'Indigo Stone', transport: 'car', assignmentMode: 'any', lookingForCompany: true });
  assert.equal(overflow.placement, 'need');
  assert.equal(overflow.person.lookingForCompany, true);
  assert.equal((await store.read()).trips.find((trip) => trip.id === waiting.tripId).waitlist.length, 1);
}));

test('simultaneous automatic ride requests use the last seat and preserve the other signup in the queue', async () => {
  const backend = new RevisionBackend();
  const first = new WeekStore('unused', { backend });
  const second = new WeekStore('unused', { backend });
  await first.saveWeek(weekInput);
  await plan(first, { transport: 'offer', seats: 1 });
  const results = await Promise.all([
    plan(first, { name: 'Blair South', transport: 'need', lookingForCompany: true }),
    plan(second, { name: 'Casey East', transport: 'car', assignmentMode: 'any' })
  ]);
  assert.deepEqual(results.map((result) => result.placement).sort(), ['car', 'need']);
  const trip = (await first.read()).trips[0];
  assert.equal(trip.drivers[0].riders.length, 1);
  assert.equal(trip.waitlist.length, 1);
  assert.equal(new Set([...trip.drivers[0].riders, ...trip.waitlist].map((person) => person.id)).size, 2);
});

test('posted endowment slots support multiple times and languages, and language corrections invalidate forms', () => usingStore(async (store) => {
  const state = await store.read();
  const slot = { ...ctx(state), date: '2026-09-08', sessionTime: '18:00', language: 'English' };
  const english = await store.createTrip(slot);
  assert.equal(english.drivers.length + english.waitlist.length + english.attendees.length, 0);
  assert.equal((await store.createTrip({ ...slot, language: 'english' })).id, english.id);
  await assert.rejects(store.createTrip({ ...slot, language: 'Spanish' }), /already exists/);
  const spanish = await store.createTrip({ ...slot, sessionTime: '19:00', language: 'Spanish' });
  await store.createTrip({ ...slot, sessionTime: '20:00' });
  assert.equal((await store.read()).trips.length, 3);
  const signup = await plan(store);
  assert.equal(signup.tripId, english.id);
  assert.equal((await plan(store, { sessionTime: '19:00', language: 'Spanish' })).tripId, spanish.id);
  await assert.rejects(plan(store, { language: 'x'.repeat(61), sessionTime: '20:00' }), /60 characters/i);
  const frozen = ctx(state, english);
  await store.updateTrip(english.id, { ...slot, ...frozen, language: 'French' });
  await assert.rejects(store.addPlan({ ...slot, ...frozen, name: 'Blair South', transport: 'need' }), (error) => error.details.code === 'STALE_CONTEXT');
  const updated = (await store.read()).trips.find((trip) => trip.id === english.id);
  assert.equal(updated.language, 'French');
  assert.equal(updated.attendees[0].id, signup.person.id);
}));

test('removed sessions and changed details reject old forms without recreating sessions', () => usingStore(async (store) => {
  const first = await plan(store);
  let state = await store.read();
  const frozen = ctx(state, state.trips[0]);
  await store.updateTrip(first.tripId, { ...frozen, date: '2026-09-08', sessionTime: '19:00', notes: 'New time' });
  const oldPlan = { ...frozen, date: '2026-09-08', sessionTime: '18:00', name: 'Blair South', transport: 'own' };
  await assert.rejects(store.addPlan(oldPlan), (error) => error.details.code === 'STALE_CONTEXT');
  await assert.rejects(store.updatePerson(first.tripId, first.person.id, { ...frozen, confirmationName: first.person.name, lookingForCompany: true }), /plans have changed/);
  state = await store.read();
  const fresh = ctx(state, state.trips[0]);
  await store.deleteTrip(first.tripId, fresh);
  await assert.rejects(store.addPlan({ ...oldPlan, ...fresh, sessionTime: '19:00' }), /plans have changed/);
  assert.equal((await store.read()).trips.length, 0);
}));

test('unknown session languages stay unset through posting, signup, and corrections', () => usingStore(async (store) => {
  let state = await store.read();
  const slot = { date: '2026-09-11', sessionTime: '10:30', language: '   ' };
  const trip = await store.createTrip({ ...ctx(state), ...slot });
  assert.equal(trip.language, undefined);
  const signup = await store.addPlan({ ...ctx(state, trip), ...slot, name: 'Blair South', transport: 'need' });
  assert.equal(signup.tripId, trip.id);
  await store.updateTrip(trip.id, { ...ctx(state, trip), ...slot, language: 'Samoan' });
  state = await store.read();
  await store.updateTrip(trip.id, { ...ctx(state, state.trips[0]), date: slot.date, sessionTime: slot.sessionTime, notes: 'Updated note' });
  state = await store.read();
  assert.equal(state.trips[0].language, 'Samoan');
  await store.updateTrip(trip.id, { ...ctx(state, state.trips[0]), ...slot, language: '' });
  state = await store.read();
  assert.equal(state.trips[0].language, undefined);
  assert.equal(state.trips[0].waitlist[0].id, signup.person.id);
  assert.ok((await store.readChangeLog(trip.id)).every((entry) => !entry.description.includes('undefined')));
}));

test('same-time session corrections cannot merge rosters and deletion affects only one session', () => usingStore(async (store) => {
  const first = await plan(store);
  const second = await plan(store, { sessionTime: '19:00' });
  const state = await store.read();
  await assert.rejects(store.updateTrip(first.tripId, { ...ctx(state, state.trips[0]), date: '2026-09-08', sessionTime: '19:00' }), /already exists/);
  await store.deleteTrip(first.tripId, ctx(state, state.trips[0]));
  assert.deepEqual((await store.read()).trips.map((trip) => trip.id), [second.tripId]);
  await assert.rejects(store.readChangeLog(first.tripId), /plans have changed/);
  assert.equal((await store.readChangeLog(second.tripId)).length, 2);
}));

test('week replacement and deletion require current context and explicit confirmation', () => usingStore(async (store) => {
  await plan(store);
  const state = await store.read();
  await assert.rejects(store.saveWeek({ ...weekInput, ...ctx(state), startDate: '2026-09-14' }), /Replacing this week/);
  assert.equal((await store.read()).trips.length, 1);
  await store.saveWeek({ ...weekInput, ...ctx(state), startDate: '2026-09-14', replace: true, confirmationTemple: weekInput.temple });
  let fresh = await store.read();
  assert.notEqual(fresh.week.id, state.week.id);
  assert.equal(fresh.trips.length, 0);
  await assert.rejects(store.addPlan({ ...ctx(state), date: '2026-09-08', sessionTime: '18:00', name: 'Test', transport: 'need' }), /plans have changed/);
  await assert.rejects(store.deleteWeek({ ...ctx(fresh), confirmationTemple: 'wrong' }), /Type the temple/);
  await store.deleteWeek({ ...ctx(fresh), confirmationTemple: fresh.week.temple });
  fresh = await store.read();
  assert.equal(fresh.week, null);
}));

test('every participant removal requires their current name and logs record company and role changes', () => usingStore(async (store) => {
  const driver = await plan(store, { transport: 'offer', seats: 2 });
  const rider = await plan(store, { name: 'Blair South', transport: 'car', driverId: driver.person.id });
  const attendee = await plan(store, { name: 'Casey East', lookingForCompany: true });
  await edit(store, attendee, { lookingForCompany: false });
  let state = await store.read();
  for (const result of [driver, rider, attendee]) {
    await assert.rejects(store.removePerson(result.tripId, result.person.id, { ...ctx(state, state.trips[0]), confirmationName: 'wrong' }), /Type/);
  }
  await store.removePerson(driver.tripId, driver.person.id, { ...ctx(state, state.trips[0]), confirmationName: ' avery  NORTH ' });
  state = await store.read();
  assert.equal(state.trips[0].waitlist[0].id, rider.person.id);
  for (const result of [rider, attendee]) await store.removePerson(result.tripId, result.person.id, { ...ctx(state, state.trips[0]), confirmationName: result.person.name });
  const log = await store.readChangeLog(driver.tripId);
  assert.ok(log.some((entry) => /looking for company →.*not requesting company/.test(entry.description)));
  assert.ok(log.some((entry) => /1 riders moved/.test(entry.description)));
  assert.ok(log.every((entry) => entry.actor === 'member' && !('ip' in entry) && !('deviceId' in entry)));
}));

test('schemas fail closed without reading into or migrating the other app format', () => usingStore(async (store, path) => {
  await writeFile(path, JSON.stringify(createInitialState()));
  const original = await readFile(path, 'utf8');
  await assert.rejects(store.read(), /no migration was performed/);
  await assert.rejects(store.saveWeek(weekInput), /no migration was performed/);
  assert.equal(await readFile(path, 'utf8'), original);
  await writeFile(path, JSON.stringify(createWeekState()));
  const pilot = new CarpoolStore(path);
  await assert.rejects(pilot.read(), /local experiment launcher/);
  assert.equal((JSON.parse(await readFile(path, 'utf8'))).version, 4);
}));

test('invalid company and transport inputs do not save partial plans', () => usingStore(async (store) => {
  for (const values of [{ lookingForCompany: 'yes' }, { transport: 'unknown' }, { transport: 'own', driverId: 'fake' }, { transport: 'car', assignmentMode: 'magic' }, { transport: 'offer', seats: 9 }]) {
    await assert.rejects(plan(store, values));
  }
  assert.equal((await store.read()).trips.length, 0);
}));

async function flexibleSetup(store, extra = {}) {
  let state = await store.read();
  for (const sessionTime of ['10:30', '11:30', '12:30']) await store.createTrip({ ...ctx(state), date: '2026-09-12', sessionTime });
  state = await store.read();
  return { ...ctx(state), date: '2026-09-12', earliest: '10:30', latest: '12:30', name: 'Flexible Member', transport: 'need', lookingForCompany: true,
    sessions: state.trips.map(t => ({ id: t.id, revision: t.revision })), ...extra };
}
async function resolveFlex(store, entry, trip, extra = {}) {
  return store.addPlan({ ...ctx(await store.read(), trip), date: trip.date, sessionTime: trip.sessionTime,
    availabilityId: entry.id, availabilityRevision: entry.revision, confirmationName: entry.name, ...extra });
}
test('flexible availability reserves no seats; confirming one time preserves identity and company', () => usingStore(async store => {
  const input = await flexibleSetup(store, {transport:'offer', seats:2});
  const entry = await store.saveAvailability(input);
  let state = await store.read();
  assert.ok(state.trips.every(t => !t.drivers.length && !t.waitlist.length && !t.attendees.length));
  const result = await resolveFlex(store, entry, state.trips[1]);
  assert.equal(result.person.id, entry.id);
  assert.equal(result.person.lookingForCompany, true);
  state = await store.read();
  assert.equal(state.availability.length, 0);
  assert.deepEqual(state.trips.map(t => t.drivers.length), [0,1,0]);
  await assert.rejects(resolveFlex(store, entry, state.trips[0]), /changed/);
}));
test('availability validates range, snapshots, name warnings, edits and named removal', () => usingStore(async store => {
  const input = await flexibleSetup(store);
  await assert.rejects(store.saveAvailability({...input, latest:'10:30'}), /later last session/);
  await assert.rejects(store.saveAvailability({...input, earliest:'09:30'}), /changed/);
  await assert.rejects(store.saveAvailability({...input, sessions:[]}), /changed/);
  const entry = await store.saveAvailability(input);
  await assert.rejects(store.saveAvailability(input), e => e.details.matches[0].placement === 'flexible');
  await assert.rejects(store.removeAvailability(entry.id, {...input, availabilityRevision:1, confirmationName:'wrong'}), /Type Flexible Member/);
  const edited = await store.saveAvailability({...input, availabilityRevision:1, confirmationName:entry.name, transport:'own', lookingForCompany:false}, {}, entry.id);
  assert.equal(edited.id, entry.id); assert.equal(edited.revision, 2);
  assert.equal(edited.lookingForCompany, false);
  await assert.rejects(store.removeAvailability(entry.id, {...input, availabilityRevision:1, confirmationName:entry.name}), /changed/);
  await store.removeAvailability(entry.id, {...input, availabilityRevision:2, confirmationName:entry.name});
  assert.equal((await store.read()).availability.length, 0);
}));
test('concurrent confirmation only resolves once, seat contention queues remaining rider', async () => {
  const backend = new RevisionBackend();
  const a = new WeekStore(null, {backend}), b = new WeekStore(null, {backend});
  await a.saveWeek(weekInput);
  const input = await flexibleSetup(a);
  const first = await a.saveAvailability(input);
  const second = await a.saveAvailability({...input, name:'Another Guest'});
  let trip = (await a.read()).trips[0];
  await a.addPlan({...ctx(await a.read(), trip), date:trip.date, sessionTime:trip.sessionTime, name:'Car Owner', transport:'offer', seats:1});
  const outcomes = await Promise.all([resolveFlex(a,first,trip),resolveFlex(b,second,trip)]);
  assert.deepEqual(outcomes.map(r=>r.placement).sort(),['car','need']);
  const third = await a.saveAvailability({...input, name:'Third Visitor'});
  const duplicate = await Promise.allSettled([resolveFlex(a,third,trip),resolveFlex(b,third,trip)]);
  assert.equal(duplicate.filter(r=>r.status==='fulfilled').length,1);
  assert.equal((await a.read()).availability.length,0);
});
test('changed sessions reject old range forms; replacement clears availability even after sessions deleted', () => usingStore(async store => {
  const input = await flexibleSetup(store);
  const entry = await store.saveAvailability(input);
  let state = await store.read(), trip = state.trips[0];
  await store.updateTrip(trip.id,{...ctx(state,trip),date:trip.date,sessionTime:trip.sessionTime,language:'Spanish'});
  await assert.rejects(store.saveAvailability({...input,name:'Other Guest'}),/changed/);
  await assert.rejects(resolveFlex(store,entry,trip),/changed/);
  for (const t of (await store.read()).trips) await store.deleteTrip(t.id,ctx(await store.read(),t));
  state = await store.read();
  await assert.rejects(store.saveWeek({...weekInput,...ctx(state),startDate:'2026-10-05'}),/Replacing/);
  await store.saveWeek({...weekInput,...ctx(state),startDate:'2026-10-05',replace:true,confirmationTemple:weekInput.temple});
  assert.equal((await store.read()).availability.length,0);
}));

test('availability name review is limited to overlapping sessions and confirmation checks current roster', () => usingStore(async store => {
  const input = await flexibleSetup(store);
  const entry = await store.saveAvailability(input);
  const state = await store.read();
  const trip = state.trips[0];
  const confirmed = await store.addPlan({...ctx(state,trip),date:trip.date,sessionTime:trip.sessionTime,name:entry.name,transport:'own',confirmedMatchIds:[entry.id]});
  await assert.rejects(resolveFlex(store,entry,trip),e=>e.details.matches.some(m=>m.id===confirmed.person.id));
  const otherDay = await store.addPlan({...ctx(await store.read()),date:'2026-09-11',sessionTime:'10:30',name:entry.name,transport:'own'});
  assert.ok(otherDay.person.id);
  await assert.rejects(resolveFlex(store,entry,{...trip,sessionTime:'09:30'}),/within this availability range/);
  assert.equal((await store.read()).availability.length,1);
}));

async function intendedRequest(store, driverId, name, earliest, latest, extra = {}) {
  const state = await store.read(), driver = state.availability.find(a=>a.id===driverId);
  return store.saveAvailability({...ctx(state),date:driver.date,earliest,latest,name,transport:'need',lookingForCompany:true,
    intendedDriverId:driverId,driverRevision:driver.revision,sessions:state.trips.filter(t=>t.date===driver.date && t.sessionTime>=earliest && t.sessionTime<=latest).map(t=>({id:t.id,revision:t.revision})),...extra});
}
async function decideFlex(store, driverId, riderId, decision, extra = {}) {
  const state = await store.read(), driver = state.availability.find(a=>a.id===driverId), rider=state.availability.find(a=>a.id===riderId);
  return store.decideFlexibleRide(driverId,riderId,{...ctx(state),driverRevision:driver.revision,availabilityRevision:rider.revision,confirmationName:decision==='cancel'?rider.name:driver.name,decision,...extra});
}
test('intended seats narrow to a shared session; acceptance and final session move the entire car atomically', () => usingStore(async store => {
  const input=await flexibleSetup(store,{name:'Driver Oak',transport:'offer',seats:3});
  const driver=await store.saveAvailability(input);
  const a=await intendedRequest(store,driver.id,'Rider Pine','10:30','11:30');
  const b=await intendedRequest(store,driver.id,'Rider Elm','11:30','12:30');
  assert.equal(a.rideApproval,'pending');
  let state=await store.read();
  assert.deepEqual(compatibleSessions(state,state.availability.find(x=>x.id===driver.id)).map(t=>t.sessionTime),['11:30']);
  await assert.rejects(intendedRequest(store,driver.id,'Rider Birch','10:30','10:30'),/do not overlap/);
  await assert.rejects(resolveFlex(store,state.availability.find(x=>x.id===driver.id),state.trips[1]),/Accept or decline/);
  await assert.rejects(decideFlex(store,driver.id,a.id,'accept',{confirmationName:a.name}),/Type Driver Oak/);
  await decideFlex(store,driver.id,a.id,'accept'); await decideFlex(store,driver.id,b.id,'accept');
  state=await store.read();
  const current=state.availability.find(x=>x.id===driver.id);
  await assert.rejects(resolveFlex(store,current,state.trips[0]),/works for everyone/);
  await resolveFlex(store,current,state.trips[1]);
  state=await store.read();
  assert.equal(state.availability.length,0);
  const car=state.trips[1].drivers[0];
  assert.deepEqual(car.riders.map(r=>r.id).sort(),[a.id,b.id].sort());
  assert.ok(car.riders.every(r=>r.rideApproval==='accepted' && r.lookingForCompany));
  assert.equal(state.trips[0].drivers.length,0);
}));
test('decline and cancel restore compatible times and preserve riders; driver removal releases all intentions', () => usingStore(async store => {
  const input=await flexibleSetup(store,{name:'Driver Oak',transport:'offer',seats:2});
  const driver=await store.saveAvailability(input);
  const rider=await intendedRequest(store,driver.id,'Rider Pine','11:30','11:30');
  let state=await store.read();
  assert.equal(compatibleSessions(state,state.availability.find(a=>a.id===driver.id)).length,1);
  await decideFlex(store,driver.id,rider.id,'decline');
  state=await store.read();
  assert.equal(compatibleSessions(state,state.availability.find(a=>a.id===driver.id)).length,3);
  assert.equal(state.availability.find(a=>a.id===rider.id).intendedDriverId,undefined);
  const next=await intendedRequest(store,driver.id,'Rider Elm','10:30','11:30');
  await decideFlex(store,driver.id,next.id,'cancel');
  const third=await intendedRequest(store,driver.id,'Rider Birch','11:30','12:30');
  state=await store.read();
  await store.removeAvailability(driver.id,{...ctx(state),availabilityRevision:state.availability.find(a=>a.id===driver.id).revision,confirmationName:driver.name});
  state=await store.read();
  assert.equal(state.availability.length,3);
  assert.ok(state.availability.every(a=>!a.intendedDriverId && a.transport==='need'));
  assert.ok(state.availability.some(a=>a.id===third.id));
}));
test('held seats enforce capacity and concurrent requests cannot overbook or overwrite acceptance', async () => {
  const backend=new RevisionBackend(), a=new WeekStore(null,{backend}),b=new WeekStore(null,{backend});
  await a.saveWeek(weekInput);
  const input=await flexibleSetup(a,{name:'Driver Oak',transport:'offer',seats:1});
  const driver=await a.saveAvailability(input);
  const results=await Promise.allSettled([intendedRequest(a,driver.id,'Rider Pine','10:30','12:30'),intendedRequest(b,driver.id,'Rider Elm','10:30','12:30')]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  await assert.rejects(intendedRequest(a,driver.id,'Rider Birch','10:30','12:30'),/already held/);
  const state=await a.read(), rider=state.availability.find(r=>r.intendedDriverId===driver.id), current=state.availability.find(r=>r.id===driver.id);
  await assert.rejects(a.saveAvailability({...input,availabilityRevision:current.revision,confirmationName:driver.name,seats:0},{},driver.id),/between 1 and 8/);
  await assert.rejects(resolveFlex(a,rider,state.trips[0]),/driver chooses/);
  const frozen={...ctx(state),driverRevision:current.revision,availabilityRevision:rider.revision,confirmationName:driver.name,decision:'accept'};
  await a.decideFlexibleRide(driver.id,rider.id,frozen);
  await assert.rejects(b.decideFlexibleRide(driver.id,rider.id,{...frozen,decision:'decline'}),/changed/);
});
test('fixed-session riders await driver acceptance; company edits retain it, moving cars requires new acceptance', () => usingStore(async store => {
  const first=await plan(store,{name:'Driver Oak',transport:'offer',seats:2});
  const second=await plan(store,{name:'Driver Birch',transport:'offer',seats:2});
  const rider=await plan(store,{name:'Rider Pine',transport:'car',driverId:first.person.id});
  assert.equal(rider.person.rideApproval,'pending');
  let state=await store.read(), trip=state.trips[0];
  const input={...ctx(state,trip),decision:'accept',confirmationName:first.person.name,riderName:rider.person.name,expectedApproval:'pending',expectedRequestId:rider.person.rideRequestId};
  await assert.rejects(store.decideSessionRide(trip.id,first.person.id,rider.person.id,{...input,confirmationName:rider.person.name}),/Type Driver Oak/);
  await store.decideSessionRide(trip.id,first.person.id,rider.person.id,input);
  await assert.rejects(store.decideSessionRide(trip.id,first.person.id,rider.person.id,input),/changed/);
  const edited=await edit(store,rider,{lookingForCompany:true});
  assert.equal(edited.person.rideApproval,'accepted');
  const moved=await edit(store,rider,{transport:'car',driverId:second.person.id});
  assert.equal(moved.person.rideApproval,'pending');
  state=await store.read();trip=state.trips[0];
  await store.decideSessionRide(trip.id,second.person.id,rider.person.id,{...ctx(state,trip),decision:'decline',confirmationName:second.person.name,riderName:rider.person.name,expectedApproval:'pending',expectedRequestId:moved.person.rideRequestId});
  assert.equal((await store.read()).trips[0].waitlist[0].id,rider.person.id);
}));

test('linked availability edits preserve company-only acceptance and reject incompatible/capacity changes', () => usingStore(async store => {
  const input=await flexibleSetup(store,{name:'Driver Oak',transport:'offer',seats:2});
  const driver=await store.saveAvailability(input);
  const a=await intendedRequest(store,driver.id,'Rider Pine','10:30','11:30');
  const b=await intendedRequest(store,driver.id,'Rider Elm','11:30','12:30');
  await decideFlex(store,driver.id,a.id,'accept');
  let state=await store.read(),current=state.availability.find(r=>r.id===a.id),car=state.availability.find(r=>r.id===driver.id);
  const editInput={...ctx(state),...current,availabilityRevision:current.revision,driverRevision:car.revision,confirmationName:current.name,lookingForCompany:false,sessions:state.trips.filter(t=>fitsTest(current,t)).map(t=>({id:t.id,revision:t.revision}))};
  const updated=await store.saveAvailability(editInput,{},a.id);
  assert.equal(updated.rideApproval,'accepted'); assert.equal(updated.lookingForCompany,false);
  state=await store.read();car=state.availability.find(r=>r.id===driver.id);
  await assert.rejects(store.saveAvailability({...input,...ctx(state),availabilityRevision:car.revision,confirmationName:car.name,seats:1},{},car.id),/enough seats/);
  await assert.rejects(store.saveAvailability({...editInput,availabilityRevision:updated.revision,driverRevision:car.revision,earliest:'10:30',latest:'10:30',sessions:[{id:state.trips[0].id,revision:1}]},{},a.id),/do not overlap/);
  const newName=await store.saveAvailability({...editInput,availabilityRevision:updated.revision,driverRevision:car.revision,name:'Changed Guest'},{},a.id);
  assert.equal(newName.rideApproval,'pending');
  await store.saveAvailability({...input,...ctx(await store.read()),availabilityRevision:(await store.read()).availability.find(r=>r.id===driver.id).revision,confirmationName:driver.name,transport:'own'},{},driver.id);
  state=await store.read();assert.ok(state.availability.filter(r=>[a.id,b.id].includes(r.id)).every(r=>!r.intendedDriverId));
}));
function fitsTest(entry,trip){return entry.date===trip.date && trip.sessionTime>=entry.earliest && trip.sessionTime<=entry.latest;}

test('session detail corrections reset ride acceptance but note-only corrections preserve it', () => usingStore(async store => {
  await plan(store,{name:'Driver Oak',transport:'offer',seats:2});
  const rider=await plan(store,{name:'Rider Pine',transport:'need'});
  let state=await store.read(),trip=state.trips[0],driver=trip.drivers[0];
  await store.decideSessionRide(trip.id,driver.id,rider.person.id,{...ctx(state,trip),confirmationName:driver.name,riderName:rider.person.name,expectedApproval:'pending',expectedRequestId:rider.person.rideRequestId,decision:'accept'});
  state=await store.read();trip=state.trips[0];
  await store.updateTrip(trip.id,{...ctx(state,trip),date:trip.date,sessionTime:trip.sessionTime,notes:'Meet outside'});
  state=await store.read();trip=state.trips[0];assert.equal(trip.drivers[0].riders[0].rideApproval,'accepted');
  await store.updateTrip(trip.id,{...ctx(state,trip),date:trip.date,sessionTime:'19:00'});
  assert.equal((await store.read()).trips[0].drivers[0].riders[0].rideApproval,'pending');
}));

async function explicitChoices(store, ids, extra={}) {
  const state=await store.read();
  return {...ctx(state),sessionIds:ids,sessions:state.trips.filter(t=>ids.includes(t.id)).map(t=>({id:t.id,revision:t.revision})),name:'Session Chooser',transport:'need',...extra};
}
test('explicit choices preserve gaps and multiple days without signing up for every session', () => usingStore(async store=>{
  await flexibleSetup(store);
  await store.createTrip({...ctx(await store.read()),date:'2026-09-11',sessionTime:'18:30',language:'English'});
  let state=await store.read();
  const selected=[state.trips[0].id,state.trips[2].id,state.trips[3].id];
  const entry=await store.saveAvailability(await explicitChoices(store,selected,{transport:'offer',seats:2}));
  state=await store.read();
  assert.deepEqual(new Set(compatibleSessions(state,entry).map(t=>t.id)),new Set(selected));
  assert.ok(state.trips.every(t=>!t.drivers.length));
  await assert.rejects(resolveFlex(store,entry,state.trips[1]),/within this availability range/);
  const resolved=await resolveFlex(store,entry,state.trips[3]);
  assert.equal(resolved.tripId,state.trips[3].id);
  assert.equal((await store.read()).availability.length,0);
}));
test('explicit selections reject empty, repeated, removed, or corrected session snapshots', () => usingStore(async store=>{
  await flexibleSetup(store);
  let state=await store.read();const trip=state.trips[0];
  const body=await explicitChoices(store,[trip.id]);
  await assert.rejects(store.saveAvailability({...body,sessionIds:[]}),/at least one/);
  await assert.rejects(store.saveAvailability({...body,sessionIds:[trip.id,trip.id]}),/without repeats/);
  await assert.rejects(store.saveAvailability({...body,sessionIds:['missing']}),/changed/);
  const entry=await store.saveAvailability(body);
  await store.updateTrip(trip.id,{...ctx(state,trip),date:trip.date,sessionTime:'09:30'});
  await assert.rejects(store.saveAvailability(body),/changed/);
  state=await store.read();
  assert.equal(compatibleSessions(state,entry).length,0);
  await assert.rejects(resolveFlex(store,entry,state.trips[0]),/within this availability range/);
}));
test('intended-seat compatibility intersects exact choices across days and excludes unselected gaps', () => usingStore(async store=>{
  await flexibleSetup(store);
  await store.createTrip({...ctx(await store.read()),date:'2026-09-11',sessionTime:'18:30'});
  let state=await store.read();
  const driver=await store.saveAvailability(await explicitChoices(store,[state.trips[0].id,state.trips[2].id,state.trips[3].id],{name:'Driver Oak',transport:'offer',seats:2}));
  const body=await explicitChoices(store,[state.trips[2].id,state.trips[3].id],{name:'Rider Pine',intendedDriverId:driver.id,driverRevision:driver.revision});
  const rider=await store.saveAvailability(body);
  state=await store.read();
  assert.deepEqual(new Set(compatibleSessions(state,driver).map(t=>t.id)),new Set(body.sessionIds));
  await decideFlex(store,driver.id,rider.id,'accept');
  state=await store.read();
  await resolveFlex(store,state.availability.find(a=>a.id===driver.id),state.trips[3]);
  assert.equal((await store.read()).trips[3].drivers[0].riders[0].id,rider.id);
}));

test('join any matching car fills smallest capacity and holds pending with identity preserved', () => usingStore(async store=>{
  const input=await flexibleSetup(store);
  await store.saveAvailability({...input,name:'Large Oak',transport:'offer',seats:3});
  const small=await store.saveAvailability({...input,name:'Small Pine',transport:'offer',seats:1});
  const rider=await store.saveAvailability({...input,name:'Rider Elm',joinAny:true});
  assert.equal(rider.match.driverName,small.name);
  const saved=(await store.read()).availability.find(a=>a.id===rider.id);
  assert.equal(saved.intendedDriverId,small.id); assert.equal(saved.rideApproval,'pending'); assert.equal(saved.lookingForCompany,true);
  await assert.rejects(store.matchRide(saved.id,{...ctx(await store.read()),availabilityRevision:saved.revision,action:'join'}),/changed/);
}));

test('driver adds riders atomically and narrows common choices rather than accepting incompatible groups', () => usingStore(async store=>{
  const input=await flexibleSetup(store);
  const ids=(await store.read()).trips.map(t=>t.id);
  const driver=await store.saveAvailability({...input,name:'Driver Oak',transport:'offer',seats:3});
  for (const [index,name] of ['First Pine','Second Elm','Third Birch'].entries()) {
    await store.saveAvailability({...input,name,sessionIds:[ids[index]],sessions:[input.sessions[index]]});
  }
  const result=await store.matchRide(driver.id,{...ctx(await store.read()),availabilityRevision:driver.revision,action:'fill'});
  assert.equal(result.added.length,1);
  const state=await store.read(); const linked=state.availability.filter(a=>a.intendedDriverId===driver.id);
  assert.equal(linked[0].rideApproval,'accepted'); assert.equal(compatibleSessions(state,state.availability.find(a=>a.id===driver.id)).length,1);
  assert.equal(state.availability.filter(a=>a.transport==='need'&&!a.intendedDriverId).length,2);
}));

test('fixed driver collects flexible and waiting riders; fixed waiting rider can join a flexible car', () => usingStore(async store=>{
  const waiting=await plan(store,{name:'Waiting Oak',transport:'need'});
  const car=await plan(store,{name:'Driver Pine',transport:'offer',seats:2});
  let state=await store.read();let trip=state.trips[0];
  const flexible=await store.saveAvailability({...ctx(state),sessionIds:[trip.id],sessions:[{id:trip.id,revision:trip.revision}],name:'Flexible Elm',transport:'need',lookingForCompany:true});
  const result=await store.matchRide(car.person.id,{...ctx(state,trip),action:'fill',personSnapshot:JSON.stringify(car.person)});
  assert.equal(result.added.length,2);state=await store.read();trip=state.trips[0];
  assert.equal(trip.drivers[0].riders.every(r=>r.rideApproval==='accepted'),true);assert.equal(state.availability.length,0);
  assert.equal(trip.drivers[0].riders.find(r=>r.id===flexible.id).lookingForCompany,true);
  const another=await plan(store,{name:'Later Birch',transport:'need'});
  const flexCar=await store.saveAvailability({...ctx(state),sessionIds:[trip.id],sessions:[{id:trip.id,revision:trip.revision}],name:'Flexible Cedar',transport:'offer',seats:1});
  const matched=await store.matchRide(another.person.id,{...ctx(state,trip),action:'join',personSnapshot:JSON.stringify(another.person)});
  assert.equal(matched.matched,true);state=await store.read();assert.equal(state.trips[0].waitlist.length,0);
  assert.equal(state.availability.find(a=>a.id===another.person.id).intendedDriverId,flexCar.id);
  const expectedOrder = [waiting.person, flexible].sort((a, b) =>
    a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  assert.deepEqual(trip.drivers[0].riders.map(rider => rider.id), expectedOrder.map(rider => rider.id));
}));

test('concurrent drivers cannot collect the same rider; unmatched request remains available', async()=>{
  const backend=new RevisionBackend();const a=new WeekStore(null,{backend}), b=new WeekStore(null,{backend});await a.saveWeek(weekInput);
  const input=await flexibleSetup(a);
  const rider=await a.saveAvailability({...input,name:'Rider Oak',joinAny:true});assert.equal(rider.match.matched,false);
  const one=await a.saveAvailability({...input,name:'Driver Pine',transport:'offer',seats:1});
  const two=await a.saveAvailability({...input,name:'Driver Elm',transport:'offer',seats:1});
  const state=await a.read();
  const results=await Promise.all([a.matchRide(one.id,{...ctx(state),availabilityRevision:one.revision,action:'fill'}),b.matchRide(two.id,{...ctx(state),availabilityRevision:two.revision,action:'fill'})]);
  assert.equal(results.reduce((n,r)=>n+r.added.length,0),1);
});

test('concurrent rider matches hold only one final place and preserve the unmatched rider',async()=>{
  const backend=new RevisionBackend();const a=new WeekStore(null,{backend}),b=new WeekStore(null,{backend});await a.saveWeek(weekInput);
  const input=await flexibleSetup(a);const car=await a.saveAvailability({...input,name:'Driver Oak',transport:'offer',seats:1});
  const first=await a.saveAvailability({...input,name:'First Pine'}),second=await a.saveAvailability({...input,name:'Second Elm'});
  const state=await a.read();const results=await Promise.all([a.matchRide(first.id,{...ctx(state),availabilityRevision:first.revision,action:'join'}),b.matchRide(second.id,{...ctx(state),availabilityRevision:second.revision,action:'join'})]);
  assert.equal(results.filter(r=>r.matched).length,1);const after=await a.read();assert.equal(after.availability.filter(p=>p.intendedDriverId===car.id).length,1);assert.equal(after.availability.filter(p=>p.transport==='need'&&!p.intendedDriverId).length,1);
});
