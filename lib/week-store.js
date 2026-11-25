import { randomUUID } from 'node:crypto';
import {
  StoreError, FileStateBackend, cleanText, cleanDate, cleanTime,
  appendChange, getOpenSeats, requirePersonConfirmation, requireNameMatchConfirmation
} from './store.js';

export const createWeekState = () => ({ version: 4, week: null, trips: [], availability: [] });
const stale = () => new StoreError('These plans have changed. Close this form and review the refreshed week before trying again.', 409, { code: 'STALE_CONTEXT' });
const actor = (context) => context?.actor === 'administrator' ? 'administrator' : 'member';
const languageKey = (value) => (value || '').toLocaleLowerCase('en-US');
const cleanLanguage = (value) => cleanText(value, 'Session language', 60, false) || undefined;

function cleanWeek(input) {
  const startDate = cleanDate(input.startDate);
  const end = new Date(`${startDate}T12:00:00Z`);
  end.setUTCDate(end.getUTCDate() + 6);
  const endDate = end.toISOString().slice(0, 10);
  cleanDate(endDate);
  return { temple: cleanText(input.temple, 'Temple', 100), startDate, endDate, notes: cleanText(input.notes, 'Note', 240, false) };
}

function newSession(week, date, sessionTime, language, notes) {
  const trip = { id: randomUUID(), revision: 1, temple: week.temple, date, sessionTime, language,
    notes: cleanText(notes, 'Note', 240, false), createdAt: new Date().toISOString(),
    drivers: [], waitlist: [], attendees: [], changeLog: [] };
  appendChange(trip, 'trip_created', week.temple, `Endowment session posted for ${date} at ${sessionTime} (${language || 'language not set'}).`, 'administrator');
  return trip;
}

function activeEventData({week, trips, availability, supportRequests = []}) {
  return {week, trips, availability, supportRequests};
}

export function eventSummary(event) {
  const {week, trips} = event;
  const session = trips.find(trip => trip.id === week.publishedSessionId);
  return {
    id:week.id, revision:week.revision, temple:week.temple, startDate:week.startDate, endDate:week.endDate,
    status:event.status, sessionCount:trips.length,
    session:session ? {date:session.date, sessionTime:session.sessionTime, language:session.language} : null
  };
}

function buildDraft(input, previous) {
  if (!['week', 'session'].includes(input.kind)) throw new StoreError('Choose a temple session or a temple week.');
  const week = {...cleanWeek(input), id:previous?.week.id ?? randomUUID(), revision:(previous?.week.revision ?? 0) + 1};
  if (!Array.isArray(input.sessions) || (input.kind === 'session' && input.sessions.length !== 1)) {
    throw new StoreError('A session event needs one endowment time.');
  }
  const trips = input.sessions.map(slot => {
    if (!slot || typeof slot !== 'object') throw new StoreError('Enter a valid session.');
    const date = sessionDate(week, slot.date);
    if (input.kind === 'session' && date !== week.startDate) throw new StoreError('Choose the event date for this session.');
    return newSession(week, date, cleanTime(slot.sessionTime, 'Session time'), cleanLanguage(slot.language), input.kind === 'session' ? week.notes : '');
  });
  if (new Set(trips.map(trip => trip.date + trip.sessionTime)).size !== trips.length) throw new StoreError('Each session needs a different day or time.');
  if (input.kind === 'session') week.publishedSessionId = trips[0].id;
  return {week, trips, availability:[], supportRequests:[], status:'draft'};
}

function weekContext(state, input) {
  if (!state.week || input.weekId !== state.week.id || input.weekRevision !== state.week.revision) throw stale();
  return state.week;
}

function sessionDate(week, date) {
  const result = cleanDate(date);
  if (result < week.startDate || result > week.endDate) throw new StoreError('Choose a day within temple week.');
  return result;
}

function tripContext(state, tripId, input) {
  weekContext(state, input);
  const trip = state.trips.find((item) => item.id === tripId);
  if (!trip || input.sessionRevision !== trip.revision) throw stale();
  return trip;
}

// Share the selected roster by reference so writes still commit to the full week.
export function publishedRoster(state) {
  const selected = state.week?.publishedSessionId;
  if (!selected) return state;
  return {...state, trips:state.trips.filter(trip => trip.id === selected), availability:[]};
}

function memberRoster(state, tripId) {
  if (state.week?.publishedSessionId && tripId !== state.week.publishedSessionId) throw stale();
  return publishedRoster(state);
}

function findPerson(trip, personId) {
  for (const person of trip.drivers) {
    if (person.id === personId) return { person, list: trip.drivers, transport: 'offer', driver: person };
    const rider = person.riders.find((item) => item.id === personId);
    if (rider) return { person: rider, list: person.riders, transport: 'car', driver: person };
  }
  const waiting = trip.waitlist.find((item) => item.id === personId);
  if (waiting) return { person: waiting, list: trip.waitlist, transport: 'need' };
  const attendee = trip.attendees.find((item) => item.id === personId);
  if (attendee) return { person: attendee, list: trip.attendees, transport: 'own' };
  throw new StoreError('That signup is no longer available. Refresh the session.', 409);
}

function companyValue(value, fallback = false) {
  if (value === undefined) return fallback;
  if (typeof value !== 'boolean') throw new StoreError('Choose whether you would like company.');
  return value;
}

function placement(trip, input, existing) {
  const transport = input.transport ?? existing?.transport;
  if (!['offer', 'need', 'own', 'car'].includes(transport)) throw new StoreError('Choose how you will get there.');
  if (transport !== 'car' && (input.driverId || input.assignmentMode)) throw new StoreError('Choose either a car or another transportation option.');
  if (transport === 'offer') {
    const seats = Number(input.seats ?? existing?.person.seats);
    if (!Number.isInteger(seats) || seats < 1 || seats > 8) throw new StoreError('Choose between 1 and 8 passenger seats.');
    if (existing?.transport === 'offer' && seats < existing.person.riders.length) {
      throw new StoreError(`This car already has ${existing.person.riders.length} riders. Keep at least that many passenger seats.`, 409);
    }
    return { transport, seats };
  }
  // An unchanged waiting entry must stay put when only its name/company is edited.
  const requestRide = transport === 'need' && (input.transport !== undefined && existing?.transport !== 'need');
  if (transport !== 'car' && !requestRide) return { transport };
  if (input.assignmentMode && input.assignmentMode !== 'any') throw new StoreError('Choose a valid ride option.');
  if (input.assignmentMode && input.driverId) throw new StoreError('Choose either a specific car or any car.');
  const eligible = trip.drivers.filter((driver) => driver.id !== existing?.person.id);
  let driver;
  if (requestRide || input.assignmentMode === 'any') {
    // Stable tie order, with the smallest remaining capacity first, fills cars.
    // Keep an already assigned rider in their current car on an "any" request.
    driver = existing?.transport === 'car' ? existing.driver : eligible.filter((item) => getOpenSeats(item) > 0)
      .sort((a, b) => getOpenSeats(a) - getOpenSeats(b))[0];
    if (!driver) return { transport: 'need' };
  } else {
    driver = eligible.find((item) => item.id === (input.driverId ?? existing?.driver?.id));
  }
  if (!driver) throw new StoreError('That car is no longer available. Please choose another ride.', 409);
  if (getOpenSeats(driver) < 1 && !(existing?.transport === 'car' && existing.driver.id === driver.id)) {
    throw new StoreError('That car just filled up. Please choose another ride.', 409);
  }
  return { transport: 'car', driver };
}

function describe(found) {
  const { person, transport, driver } = found;
  const ride = transport === 'offer' ? `offering ${person.seats} passenger seats`
    : transport === 'car' ? `${person.rideApproval === 'pending' ? 'awaiting acceptance from' : 'ride accepted by'} ${driver.name}`
      : transport === 'need' ? 'needing a ride' : 'has own transportation';
  return `${person.name}: ${ride}; ${person.lookingForCompany ? 'looking for company' : 'not requesting company'}`;
}

function place(trip, person, destination) {
  delete person.seats;
  delete person.riders;
  delete person.rideApproval;
  delete person.rideRequestId;
  if (destination.transport === 'offer') {
    person.seats = destination.seats;
    person.riders = destination.riders ?? [];
    trip.drivers.push(person);
  } else if (destination.transport === 'car') {
    person.rideApproval = destination.approval || 'pending';
    person.rideRequestId = destination.requestId || randomUUID();
    destination.driver.riders.push(person);
  }
  else if (destination.transport === 'need') trip.waitlist.push(person);
  else trip.attendees.push(person);
}

function inRange(entry, trip) {
  return entry.sessionIds ? entry.sessionIds.includes(trip.id) && (!entry.sessionChoices || entry.sessionChoices.some(ref=>ref.id===trip.id && ref.revision===trip.revision)) : entry.date === trip.date && trip.sessionTime >= entry.earliest && trip.sessionTime <= entry.latest;
}
function checkNames(state, sessions, name, input, excludeId) {
  const roster = { drivers: sessions.flatMap(t => t.drivers), waitlist: sessions.flatMap(t => t.waitlist),
    attendees: sessions.flatMap(t => t.attendees) };
  const flexible = state.availability.filter(a => a.id !== excludeId && sessions.some(t => inRange(a, t)));
  roster.attendees.push(...flexible);
  try { requireNameMatchConfirmation(roster, name, input); }
  catch (error) {
    if (error.details?.matches) error.details.matches = error.details.matches.map(m => flexible.some(a => a.id === m.id) ? { ...m, placement: 'flexible' } : sessions.some(t=>t.drivers.some(d=>d.riders.some(r=>r.id===m.id && r.rideApproval==='pending'))) ? {...m,placement:'pending'} : m);
    throw error;
  }
}
const requestsFor = (state, driverId) => state.availability.filter(a => a.intendedDriverId === driverId);
export function compatibleSessions(state, driver, extra = []) {
  const riders = [...requestsFor(state, driver.id), ...extra];
  return state.trips.filter(t => inRange(driver, t) && riders.every(r => inRange(r, t)));
}
function detachIntent(state, rider, context) {
  const driver = state.availability.find(a => a.id === rider.intendedDriverId);
  if (driver) driver.revision += 1;
  delete rider.intendedDriverId;
  delete rider.rideApproval;
  rider.revision += 1;
  logAvailability(state, rider, 'ride_request_released', context);
}
function logAvailability(state, entry, action, context) {
  for (const trip of state.trips.filter(t => inRange(entry, t))) {
    appendChange(trip, action, entry.name, `${entry.name}: flexible availability ${entry.sessionIds ? state.trips.filter(t=>inRange(entry,t)).map(t=>`${t.date} ${t.sessionTime}`).join(', ') : `${entry.date}, ${entry.earliest}–${entry.latest}`}; ${entry.transport}${entry.intendedDriverId ? `; intended car ${entry.intendedDriverId}, ${entry.rideApproval}` : ''}; ${entry.lookingForCompany ? 'looking for company' : 'not requesting company'}. ${entry.intendedDriverId ? 'Passenger place held; final session not chosen.' : 'No seat reserved.'}`, actor(context));
  }
}

// Matching is an explicit member action, never a background side effect.
function availableRiders(state) {
  return [...state.availability.filter(a=>a.transport==='need' && !a.intendedDriverId).map(person=>({person})),
    ...state.trips.flatMap(trip=>trip.waitlist.map(person=>({person,trip})))];
}
function riderChoices(source) {
  return source.trip ? {...source.person,date:source.trip.date,earliest:source.trip.sessionTime,latest:source.trip.sessionTime,sessionIds:[source.trip.id],sessionChoices:[{id:source.trip.id,revision:source.trip.revision}]} : source.person;
}
function cars(state) {
  return [...state.availability.filter(a=>a.transport==='offer').map(driver=>({driver,open:driver.seats-requestsFor(state,driver.id).length})),
    ...state.trips.flatMap(trip=>trip.drivers.map(driver=>({driver,trip,open:getOpenSeats(driver)})))];
}
function canMatch(state, car, source) {
  if (car.open<1) return false;
  const rider=riderChoices(source);
  return car.trip ? inRange(rider,car.trip) : compatibleSessions(state,car.driver,[rider]).length>0;
}
function assignMatch(state, car, source, approval, context) {
  const original=source.person;
  if (source.trip) source.trip.waitlist=source.trip.waitlist.filter(p=>p.id!==original.id);
  else state.availability=state.availability.filter(p=>p.id!==original.id);
  if (car.trip) {
    const person={id:original.id,name:original.name,createdAt:original.createdAt,lookingForCompany:original.lookingForCompany};
    place(car.trip,person,{transport:'car',driver:car.driver,approval});
    appendChange(car.trip,'ride_matched',person.name,`${person.name}: ${approval} ride with ${car.driver.name}.`,actor(context));
  } else {
    const person={...riderChoices(source),transport:'need',revision:(original.revision||0)+1,intendedDriverId:car.driver.id,rideApproval:approval};
    state.availability.push(person); car.driver.revision+=1;
    logAvailability(state,person,'ride_matched',context);
  }
  if (source.trip && source.trip!==car.trip) appendChange(source.trip,'ride_matched',original.name,`${original.name}: ${approval} intended ride with ${car.driver.name}.`,actor(context));
  if (!source.trip && car.trip) logAvailability(state,original,'availability_resolved',context);
  car.open-=1;
  return {matched:true,driverName:car.driver.name,tripId:car.trip?.id,approval};
}
function matchAny(state, source, context) {
  const car=cars(state).filter(c=>canMatch(state,c,source)).sort((a,b)=>a.open-b.open || a.driver.createdAt.localeCompare(b.driver.createdAt) || a.driver.id.localeCompare(b.driver.id))[0];
  return car ? assignMatch(state,car,source,'pending',context) : {matched:false};
}

// Same revision/retry contract as the pilot, with a deliberately separate schema.
export class WeekStore {
  #backend;
  #queue = Promise.resolve();
  constructor(filePath, { backend } = {}) {
    this.#backend = backend ?? new FileStateBackend(filePath);
  }
  async #snapshot() {
    const snapshot = await this.#backend.read();
    if (!snapshot) return { state: createWeekState(), revision: null };
    if (snapshot.state.version !== 4 || !Array.isArray(snapshot.state.trips) || !('week' in snapshot.state)) {
      throw new StoreError('This is not Temple Week experiment data. Use a separate experiment file; no migration was performed.', 409);
    }
    snapshot.state.availability ??= [];
    return snapshot;
  }
  async read() { return (await this.#snapshot()).state; }
  #mutate(mutator) {
    const operation = this.#queue.then(async () => {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const { state, revision } = await this.#snapshot();
        const result = mutator(state);
        try {
          await this.#backend.write(state, revision);
          return result;
        } catch (error) {
          if (error.code !== 'STATE_CONFLICT') throw error;
        }
      }
      throw new StoreError('Another signup changed at the same time. Please try again.', 409);
    });
    this.#queue = operation.catch(() => undefined);
    return operation;
  }
  saveDraft(input, id) {
    return this.#mutate(state => {
      state.savedEvents ??= [];
      const index = state.savedEvents.findIndex(event => event.week.id === id);
      const previous = state.savedEvents[index];
      if (id && (!previous || previous.status !== 'draft' || previous.week.revision !== input.revision)) throw stale();
      const draft = buildDraft(input, previous);
      if (id) state.savedEvents[index] = draft;
      else state.savedEvents.push(draft);
      return eventSummary(draft);
    });
  }
  async previewEvent(id) {
    const state = await this.read();
    const event = state.week?.id === id ? activeEventData(state) : state.savedEvents?.find(item => item.week.id === id);
    if (!event) throw new StoreError('This event is no longer available.', 404);
    return {version:4, ...publishedRoster(activeEventData(event))};
  }
  changeActiveEvent(id, input) {
    return this.#mutate(state => {
      if (state.week) weekContext(state, input);
      else if (input.weekId !== null) throw stale();
      state.savedEvents ??= [];
      let next;
      if (id) {
        const index = state.savedEvents.findIndex(event => event.week.id === id);
        if (index === -1 || state.savedEvents[index].week.revision !== input.revision) throw stale();
        [next] = state.savedEvents.splice(index, 1);
      } else if (!state.week) throw stale();
      if (state.week) {
        state.week.revision += 1;
        state.savedEvents.push({...activeEventData(state), status:'past'});
      }
      if (next) next.week.revision += 1;
      Object.assign(state, activeEventData(next || createWeekState()));
      return {ok:true};
    });
  }
  requestSupport(input) {
    return this.#mutate(state => {
      weekContext(state, input);
      const name = cleanText(input.name, 'Name', 80);
      const allowed = ['babysitting', 'ride', 'company', 'questions', 'familyHistory'];
      if (!Array.isArray(input.needs) || !input.needs.length || !input.needs.every(need => allowed.includes(need))) {
        throw new StoreError('Choose at least one kind of support.');
      }
      const nursing = input.nursing ?? false;
      if (typeof nursing !== 'boolean' || (nursing && !input.needs.includes('babysitting'))) {
        throw new StoreError('Choose babysitting to request a sitter with nursing credentials.');
      }
      state.supportRequests ??= [];
      state.supportRequests.push({id:randomUUID(), name, needs:[...new Set(input.needs)], nursing,
        date:input.date ? sessionDate(state.week, input.date) : null, createdAt:new Date().toISOString(), completed:false});
      return {ok:true};
    });
  }
  completeSupport(input) {
    return this.#mutate(state => {
      weekContext(state, input);
      const request = state.supportRequests?.find(item => item.id === input.id);
      if (!request) throw stale();
      request.completed = true;
      return {ok:true};
    });
  }
  setMemberView(input) {
    return this.#mutate(state => {
      const week = weekContext(state, input);
      if (!['week','session'].includes(input.mode)) throw new StoreError('Choose Temple Week or Specific Temple Session.');
      const selected = input.mode === 'session' ? tripContext(state, input.tripId, input).id : null;
      if ((week.publishedSessionId || null) !== selected) {
        if (selected) week.publishedSessionId = selected;
        else delete week.publishedSessionId;
        week.revision += 1;
      }
      return {ok:true};
    });
  }
  saveWeek(input) {
    return this.#mutate((state) => {
      const cleaned = cleanWeek(input);
      if (state.week) {
        weekContext(state, input);
        const boundaryChanged = cleaned.temple !== state.week.temple || cleaned.startDate !== state.week.startDate;
        if (boundaryChanged && (state.trips.length || state.availability.length || state.supportRequests?.length)) {
          if (input.replace !== true || input.confirmationTemple !== state.week.temple) {
            throw new StoreError('Replacing this week removes all of its sessions, signups, and logs. Type the current temple name to confirm.', 409);
          }
          state.trips = [];
          state.availability = [];
          state.supportRequests = [];
          state.week = { id: randomUUID(), revision: 1, ...cleaned };
        } else state.week = { ...state.week, ...cleaned, revision: state.week.revision + 1 };
      } else {
        if (input.weekId) throw stale();
        state.week = { id: randomUUID(), revision: 1, ...cleaned };
      }
      return state.week;
    });
  }
  deleteWeek(input) {
    return this.#mutate((state) => {
      const week = weekContext(state, input);
      if (input.confirmationTemple !== week.temple) throw new StoreError('Type the temple name to confirm removing this week and every signup.');
      state.availability = [];
      state.supportRequests = [];
      state.week = null;
      state.trips = [];
      return { ok: true };
    });
  }
  createTrip(input) {
    return this.#mutate((state) => {
      const week = weekContext(state, input);
      const date = sessionDate(week, input.date);
      const sessionTime = cleanTime(input.sessionTime, 'Session time');
      const language = cleanLanguage(input.language);
      const existing = state.trips.find((item) => item.date === date && item.sessionTime === sessionTime);
      if (existing) {
        if (languageKey(existing.language) !== languageKey(language)) throw new StoreError('A session already exists at that time. Edit its language instead of creating another roster.', 409);
        return existing;
      }
      const trip = newSession(week, date, sessionTime, language, input.notes);
      state.trips.push(trip);
      return trip;
    });
  }
  saveAvailability(input, context = {}, id) {
    return this.#mutate(state => {
      state = memberRoster(state);
      const week = weekContext(state, input);
      const previous = id ? state.availability.find(a => a.id === id) : null;
      if (id && (!previous || input.availabilityRevision !== previous.revision)) throw stale();
      if (previous) requirePersonConfirmation(previous, input, 'this change');
      let date, earliest, latest, sessions;
      const explicit = input.sessionIds !== undefined;
      if (explicit) {
        if (!Array.isArray(input.sessionIds) || !input.sessionIds.length || input.sessionIds.some(id=>typeof id !== 'string') || new Set(input.sessionIds).size !== input.sessionIds.length) throw new StoreError('Choose at least one listed session, without repeats.');
        sessions = state.trips.filter(t=>input.sessionIds.includes(t.id)).sort((a,b)=>a.date.localeCompare(b.date)||a.sessionTime.localeCompare(b.sessionTime));
        if (sessions.length !== input.sessionIds.length) throw stale();
        for (const trip of sessions) sessionDate(week,trip.date);
        date = sessions[0].date; earliest = sessions[0].sessionTime; latest = sessions.at(-1).sessionTime;
      } else {
        date = sessionDate(week, input.date);
        earliest = cleanTime(input.earliest, 'Earliest session');
        latest = cleanTime(input.latest, 'Latest session');
        if (earliest > latest || (earliest === latest && !input.intendedDriverId && !previous?.intendedDriverId && !(previous && previous.earliest === previous.latest))) throw new StoreError('Choose a later last session, or sign up for one session instead.');
        sessions = state.trips.filter(t => t.date === date && t.sessionTime >= earliest && t.sessionTime <= latest);
        if (!sessions.some(t => t.sessionTime === earliest) || !sessions.some(t => t.sessionTime === latest)) throw stale();
      }
      if (!Array.isArray(input.sessions) || sessions.length !== input.sessions.length || sessions.some(t => !input.sessions.some(ref => ref.id === t.id && ref.revision === t.revision))) throw stale();
      if (!['offer', 'need', 'own'].includes(input.transport)) throw new StoreError('Choose how you will get there.');
      const destination = placement({ drivers: [] }, input);
      if (previous?.intendedDriverId && input.transport !== 'need') throw new StoreError('Cancel this seat request before changing transportation.');
      const name = cleanText(input.name, 'Name', 80);
      checkNames(state, sessions, name, input, id);
      const entry = { id: previous?.id || randomUUID(), revision: (previous?.revision || 0) + 1, date, earliest, latest, name, ...(explicit ? {sessionIds:sessions.map(t=>t.id),sessionChoices:sessions.map(t=>({id:t.id,revision:t.revision}))} : {}),
        transport: input.transport, ...(destination.seats ? { seats: destination.seats } : {}),
        lookingForCompany: companyValue(input.lookingForCompany), createdAt: previous?.createdAt || new Date().toISOString() };
      const intendedId = previous?.intendedDriverId || input.intendedDriverId;
      if (intendedId) {
        const driver = state.availability.find(a => a.id === intendedId && a.transport === 'offer');
        if (!driver || driver.id === entry.id || entry.transport !== 'need') throw stale();
        if (input.driverRevision !== driver.revision) throw stale();
        const others = requestsFor(state, driver.id).filter(a => a.id !== entry.id);
        if (others.length >= driver.seats) throw new StoreError('All places in this car are already held. Choose another car.', 409);
        const candidates = state.trips.filter(t => inRange(driver,t) && [entry,...others].every(r=>inRange(r,t)));
        if (!candidates.length) throw new StoreError('These times do not overlap with everyone in the car. Choose another time or car.', 409);
        entry.intendedDriverId = driver.id;
        const changed = !previous || previous.date !== entry.date || previous.earliest !== entry.earliest || previous.latest !== entry.latest || previous.name !== entry.name || JSON.stringify(previous.sessionIds || null) !== JSON.stringify(entry.sessionIds || null) || JSON.stringify(previous.sessionChoices || null) !== JSON.stringify(entry.sessionChoices || null);
        entry.rideApproval = changed ? 'pending' : previous.rideApproval;
        driver.revision += 1;
      }
      const linked = previous?.transport === 'offer' ? requestsFor(state, previous.id) : [];
      if (linked.length) {
        if (entry.transport !== 'offer') {
          for (const rider of linked) detachIntent(state, rider, context);
        } else {
          if (entry.seats < linked.length) throw new StoreError('Keep enough seats for all pending and accepted riders.', 409);
          if (!state.trips.some(t=>inRange(entry,t) && linked.every(r=>inRange(r,t)))) throw new StoreError('These times do not overlap with everyone in the car.',409);
        }
      }
      if (previous) logAvailability(state, previous, 'availability_changed_from', context);
      state.availability = state.availability.filter(a => a.id !== id);
      state.availability.push(entry);
      logAvailability(state, entry, previous ? 'availability_updated' : 'availability_added', context);
      if (input.joinAny === true) {
        if (previous || entry.transport !== 'need' || entry.intendedDriverId) throw new StoreError('Join any car is available for a new independent ride request.');
        return {...entry, match:matchAny(state,{person:entry},context)};
      }
      return entry;
    });
  }
  matchRide(id, input, context = {}) {
    return this.#mutate(state=>{
      state = memberRoster(state, input.tripId);
      weekContext(state,input);
      let person, trip;
      if (input.tripId) {
        trip=tripContext(state,input.tripId,input);
        person=[...trip.drivers,...trip.waitlist].find(p=>p.id===id);
        if (!person || JSON.stringify(person)!==input.personSnapshot) throw stale();
      } else {
        person=state.availability.find(p=>p.id===id);
        if (!person || person.revision!==input.availabilityRevision) throw stale();
      }
      if (input.action==='join') {
        if (trip ? !trip.waitlist.includes(person) : person.transport!=='need' || person.intendedDriverId) throw stale();
        return matchAny(state,{person,trip},context);
      }
      if (input.action!=='fill' || (trip ? !trip.drivers.includes(person) : person.transport!=='offer')) throw new StoreError('Choose a valid ride action.');
      const car=cars(state).find(c=>c.driver.id===id);
      const added=[];
      const candidates=availableRiders(state).sort((a,b)=>a.person.createdAt.localeCompare(b.person.createdAt)||a.person.id.localeCompare(b.person.id));
      for (const source of candidates) {
        if (canMatch(state,car,source)) { assignMatch(state,car,source,'accepted',context); added.push(source.person.name); }
      }
      return {added,tripId:trip?.id,driverName:person.name};
    });
  }
  removeAvailability(id, input, context = {}) {
    return this.#mutate(state => {
      state = memberRoster(state);
      weekContext(state, input);
      const entry = state.availability.find(a => a.id === id);
      if (!entry || entry.revision !== input.availabilityRevision) throw stale();
      requirePersonConfirmation(entry, input, 'removal');
      if (entry.intendedDriverId) detachIntent(state, entry, context);
      for (const rider of requestsFor(state, entry.id)) detachIntent(state, rider, context);
      logAvailability(state, entry, 'availability_removed', context);
      state.availability = state.availability.filter(a => a.id !== id);
      return { ok: true };
    });
  }
  decideFlexibleRide(driverId, riderId, input, context = {}) {
    return this.#mutate(state => {
      state = memberRoster(state);
      weekContext(state, input);
      const driver = state.availability.find(a => a.id === driverId && a.transport === 'offer');
      const rider = state.availability.find(a => a.id === riderId && a.intendedDriverId === driverId);
      if (!driver || !rider || driver.revision !== input.driverRevision || rider.revision !== input.availabilityRevision) throw stale();
      if (!['accept','decline','cancel'].includes(input.decision)) throw new StoreError('Choose accept, decline, or cancel.');
      requirePersonConfirmation(input.decision === 'cancel' ? rider : driver, input, 'this ride decision');
      if (input.decision === 'accept') {
        if (!compatibleSessions(state,driver).length) throw new StoreError('No listed sessions work for everyone. Review the plans first.',409);
        rider.rideApproval = 'accepted'; rider.revision += 1; driver.revision += 1;
      } else detachIntent(state, rider, context);
      logAvailability(state, rider, `ride_request_${input.decision}`, context);
      return { ok: true };
    });
  }
  decideSessionRide(tripId, driverId, riderId, input, context = {}) {
    return this.#mutate(state => {
      state = memberRoster(state, tripId);
      const trip = tripContext(state, tripId, input);
      const driver = trip.drivers.find(d=>d.id===driverId);
      const rider = driver?.riders.find(r=>r.id===riderId);
      if (!driver || !rider || rider.name !== input.riderName || (rider.rideApproval || 'accepted') !== input.expectedApproval || (rider.rideRequestId || null) !== input.expectedRequestId) throw stale();
      requirePersonConfirmation(driver,input,'this ride decision');
      if (!['accept','decline'].includes(input.decision)) throw new StoreError('Choose accept or decline.');
      if (input.decision === 'accept') { rider.rideApproval = 'accepted'; rider.rideRequestId = randomUUID(); }
      else { driver.riders = driver.riders.filter(r=>r.id!==rider.id); delete rider.rideApproval; trip.waitlist.push(rider); }
      appendChange(trip, `ride_request_${input.decision}`, rider.name, `${driver.name}'s car: ${rider.name} ${input.decision === 'accept' ? 'ride accepted' : 'moved to waiting for a ride'}.`, actor(context));
      return { ok: true };
    });
  }
  addPlan(input, context = {}) {
    return this.#mutate((state) => {
      state = memberRoster(state, input.tripId);
      const week = weekContext(state, input);
      const flexible = input.availabilityId ? state.availability.find(a => a.id === input.availabilityId) : null;
      if (input.availabilityId) {
        if (!flexible || flexible.revision !== input.availabilityRevision || !input.tripId) throw stale();
        requirePersonConfirmation(flexible, input, 'confirming this session');
        if (flexible.intendedDriverId) throw new StoreError('The driver chooses the final session for this car. Cancel the request first to choose independently.',409);
        input = { ...input, name: flexible.name, transport: flexible.transport, seats: flexible.seats, lookingForCompany: flexible.lookingForCompany };
      }
      const date = sessionDate(week, input.date);
      const sessionTime = cleanTime(input.sessionTime, 'Session time');
      if (flexible && !inRange(flexible, { id:input.tripId, revision:input.sessionRevision, date, sessionTime })) throw new StoreError('Choose a listed session within this availability range.');
      const original = input.tripId ? tripContext(state, input.tripId, input) : null;
      const language = input.language === undefined && original ? original.language : cleanLanguage(input.language);
      let trip = input.tripId ? tripContext(state, input.tripId, input)
        : state.trips.find((item) => item.date === date && item.sessionTime === sessionTime);
      if (trip && (trip.date !== date || trip.sessionTime !== sessionTime || languageKey(trip.language) !== languageKey(language))) throw stale();
      if (!trip) {
        trip = {
          id: randomUUID(), revision: 1, temple: week.temple, date, sessionTime, language, notes: '',
          createdAt: new Date().toISOString(), drivers: [], waitlist: [], attendees: [], changeLog: []
        };
        state.trips.push(trip);
        appendChange(trip, 'trip_created', week.temple, `Endowment session created for ${date} at ${sessionTime} (${language || 'language not set'}).`, actor(context));
      }
      const linked = flexible?.transport === 'offer' ? requestsFor(state, flexible.id) : [];
      if (linked.some(r=>r.rideApproval !== 'accepted')) throw new StoreError('Accept or decline each pending rider before choosing the session.',409);
      if (linked.length && !compatibleSessions(state,flexible).some(t=>t.id===trip.id)) throw new StoreError('Choose a session that works for everyone in this car.',409);
      const name = cleanText(input.name, 'Name', 80);
      const matchState = { ...state, availability: state.availability.filter(a=>!linked.some(r=>r.id===a.id)) };
      checkNames(matchState, [trip], name, input, flexible?.id);
      for (const rider of linked) checkNames(matchState, [trip], rider.name, input, flexible.id);
      const destination = placement(trip, input);
      const person = { id: flexible?.id || randomUUID(), name, lookingForCompany: companyValue(input.lookingForCompany), createdAt: flexible?.createdAt || new Date().toISOString() };
      place(trip, person, destination);
      for (const rider of linked) {
        const passenger = { id:rider.id, name:rider.name, lookingForCompany:rider.lookingForCompany, createdAt:rider.createdAt };
        place(trip,passenger,{transport:'car',driver:person,approval:'accepted'});
        logAvailability(state,rider,'availability_resolved',context);
        appendChange(trip,'person_added',passenger.name,describe(findPerson(trip,passenger.id)),actor(context));
      }
      if (flexible) {
        logAvailability(state, flexible, 'availability_resolved', context);
        state.availability = state.availability.filter(a => a.id !== flexible.id && !linked.some(r=>r.id===a.id));
      }
      appendChange(trip, 'person_added', name, describe(findPerson(trip, person.id)), actor(context));
      return { tripId: trip.id, person, placement: destination.transport, driverName: destination.driver?.name ?? null };
    });
  }
  updateTrip(tripId, input) {
    return this.#mutate((state) => {
      const trip = tripContext(state, tripId, input);
      const date = sessionDate(state.week, input.date);
      const sessionTime = cleanTime(input.sessionTime, 'Session time');
      const language = input.language === undefined ? trip.language : cleanLanguage(input.language);
      const notes = cleanText(input.notes, 'Note', 240, false);
      if (state.trips.some((item) => item.id !== tripId && item.date === date && item.sessionTime === sessionTime)) {
        throw new StoreError('A session already exists at that time. Choose another time; rosters cannot be merged.', 409);
      }
      const before = `${trip.date} at ${trip.sessionTime} (${trip.language || 'language not set'})${trip.notes ? ` — ${trip.notes}` : ''}`;
      if (date !== trip.date || sessionTime !== trip.sessionTime || languageKey(language) !== languageKey(trip.language)) {
        for (const driver of trip.drivers) for (const rider of driver.riders) {
          rider.rideApproval = 'pending'; rider.rideRequestId = randomUUID();
        }
      }
      Object.assign(trip, { date, sessionTime, language, notes, revision: trip.revision + 1 });
      state.week.revision += 1;
      appendChange(trip, 'trip_updated', trip.temple, `Session changed from ${before} to ${date} at ${sessionTime} (${language || 'language not set'})${notes ? ` — ${notes}` : ''}.`, 'administrator');
      return { ok: true };
    });
  }
  async addDriver(tripId, input, context) {
    const trip = tripContext(await this.read(), tripId, input);
    return this.addPlan({ ...input, tripId, date: trip.date, sessionTime: trip.sessionTime, transport: 'offer' }, context);
  }
  async addRider(tripId, input, context) {
    const trip = tripContext(await this.read(), tripId, input);
    return this.addPlan({ ...input, tripId, date: trip.date, sessionTime: trip.sessionTime, transport: input.driverId || input.assignmentMode ? 'car' : 'need' }, context);
  }
  deleteTrip(tripId, input) {
    return this.#mutate((state) => {
      tripContext(state, tripId, input);
      if (state.week.publishedSessionId === tripId) throw new StoreError('Show Temple Week or select another session before deleting the session members are using.',409);
      state.trips = state.trips.filter((trip) => trip.id !== tripId);
      state.week.revision += 1;
      return { ok: true };
    });
  }
  updatePerson(tripId, personId, input, context = {}) {
    return this.#mutate((state) => {
      state = memberRoster(state, tripId);
      const trip = tripContext(state, tripId, input);
      const found = findPerson(trip, personId);
      requirePersonConfirmation(found.person, input, 'this change');
      const name = cleanText(input.name ?? found.person.name, 'Name', 80);
      if (name !== found.person.name) checkNames(state, [trip], name, { ...input, excludePersonId: personId });
      const destination = placement(trip, input, found);
      const lookingForCompany = companyValue(input.lookingForCompany, found.person.lookingForCompany);
      const before = describe(found);
      let movedToWaitlist = 0;
      if (found.transport === 'offer') {
        if (destination.transport === 'offer') destination.riders = found.person.riders;
        else {
          movedToWaitlist = found.person.riders.length;
          trip.waitlist.push(...found.person.riders);
        }
      }
      if (destination.transport === 'car' && found.transport === 'car' && destination.driver.id === found.driver.id) { destination.approval = found.person.rideApproval || 'accepted'; destination.requestId = found.person.rideRequestId; }
      found.list.splice(found.list.indexOf(found.person), 1);
      Object.assign(found.person, { name, lookingForCompany });
      place(trip, found.person, destination);
      appendChange(trip, 'person_updated', name, `${before} → ${describe(findPerson(trip, personId))}.${movedToWaitlist ? ` ${movedToWaitlist} riders moved to the rider list.` : ''}`, actor(context));
      return { person: found.person, placement: destination.transport, driverName: destination.driver?.name ?? null, movedToWaitlist };
    });
  }
  removePerson(tripId, personId, input, context = {}) {
    return this.#mutate((state) => {
      state = memberRoster(state, tripId);
      const trip = tripContext(state, tripId, input);
      const found = findPerson(trip, personId);
      requirePersonConfirmation(found.person, input, 'removal');
      const movedToWaitlist = found.transport === 'offer' ? found.person.riders.length : 0;
      if (movedToWaitlist) trip.waitlist.push(...found.person.riders);
      found.list.splice(found.list.indexOf(found.person), 1);
      appendChange(trip, 'person_removed', found.person.name, `${describe(found)} removed.${movedToWaitlist ? ` ${movedToWaitlist} riders moved to the rider list.` : ''}`, actor(context));
      return { ok: true, movedToWaitlist };
    });
  }
  async readChangeLog(tripId) {
    const trip = (await this.read()).trips.find((item) => item.id === tripId);
    if (!trip) throw stale();
    return [...trip.changeLog].reverse();
  }
}
