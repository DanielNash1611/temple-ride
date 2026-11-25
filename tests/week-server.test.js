import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createAppServer, createAppHandler } from '../server.js';
import { createLocalWeekServer } from '../scripts/temple-week.js';

async function withServer(run, options = {}) {
  const directory = await mkdtemp(join(tmpdir(), 'week-api-test-'));
  const dataFile = join(directory, 'state.json');
  const server = createAppServer({ experiment: true, dataFile, adminPin: '8172', blobToken: 'unusable-hosted-token', ...options });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = async (path, method = 'GET', body, admin = false) => {
    const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(admin ? { 'X-Admin-Pin': '8172' } : {}) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    return { status: response.status, cache: response.headers.get('cache-control'), body: await response.json() };
  };
  try { await run(request, base, dataFile); }
  finally { await new Promise((resolve) => server.close(resolve)); await rm(directory, { recursive: true, force: true }); }
}
async function setup(request) {
  const created = await request('/api/week', 'POST', { temple: 'Test Temple', startDate: '2026-09-07' }, true);
  assert.equal(created.status, 200);
  return { weekId: created.body.id, weekRevision: created.body.revision };
}
const input = { date: '2026-09-08', sessionTime: '18:00', language: 'English', name: 'Avery North', transport: 'own', lookingForCompany: true };

test('experiment serves its interface and local schema even with a hosted token present', () => withServer(async (request, base, dataFile) => {
  const html = await (await fetch(base)).text();
  assert.match(html, /week\/app.js/);
  assert.equal((await request('/api/state')).body.version, 4);
  await setup(request);
  assert.equal(JSON.parse(await readFile(dataFile, 'utf8')).version, 4);
  assert.equal((await request('/api/state')).cache, 'no-store');
}));

test('week setup requires PIN on each request; successful verification alone grants no access', () => withServer(async (request) => {
  const body = { temple: 'Test Temple', startDate: '2026-09-07' };
  assert.equal((await request('/api/week', 'POST', body)).status, 401);
  assert.equal((await request('/api/admin/verify', 'POST', { pin: '8172' })).status, 200);
  assert.equal((await request('/api/week', 'POST', body)).status, 401);
  const frozen = await setup(request);
  assert.equal((await request('/api/week', 'PATCH', { ...body, ...frozen })).status, 401);
  assert.equal((await request('/api/week', 'DELETE', { ...frozen, confirmationTemple: 'Test Temple' })).status, 401);
}));

test('member creates a plan without PIN; logs stay private across additions and corrections', () => withServer(async (request) => {
  const frozen = await setup(request);
  const added = await request('/api/week/plans', 'POST', { ...input, ...frozen });
  assert.equal(added.status, 201);
  assert.equal('changeLog' in added.body, false);
  const publicState = await request('/api/state');
  const trip = publicState.body.trips[0];
  const session = { ...frozen, sessionRevision: trip.revision, tripId: trip.id };
  assert.equal('changeLog' in trip, false);
  assert.equal((await request(`/api/trips/${trip.id}/change-log`)).status, 401);
  const log = await request(`/api/trips/${trip.id}/change-log`, 'GET', undefined, true);
  assert.equal(log.body.entries.length, 2);
  assert.ok(log.body.entries.every((entry) => entry.actor === 'member'));
  const path = `/api/trips/${trip.id}/people/${added.body.person.id}`;
  assert.equal((await request(path, 'PATCH', { ...session, confirmationName: 'wrong', lookingForCompany: false })).status, 400);
  assert.equal((await request(path, 'PATCH', { ...session, confirmationName: input.name, lookingForCompany: false })).status, 200);
  assert.equal((await request(path, 'DELETE', { ...session, confirmationName: 'wrong' })).status, 400);
  assert.equal((await request(path, 'DELETE', { ...session, confirmationName: input.name })).status, 200);
}));

test('session correction/deletion is PIN protected and stale errors are structured', () => withServer(async (request) => {
  const frozen = await setup(request);
  const added = await request('/api/week/plans', 'POST', { ...input, ...frozen });
  const trip = (await request('/api/state')).body.trips[0];
  const body = { ...frozen, sessionRevision: trip.revision, date: input.date, sessionTime: '19:00' };
  const path = `/api/trips/${trip.id}`;
  assert.equal((await request(path, 'PATCH', body)).status, 401);
  assert.equal((await request(path, 'DELETE', body)).status, 401);
  assert.equal((await request(path, 'PATCH', body, true)).status, 200);
  const stale = await request(`/api/trips/${trip.id}/people/${added.body.person.id}`, 'PATCH', { ...body, confirmationName: input.name, lookingForCompany: false });
  assert.equal(stale.status, 409);
  assert.equal(stale.body.code, 'STALE_CONTEXT');
  assert.equal((await request('/api/trips', 'POST', {}, true)).status, 409);
}));

test('structured name review and trip-scoped driver/rider APIs preserve session boundaries', () => withServer(async (request) => {
  const frozen = await setup(request);
  await request('/api/week/plans', 'POST', { ...input, ...frozen });
  const trip = (await request('/api/state')).body.trips[0];
  const review = await request('/api/week/plans', 'POST', { ...input, ...frozen });
  assert.equal(review.status, 409);
  assert.equal(review.body.code, 'NAME_MATCH_CONFIRMATION_REQUIRED');
  assert.equal(review.body.matches[0].placement, 'own');
  const session = { ...frozen, sessionRevision: trip.revision };
  const driver = await request(`/api/trips/${trip.id}/drivers`, 'POST', { ...session, name: 'Blair South', seats: 1 });
  assert.equal(driver.status, 201);
  const rider = await request(`/api/trips/${trip.id}/riders`, 'POST', { ...session, name: 'Casey East', assignmentMode: 'any', lookingForCompany: true });
  assert.equal(rider.status, 201);
  assert.equal(rider.body.driverName, 'Blair South');
  assert.equal((await request('/api/state')).body.trips[0].drivers[0].riders[0].lookingForCompany, true);
}));

test('organizers can post empty endowment slots, with known or unset language, private logs, and no-store responses', () => withServer(async (request) => {
  const frozen = await setup(request);
  const slot = { ...frozen, date: input.date, sessionTime: input.sessionTime, language: 'Spanish' };
  assert.equal((await request('/api/trips', 'POST', slot)).status, 401);
  assert.equal((await request('/api/trips', 'POST', { ...slot, language: 'x'.repeat(61) }, true)).status, 400);
  const posted = await request('/api/trips', 'POST', slot, true);
  assert.equal(posted.status, 201);
  assert.equal(posted.cache, 'no-store');
  assert.equal(posted.body.language, 'Spanish');
  assert.equal('changeLog' in posted.body, false);
  assert.equal(posted.body.drivers.length + posted.body.waitlist.length + posted.body.attendees.length, 0);
  const added = await request('/api/week/plans', 'POST', { ...input, ...slot, tripId: posted.body.id, sessionRevision: posted.body.revision, transport: 'need' });
  assert.equal(added.body.placement, 'need');
  assert.equal(added.body.tripId, posted.body.id);
  assert.equal((await request('/api/state')).body.trips.length, 1);
  const unspecified = await request('/api/trips', 'POST', { ...slot, sessionTime: '20:00', language: '' }, true);
  assert.equal(unspecified.status, 201);
  assert.equal('language' in unspecified.body, false);
}));

test('experiment keeps the 20 KB limit and name/temple validation', () => withServer(async (request) => {
  const frozen = await setup(request);
  for (const invalid of [null, [], "text", 123]) assert.equal((await request('/api/week/plans', 'POST', invalid)).status, 400);
  assert.equal((await request('/api/week/plans', 'POST', { ...input, ...frozen, name: 'x'.repeat(21000) })).status, 413);
  assert.equal((await request('/api/week/plans', 'POST', { ...input, ...frozen, name: 'x'.repeat(81) })).status, 400);
  assert.equal((await request('/api/week', 'PATCH', { ...frozen, temple: 'x'.repeat(101), startDate: '2026-09-07' }, true)).status, 400);
}));

test('pilot entrypoint retains single-trip API and does not serve the experimental interface', () => withServer(async (request, base) => {
  assert.equal((await request('/api/state')).body.version, 3);
  assert.equal((await request('/api/week', 'POST', {}, true)).status, 404);
  const response = await fetch(base + '/week/index.html');
  assert.equal(response.status, 404);
  assert.doesNotMatch(await (await fetch(base)).text(), /week\/app.js/);
}, { experiment: false, blobToken: null }));

test('local launcher ignores pilot/Blob environment and rejects the pilot path explicitly', async () => {
  assert.throws(() => createAppHandler({ experiment: true, dataFile: resolve('data/app-data.json') }), /cannot use the pilot/);
  const previous = { data: process.env.TEMPLE_CARPOOL_DATA_FILE, blob: process.env.BLOB_READ_WRITE_TOKEN };
  process.env.TEMPLE_CARPOOL_DATA_FILE = '/dev/null/never-read-pilot-state';
  process.env.BLOB_READ_WRITE_TOKEN = 'not-a-working-token';
  const server = createLocalWeekServer();
  try {
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const result = await fetch(`http://127.0.0.1:${server.address().port}/api/state`);
    assert.equal(result.status, 200);
    assert.equal((await result.json()).version, 4);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    if (previous.data === undefined) delete process.env.TEMPLE_CARPOOL_DATA_FILE; else process.env.TEMPLE_CARPOOL_DATA_FILE = previous.data;
    if (previous.blob === undefined) delete process.env.BLOB_READ_WRITE_TOKEN; else process.env.BLOB_READ_WRITE_TOKEN = previous.blob;
  }
});

test('flexible member APIs expose no logs and preserve PIN and named-change boundaries', () => withServer(async request => {
  const context = await setup(request);
  const sessions = [];
  for (const sessionTime of ['10:30','11:30']) {
    const result = await request('/api/trips','POST',{...context,date:'2026-09-12',sessionTime},true);
    sessions.push({id:result.body.id,revision:result.body.revision});
  }
  const input = {...context,date:'2026-09-12',earliest:'10:30',latest:'11:30',sessions,name:'Flexible Guest',transport:'need'};
  const added = await request('/api/week/availability','POST',input);
  assert.equal(added.status,201); assert.equal(added.cache,'no-store');
  const state = await request('/api/state');
  assert.equal(state.body.availability.length,1);
  assert.equal(JSON.stringify(state.body).includes('changeLog'),false);
  assert.equal((await request(`/api/trips/${sessions[0].id}/change-log`)).status,401);
  assert.equal((await request(`/api/trips/${sessions[0].id}/change-log`,'GET',undefined,true)).body.entries[0].type,'availability_added');
  const path = `/api/week/availability/${added.body.id}`;
  assert.equal((await request(path,'PATCH',{...input,availabilityRevision:1,confirmationName:'wrong'})).status,400);
  assert.equal((await request(path,'DELETE',{...context,availabilityRevision:1,confirmationName:input.name})).status,200);
}));

test('driver ride decisions require current named confirmation and never expose private logs', () => withServer(async request => {
  const context=await setup(request), slots=[];
  for(const sessionTime of ['10:30','11:30']) slots.push((await request('/api/trips','POST',{...context,date:'2026-09-12',sessionTime},true)).body);
  const sessions=slots.map(t=>({id:t.id,revision:t.revision}));
  const fields={...context,date:'2026-09-12',earliest:'10:30',latest:'11:30',sessions};
  const driver=(await request('/api/week/availability','POST',{...fields,name:'Driver Oak',transport:'offer',seats:1})).body;
  const rider=(await request('/api/week/availability','POST',{...fields,name:'Rider Pine',transport:'need',intendedDriverId:driver.id,driverRevision:driver.revision})).body;
  const state=(await request('/api/state')).body;
  assert.equal(state.availability.find(a=>a.id===rider.id).rideApproval,'pending');
  const decision={...context,driverRevision:state.availability.find(a=>a.id===driver.id).revision,availabilityRevision:rider.revision,decision:'accept'};
  const endpoint=`/api/week/availability/${driver.id}/riders/${rider.id}`;
  assert.equal((await request(endpoint,'POST',{...decision,confirmationName:'wrong'})).status,400);
  const accepted=await request(endpoint,'POST',{...decision,confirmationName:driver.name});
  assert.equal(accepted.status,200);assert.equal(accepted.cache,'no-store');
  const ready=(await request('/api/state')).body;
  const chosen=await request('/api/week/plans','POST',{...context,tripId:slots[0].id,sessionRevision:slots[0].revision,date:slots[0].date,sessionTime:slots[0].sessionTime,availabilityId:driver.id,availabilityRevision:ready.availability.find(a=>a.id===driver.id).revision,confirmationName:driver.name});
  assert.equal(chosen.status,201);
  const final=(await request('/api/state')).body;
  const car=final.trips[0].drivers[0], passenger=car.riders[0];
  assert.equal(passenger.rideApproval,'accepted');assert.equal(final.availability.length,0);
  const declined=await request(`/api/trips/${slots[0].id}/drivers/${car.id}/riders/${passenger.id}`,'POST',{...context,sessionRevision:slots[0].revision,decision:'decline',confirmationName:car.name,riderName:passenger.name,expectedApproval:passenger.rideApproval,expectedRequestId:passenger.rideRequestId});
  assert.equal(declined.status,200);
  assert.equal((await request('/api/state')).body.trips[0].waitlist[0].id,passenger.id);
  assert.equal((await request(`/api/trips/${slots[0].id}/change-log`)).status,401);
}));

test('member API stores exact session choices across dates and rejects stale choice revisions', () => withServer(async request=>{
  const context=await setup(request),slots=[];
  for(const [date,sessionTime] of [['2026-09-11','18:30'],['2026-09-12','10:30'],['2026-09-12','11:30']]) slots.push((await request('/api/trips','POST',{...context,date,sessionTime},true)).body);
  const ids=[slots[0].id,slots[2].id];
  const body={...context,sessionIds:ids,sessions:slots.filter(t=>ids.includes(t.id)).map(t=>({id:t.id,revision:t.revision})),name:'Choice Guest',transport:'need'};
  const response=await request('/api/week/availability','POST',body);
  assert.equal(response.status,201);assert.equal(response.cache,'no-store');
  assert.deepEqual(new Set(response.body.sessionIds),new Set(ids));
  assert.equal(response.body.sessionIds.includes(slots[1].id),false);
  assert.equal((await request('/api/week/availability','POST',{...body,name:'Other Guest',sessions:body.sessions.map(ref=>({...ref,revision:99}))})).status,409);
  assert.equal((await request('/api/state')).body.availability.length,1);
}));

test('member matching is no-store, validates stale snapshots, and keeps logs private',()=>withServer(async request=>{
  const context=await setup(request);
  const rider=(await request('/api/week/plans','POST',{...input,...context,name:'Rider Elm',transport:'need'})).body;
  const driver=(await request('/api/week/plans','POST',{...input,...context,name:'Driver Pine',transport:'offer',seats:1})).body;
  const state=(await request('/api/state')).body;const trip=state.trips[0];
  const body={...context,tripId:trip.id,sessionRevision:trip.revision,personSnapshot:JSON.stringify(driver.person),action:'fill'};
  const result=await request(`/api/week/match/${driver.person.id}`,'POST',body);
  assert.equal(result.status,200);assert.equal(result.cache,'no-store');assert.deepEqual(result.body.added,[rider.person.name]);
  assert.equal((await request(`/api/week/match/${driver.person.id}`,'POST',body)).status,409);
  const current=(await request('/api/state')).body.trips[0];assert.equal(current.changeLog,undefined);assert.equal(current.drivers[0].riders[0].rideApproval,'accepted');
  assert.equal((await request(`/api/trips/${trip.id}/change-log`)).status,401);
}));

test('week support is private, validated, independent of the roster, and cleared on replacement', () => withServer(async request => {
  const ctx = await setup(request);
  const path = '/api/week/support';
  const body = {...ctx, name:'Example Member', needs:['babysitting','questions'], nursing:true, date:'2026-09-08'};
  assert.equal((await request(path,'POST',{...body,needs:['questions']})).status,400);
  assert.equal((await request(path,'POST',{...body,needs:[]})).status,400);
  assert.equal((await request(path,'POST',{...body,date:'2026-09-21'})).status,400);
  assert.equal((await request(path,'POST',body)).status,201);
  const publicState = (await request('/api/state')).body;
  assert.equal(JSON.stringify(publicState).includes(body.name),false);
  assert.deepEqual(publicState.trips,[]);
  assert.deepEqual(publicState.availability,[]);
  assert.equal((await request(path)).status,401);
  const inbox = await request(path,'GET',undefined,true);
  assert.equal(inbox.cache,'no-store');
  const [item] = inbox.body.requests;
  assert.equal(item.nursing,true);
  assert.deepEqual(item.needs,body.needs);
  const complete = {...ctx,id:item.id};
  assert.equal((await request(path,'PATCH',complete)).status,401);
  assert.equal((await request(path,'PATCH',complete,true)).status,200);
  assert.equal((await request(path,'GET',undefined,true)).body.requests[0].completed,true);
  const replacement = {...ctx,temple:'Another Temple',startDate:'2026-10-05'};
  assert.equal((await request('/api/week','PATCH',replacement,true)).status,409);
  assert.equal((await request('/api/week','PATCH',{...replacement,replace:true,confirmationTemple:'Test Temple'},true)).status,200);
  assert.deepEqual((await request(path,'GET',undefined,true)).body.requests,[]);
  assert.equal((await request(path,'POST',body)).status,409);
}));

test('the organizer publishes one session and restores the week with its original signups', () => withServer(async request => {
  const original = await setup(request);
  const slots = [];
  for (const sessionTime of ['10:30', '11:30']) {
    const result = await request('/api/trips', 'POST', {...original, date:input.date, sessionTime, language:input.language}, true);
    slots.push(result.body);
  }
  const [first, second] = slots;
  const session = trip => ({tripId:trip.id, sessionRevision:trip.revision});
  const flexible = await request('/api/week/availability', 'POST', {
    ...original, sessionIds:slots.map(t => t.id), sessions:slots.map(({id,revision}) => ({id,revision})),
    transport:'need', name:'Flexible Rider'
  });
  assert.equal(flexible.status, 201);
  const hiddenPlan = {...input, ...original, ...session(second), sessionTime:second.sessionTime};
  assert.equal((await request('/api/week/plans', 'POST', hiddenPlan)).status, 201);
  const path = '/api/week/member-view';
  const choice = {...original, mode:'session', ...session(first)};
  assert.equal((await request(path, 'PATCH', choice)).status, 401);
  assert.equal((await request('/api/admin/week-state')).status, 401);
  assert.equal((await request(path, 'PATCH', {...choice, mode:'other'}, true)).status, 400);
  assert.equal((await request(path, 'PATCH', {...choice, tripId:'missing'}, true)).status, 409);
  assert.equal((await request(path, 'PATCH', {...choice, sessionRevision:0}, true)).status, 409);
  assert.equal((await request(path, 'PATCH', choice, true)).status, 200);

  const current = await request('/api/state');
  const restricted = {...original, weekRevision:current.body.week.revision};
  assert.equal(current.cache, 'no-store');
  assert.deepEqual(current.body.trips.map(t => t.id), [first.id]);
  assert.deepEqual(current.body.availability, []);
  const admin = await request('/api/admin/week-state', 'GET', undefined, true);
  assert.equal(admin.cache, 'no-store');
  assert.equal(admin.body.trips.length, 2);
  assert.equal(admin.body.availability.length, 1);
  assert.equal('supportRequests' in admin.body, false);
  assert.equal('changeLog' in admin.body.trips[0], false);

  assert.equal((await request(path, 'PATCH', {...original, mode:'week'}, true)).status, 409);
  assert.equal((await request('/api/week/plans', 'POST', {...input, ...choice, sessionTime:first.sessionTime})).body.code, 'STALE_CONTEXT');
  assert.equal((await request('/api/week/plans', 'POST', {...hiddenPlan, ...restricted})).body.code, 'STALE_CONTEXT');
  assert.equal((await request('/api/week/plans', 'POST', {...input, ...restricted})).status, 409);
  const visible = {...restricted, ...session(first)};
  const driver = await request('/api/week/plans', 'POST', {...input, ...visible, sessionTime:first.sessionTime, transport:'offer', seats:2});
  assert.equal(driver.status, 201);
  const fill = await request('/api/week/match/' + driver.body.person.id, 'POST', {
    ...visible, action:'fill', personSnapshot:JSON.stringify(driver.body.person)
  });
  assert.deepEqual(fill.body.added, []);
  assert.equal((await request('/api/trips/' + first.id, 'DELETE', visible, true)).status, 409);
  assert.equal((await request(path, 'PATCH', {...restricted, mode:'session', ...session(second)}, true)).status, 200);
  const switched = (await request('/api/state')).body;
  assert.deepEqual(switched.trips.map(t => t.id), [second.id]);
  assert.equal(switched.trips[0].attendees[0].name, input.name);
  assert.equal((await request(path, 'PATCH', {...restricted, weekRevision:switched.week.revision, mode:'week'}, true)).status, 200);
  const restored = (await request('/api/state')).body;
  assert.equal(restored.trips.length, 2);
  assert.equal(restored.trips[0].drivers[0].id, driver.body.person.id);
  assert.equal(restored.availability[0].id, flexible.body.id);
}));

const eventPath = '/api/admin/events';
const draftSession = {
  kind:'session', temple:'Future Temple', startDate:'2026-12-05',
  sessions:[{date:'2026-12-05', sessionTime:'11:30', language:'ASL'}]
};

test('drafts, previews and history are private and activation preserves existing event rosters', () => withServer(async request => {
  const before = await setup(request);
  await request('/api/week/plans', 'POST', {...input, ...before});
  await request('/api/week/support', 'POST', {...before, name:'Private Request', needs:['company']});
  const create = await request(eventPath, 'POST', draftSession, true);
  assert.equal(create.status, 201);
  const draft = create.body;
  const path = eventPath + '/' + draft.id;
  for (const [url,method] of [[eventPath,'POST'],[path,'PATCH'],[path+'/preview','GET'],[path+'/activate','POST'],[eventPath+'/end','POST']]) {
    assert.equal((await request(url, method)).status, 401);
  }
  const preview = await request(path + '/preview', 'GET', undefined, true);
  assert.equal(preview.cache, 'no-store');
  assert.equal(preview.body.trips[0].language, 'ASL');
  assert.equal(preview.body.week.publishedSessionId, preview.body.trips[0].id);
  const active = (await request('/api/state')).body;
  assert.equal(active.week.id, before.weekId);
  assert.ok(!JSON.stringify(active).includes(draft.id));
  assert.equal((await request('/api/week/plans','POST',{...input, weekId:draft.id, weekRevision:1})).status, 409);

  const selection = {...before, revision:draft.revision};
  assert.equal((await request(path+'/activate','POST',selection,true)).status,200);
  const newActive = (await request('/api/state')).body;
  assert.equal(newActive.week.id,draft.id);
  assert.doesNotMatch(JSON.stringify(newActive), /Private Request|Avery North|savedEvents/);
  assert.equal((await request('/api/week/plans', 'POST', {...before, ...input})).status,409);
  const historical = (await request(eventPath+'/'+before.weekId+'/preview','GET',undefined,true)).body;
  assert.equal(historical.trips[0].attendees[0].name,input.name);
  assert.doesNotMatch(JSON.stringify(historical), /changeLog|Private Request/);
  const [past] = (await request('/api/admin/week-state','GET',undefined,true)).body.events;
  assert.equal(past.status, 'past');
  assert.equal((await request(eventPath+'/'+past.id,'PATCH',{...draftSession,revision:past.revision},true)).status,409);
  assert.equal((await request(eventPath+'/'+past.id+'/activate','POST',{
    weekId:draft.id,weekRevision:newActive.week.revision,revision:past.revision
  },true)).status,200);
  assert.equal((await request('/api/week/plans','POST',{...before,...input})).status,409);
  const restored = (await request('/api/state')).body;
  assert.equal(restored.trips[0].attendees[0].name,input.name);
  assert.equal((await request('/api/week/support','GET',undefined,true)).body.requests[0].name,'Private Request');
  assert.equal((await request('/api/trips/'+restored.trips[0].id+'/change-log','GET',undefined,true)).body.entries.length,2);
  assert.equal((await request(eventPath+'/end','POST',{weekId:past.id, weekRevision:restored.week.revision},true)).status,200);
  assert.equal((await request('/api/state')).body.week,null);
  assert.equal((await request('/api/admin/week-state','GET',undefined,true)).body.events.length,2);
}));

test('week drafts validate exact times and languages, allow editing, and race safely for the active event', () => withServer(async request => {
  const sessions = [draftSession.sessions[0], {date:'2026-12-11',sessionTime:'18:00',language:''}];
  const week = {...draftSession, kind:'week', sessions};
  const create = body => request(eventPath, 'POST', body, true);
  for (const invalid of [
    {...week,kind:'other'}, {...draftSession,sessions}, {...week,sessions:[...sessions,sessions[0]]},
    {...week,sessions:[{date:'2026-12-12',sessionTime:'18:00'}]}
  ]) assert.equal((await create(invalid)).status,400);
  const draft = (await create(draftSession)).body;
  const path = eventPath+'/'+draft.id;
  const edit = {...week,revision:draft.revision};
  const updated = await request(path,'PATCH',edit,true);
  assert.equal(updated.status,200);
  assert.equal((await request(path,'PATCH',edit,true)).status,409);
  assert.equal((await request(path+'/activate','POST',{weekId:null,revision:draft.revision},true)).status,409);
  const preview = (await request(path+'/preview','GET',undefined,true)).body;
  assert.equal(preview.trips.length,2);
  assert.equal(preview.week.publishedSessionId,undefined);
  assert.equal(preview.trips[1].language,undefined);
  const other = (await create(draftSession)).body;
  const results = await Promise.all([updated.body,other].map(event => request(
    eventPath+'/'+event.id+'/activate','POST',{weekId:null,revision:event.revision},true)));
  assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
  assert.equal((await request('/api/admin/week-state','GET',undefined,true)).body.events.length,1);
}));
