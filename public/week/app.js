const $ = (selector, root = document) => root.querySelector(selector);
const view = $('#view');
const dialog = $('#form-dialog');
const review = $('#review-dialog');
const help = $('#help-dialog');
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' })[char]);
const dateLabel = (date) => new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'short', day: 'numeric' }).format(new Date(`${date}T12:00:00`));
const timeLabel = (time) => new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(`2000-01-01T${time}:00`));
const languageLabel = (trip) => trip.language || 'Language not set';
const sessionLabel = (trip) => `${dateLabel(trip.date)} · ${timeLabel(trip.sessionTime)} · ${languageLabel(trip)}`;
const openSeats = (driver) => driver.seats - driver.riders.length;
const approvalLabel = person => person.rideApproval === 'pending' ? '<span class="ride-pending">Awaiting driver acceptance</span>' : person.rideApproval === 'accepted' ? '<span class="company">Ride accepted</span>' : '';
const company = (person) => person.lookingForCompany ? '<span class="company">Looking for company</span>' : '';
const initials = (name) => name.trim().split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toLocaleUpperCase();
const privacy = '<p class="privacy-note">Everyone with access can see names, transportation, and company requests. Members of this trusted group can edit or remove entries without identity verification.</p>';
let state = { version: 4, week: null, trips: [] };
let pin = sessionStorage.getItem('templeWeekAdminPin') || '';
let groupView = sessionStorage.getItem('templeWeekGroupView') || 'seats';
let config = {};
let refreshPromise;
let refreshPath;
const previewId = new URLSearchParams(location.search).get('preview');
const previewPath = previewId ? '/api/admin/events/' + encodeURIComponent(previewId) + '/preview' : null;
const statePath = () => previewPath || (location.hash === '#admin' && pin ? '/api/admin/week-state' : '/api/state');
let lastFocus;
let busy = false;
let dirtyAdmin = false;
let expandedDay = null;
let rosterOpen = false;
let entryRole = null;
let planningDays = new Set();
let expandedWeekId;
const context = (trip) => ({ weekId: state.week?.id, weekRevision: state.week?.revision, ...(trip ? { tripId: trip.id, sessionRevision: trip.revision } : {}) });
const trips = () => [...state.trips].sort((a, b) => a.date.localeCompare(b.date) || a.sessionTime.localeCompare(b.sessionTime));
const people = (trip) => [
  ...trip.drivers.map((person) => ({ person, transport: 'offer', driver: person })),
  ...trip.drivers.flatMap((driver) => driver.riders.map((person) => ({ person, transport: 'car', driver }))),
  ...trip.waitlist.map((person) => ({ person, transport: 'need' })),
  ...trip.attendees.map((person) => ({ person, transport: 'own' }))
];
const selectedTrip = () => {
  const id = state.week?.publishedSessionId || location.hash.slice('#session/'.length);
  return state.trips.find(trip => trip.id === id);
};
const interacting = () => dialog.open || review.open || help.open || busy || dirtyAdmin || planningDays.size > 0;
const normalized = (name) => name.trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');

function announce(message) {
  $('#status').textContent = message;
  $('#status').dataset.route = location.hash;
  $('#status').hidden = false;
}
async function api(path, options = {}) {
  if (previewId && options.method && options.method !== 'GET') throw new Error('This is a preview. Open the active event to save a signup.');
  const response = await fetch(path, {
    ...options, cache: 'no-store', headers: { 'Content-Type': 'application/json', ...(pin ? { 'X-Admin-Pin': pin } : {}) },
    ...(options.body ? { body: JSON.stringify(options.body) } : {})
  });
  const payload = await response.json();
  if (!response.ok) throw Object.assign(new Error(payload.error || 'Something went wrong. Please try again.'), payload, { status: response.status });
  return payload;
}
async function refresh(force = false) {
  const path = statePath();
  if (!refreshPromise || refreshPath !== path) {
    refreshPath = path;
    const request = api(path).finally(() => { if (refreshPromise === request) refreshPromise = null; });
    refreshPromise = request;
  }
  let result;
  try { result = await refreshPromise; }
  catch (error) {
    if (path !== statePath()) return;
    if (error.status !== 401 || path !== '/api/admin/week-state') throw error;
    pin = '';
    sessionStorage.removeItem('templeWeekAdminPin');
    return refresh(true);
  }
  if (path !== statePath()) return;
  if (result.version !== 4) throw new Error('Open Temple Week with the local experiment launcher.');
  if (!force && interacting()) return;
  if (state.week && state.week.id !== result.week?.id && location.hash.startsWith('#session/')) {
    history.replaceState(null, '', '#week');
  }
  state = result;
  render();
}
function focusHeading() {
  const heading = $('h1', view);
  heading?.setAttribute('tabindex', '-1');
  heading?.focus({ preventScroll: true });
}
function navigate(hash) {
  if (location.hash === hash) { render(); focusHeading(); }
  else location.hash = hash;
}
function personButton(found) {
  return `<button class="person-name" data-person="${found.person.id}">${esc(found.person.name)}${company(found.person)}${approvalLabel(found.person)}</button>`;
}
function render() {
  const active = document.activeElement;
  const matchForm = active?.closest('#view form[data-match-id]');
  const matchRegion = matchForm?.closest('.day-times');
  const attribute = active && view.contains(active) ? ['id', 'data-person', 'data-join', 'data-move', 'data-view', 'data-add', 'data-need', 'data-own', 'data-car', 'data-flex', 'data-availability', 'href'].find((name) => active.hasAttribute(name)) : null;
  const selector = attribute ? `[${attribute}="${CSS.escape(active.getAttribute(attribute))}"]` : null;
  try {
    renderView();
    const trip = selectedTrip();
    const members = trip ? [...trip.drivers, ...trip.waitlist] : state.availability || [];
    for (const form of view.querySelectorAll('form[data-match-id]')) {
      const person = members.find(member => member.id === form.dataset.matchId);
      bindQuickMatch(person, trip, form);
    }
  }
  finally {
    if (matchForm) {
      const region = matchRegion ? document.getElementById(matchRegion.id) : view;
      region?.querySelector(`form[data-match-id="${CSS.escape(matchForm.dataset.matchId)}"] button`)?.focus({ preventScroll: true });
    } else if (selector) $(selector, view)?.focus({ preventScroll: true });
  }
}
function renderView() {
  if (expandedWeekId !== state.week?.id) {
    expandedWeekId = state.week?.id;
    expandedDay = null;
    planningDays.clear(); rosterOpen = false; entryRole = null;
  }
  if (!previewId && location.hash === '#admin') return renderAdmin();
  if (state.week?.publishedSessionId) {
    if (location.hash.startsWith('#session/')) history.replaceState(null, '', '#week');
    planningDays.clear();
    return renderSession(selectedTrip());
  }
  if (location.hash.startsWith('#session/')) {
    const trip = selectedTrip();
    if (trip) return renderSession(trip);
    view.innerHTML = '<section class="week-empty"><a class="back-button" href="#week">← Back to temple week</a><h1>This session is no longer available</h1><p>Review the week to choose another time.</p></section>';
    return;
  }
  renderWeek();
}
function availableRides() {
  const sessions = trips();
  const byDay = new Map();
  const flexibleTimes = new Set(state.availability
    .filter(driver => driver.transport === 'offer' && driver.seats > flexibleRiders(driver).length)
    .flatMap(driver => carTimes(driver).map(trip => trip.id)));
  for (const trip of sessions) {
    const seats = trip.drivers.reduce((total, driver) => total + openSeats(driver), 0);
    if (!seats && !flexibleTimes.has(trip.id)) continue;
    if (!byDay.has(trip.date)) byDay.set(trip.date, []);
    byDay.get(trip.date).push({trip, seats});
  }
  const dayGroups = [...byDay].map(([date, options]) => {
    const cards = options.map(({trip,seats}) => `<article class="ride-option session-offer">
      <strong>${esc(timeLabel(trip.sessionTime))} · ${esc(languageLabel(trip))}</strong>
      <span>${seats ? `${seats} open ${seats === 1 ? 'seat' : 'seats'}` : 'Flexible car available'}</span>
      <div class="session-offer-actions"><button class="secondary-button" type="button" id="join-time-${trip.id}" data-join-time="${trip.id}" aria-label="Join Any Car at ${esc(sessionLabel(trip))}">Join Any Car</button>
      ${seats ? `<a class="ride-action" href="#session/${trip.id}">See cars →</a>` : ''}</div></article>`);
    return `<section><div class="ride-finder-heading"><h3>${esc(dateLabel(date))}</h3>
      ${options.length > 1 ? `<button class="text-button" type="button" data-join-day="${date}" id="join-day-${date}">Any time this day</button>` : ''}</div>
      <div class="ride-options">${cards.join('')}</div></section>`;
  });
  const flexible = state.availability.filter(entry => entry.transport === 'offer').flatMap(driver => {
    const seats = driver.seats - flexibleRiders(driver).length;
    const times = carTimes(driver);
    if (!times.length || seats <= 0) return [];
    return [`<button class="ride-option" type="button" id="available-car-${driver.id}" data-flex-join="${driver.id}">
      <strong>${esc(driver.name)}’s car · ${seats} open ${seats === 1 ? 'seat' : 'seats'}</strong>
      <span>${esc(selectionSummary(times))}</span><span class="ride-action">Choose possible times <span aria-hidden="true">→</span></span></button>`];
  });
  return `<section class="ride-finder" aria-labelledby="find-ride-heading">
    <div class="ride-finder-heading"><h2 id="find-ride-heading">Find a ride</h2>
      <button type="button" class="text-button" id="go-to-plans">Request another time</button></div>
    ${dayGroups.join('')}
    ${flexible.length ? `<h3>Flexible cars · time to be decided</h3><div class="ride-options">${flexible.join('')}</div>` : ''}
    ${!dayGroups.length ? '<p>No open seats right now. Choose your days below to request a ride or offer one.</p>' : ''}
  </section>`;
}
function renderWeek() {
  const week = state.week;
  if (!week) {
    view.innerHTML = '<section class="week-empty"><h1>Temple events</h1><p class="lead">There is no active temple event. The organizer will open signups here.</p><a href="#admin" class="text-button">Organizer access</a></section>';
    return;
  }
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(`${week.startDate}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + index);
    return date.toISOString().slice(0, 10);
  });
  if (!days.includes(expandedDay)) expandedDay = null;
  view.innerHTML = `<section class="week-header week-hero"><div class="week-hero-copy"><h1>Temple week</h1><p class="temple-name">${esc(week.temple)}</p><p class="week-dates">${esc(dateLabel(week.startDate))} – ${esc(dateLabel(week.endDate))}</p></div></section>
    ${week.notes ? `<p class="week-note">${esc(week.notes)}</p>` : ''}
    <section class="role-start"><h2 id="entry-question">How can we help you attend?</h2><div class="week-actions" role="group" aria-labelledby="entry-question">
      ${Object.entries({need:'I need a ride',offer:'I’m driving',deciding:'I’m still deciding'}).map(([role,label]) => `<button type="button" id="role-${role}" class="secondary-button" data-role="${role}" aria-pressed="${role === entryRole}">${label}</button>`).join('')}
      <button type="button" class="secondary-button" id="ask-support" aria-haspopup="dialog" aria-describedby="help-examples">I need help to attend</button></div>
      <p class="form-help" id="help-examples">Help includes babysitting, company, and family history support.</p></section>
    <div ${entryRole && entryRole !== 'deciding' ? '' : 'hidden'}>
    ${entryRole !== 'offer' ? availableRides() : ''}
    <details class="browse-roster" id="roster-browser" ${rosterOpen ? 'open' : ''}><summary id="all-plans-summary">See all sessions and existing plans</summary><p class="form-help">Choose a day to view cars, requests, and session rosters.</p>
    <div>${days.map((date) => {
      const sessions = trips().filter((trip) => trip.date === date);
      const expanded = expandedDay === date;
      return `<section class="day-section"><h2><button class="day-toggle" id="day-toggle-${date}" type="button" data-day="${date}" aria-expanded="${expanded}" aria-controls="day-times-${date}"><span>${esc(dateLabel(date))}<small>${sessions.length ? `${sessions.length} ${sessions.length === 1 ? 'session' : 'sessions'}` : 'No sessions listed'}</small></span><svg class="day-chevron" aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="m6 9 6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg></button></h2><div class="day-times" id="day-times-${date}" role="region" aria-labelledby="day-toggle-${date}" ${expanded ? '' : 'hidden'}>${availabilityList(date)}${sessions.length ? sessions.map((trip) => {
        const seats = trip.drivers.reduce((count, driver) => count + openSeats(driver), 0);
        const companions = people(trip).filter(({ person }) => person.lookingForCompany).length;
        return `<a class="session-link" href="#session/${trip.id}"><span><strong>${esc(timeLabel(trip.sessionTime))}</strong><span class="session-language">Endowment · ${esc(languageLabel(trip))}</span><small>${seats} open ${seats === 1 ? 'seat' : 'seats'} · ${trip.waitlist.length} need a ride · ${companions} looking for company</small></span><span class="session-arrow" aria-hidden="true">→</span></a>`;
      }).join('') : '<p class="day-empty">No endowment sessions listed for this day.</p>'}</div></section>`;
    }).join('')}</div></details>
<section class="signup-start" aria-labelledby="choose-days-heading"><h2 id="choose-days-heading" tabindex="-1">${entryRole === 'offer' ? 'Which days can you drive?' : 'Which days work for you?'}</h2><p>Offer a ride or find one. Choose one day or several, then pick the sessions you can attend.</p>
    <form id="day-selection"><fieldset class="day-choices"><legend class="sr-only">Choose days</legend>${days.map(date=>{ const count=trips().filter(t=>t.date===date).length; return `<label class="day-choice"><input type="checkbox" id="plan-day-${date}" name="days" value="${date}" ${planningDays.has(date) ? 'checked' : ''} ${count ? '' : 'disabled'} /><span>${esc(dateLabel(date))}<small>${count ? `${count} ${count===1 ? 'session' : 'sessions'}` : 'No sessions listed'}</small></span></label>`; }).join('')}</fieldset>
    <div class="day-next"><button class="primary-button" type="submit" ${planningDays.size ? '' : 'disabled'}>Choose sessions</button><p class="form-help" id="day-selection-count" aria-live="polite">${planningDays.size ? `${planningDays.size} ${planningDays.size===1 ? 'day' : 'days'} selected` : 'Select a day to continue'}</p></div></form></section></div>`;
  $('#ask-support').onclick = () => openSupportForm(days);
  view.querySelectorAll('[data-role]').forEach(button => button.onclick = () => {
    entryRole = button.dataset.role;
    render();
    if (entryRole === 'deciding') {
      $('#role-deciding').focus({preventScroll:true});
      openSessionPicker({deciding:true});
      return;
    }
    const heading = entryRole === 'offer' ? $('#choose-days-heading') : $('#find-ride-heading');
    heading.tabIndex = -1;
    heading.focus();
  });
  view.querySelectorAll('[data-join-time]').forEach(button => button.onclick = () => {
    const trip = state.trips.find(item => item.id === button.dataset.joinTime);
    openAvailabilityDetails({sessions:[trip],transport:'need',frozen:context(),exactJoin:true});
  });
  view.querySelectorAll('[data-join-day]').forEach(button => button.onclick = () => {
    const date = button.dataset.joinDay;
    const flexible = state.availability.filter(driver => driver.transport === 'offer' && driver.seats > flexibleRiders(driver).length);
    const choices = trips().filter(trip => trip.date === date && (trip.drivers.some(driver => openSeats(driver) > 0)
      || flexible.some(driver => carTimes(driver).some(option => option.id === trip.id))));
    openAvailabilityDetails({sessions:choices,transport:'need',frozen:context(),dayJoin:true,
      back:() => openSessionPicker({days:[date],transport:'need',selected:choices.map(trip => trip.id),dayJoin:true})});
  });
  if ($('#go-to-plans')) $('#go-to-plans').onclick = () => {
    const heading = $('#choose-days-heading');
    heading.focus({preventScroll:true});
    heading.scrollIntoView({block:'start'});
  };
  const dayForm = $('#day-selection');
  dayForm.oninput = () => {
    planningDays = new Set(new FormData(dayForm).getAll('days'));
    $('button[type="submit"]',dayForm).disabled = !planningDays.size;
    $('#day-selection-count').textContent = planningDays.size ? `${planningDays.size} ${planningDays.size===1 ? 'day' : 'days'} selected` : 'Select a day to continue';
  };
  dayForm.onsubmit = event => { event.preventDefault(); if (planningDays.size) openSessionPicker({days:[...planningDays],transport:entryRole === 'deciding' ? null : entryRole}); };
  $('#roster-browser').ontoggle = event => { rosterOpen = event.target.open; };
}
function renderSession(trip) {
  const seats = trip.drivers.reduce((count, driver) => count + openSeats(driver), 0);
  view.innerHTML = `${state.week.publishedSessionId ? '' : '<a href="#week" class="back-button">← Back to temple week</a>'}<header class="session-heading"><p class="week-dates">${esc(dateLabel(trip.date))}</p><h1>${esc(timeLabel(trip.sessionTime))} endowment</h1><p class="session-language">${esc(languageLabel(trip))}</p><p>${esc(trip.temple)}</p>${trip.notes ? `<p class="session-note">${esc(trip.notes)}</p>` : ''}</header>
    <div class="week-actions"><button class="primary-button" data-add>Add my car</button><button class="secondary-button" data-need>I need a ride</button></div>
    <p class="form-help">Need a ride? We’ll hold an open seat, then the driver accepts your request. If none are open, you’ll join the waiting list.</p>
    <button class="text-button own-transport-action" data-own>I have my own transportation</button>
    ${state.week.publishedSessionId ? '<button class="text-button" id="session-support">I need help to attend</button>' : ''}
    <div class="group-view-tabs" role="group" aria-label="Roster view"><button data-view="seats" aria-pressed="${groupView === 'seats'}">Seats</button><button data-view="names" aria-pressed="${groupView === 'names'}">Names</button></div>
    <section class="roster-group"><h2>${groupView === 'seats' ? 'Choose an open seat' : 'Who’s going'}</h2>
    ${trip.drivers.length ? groupView === 'seats' ? `<div class="visual-car-list">${trip.drivers.map(renderVisualCar).join('')}</div>` : trip.drivers.map((driver) => `<section class="week-car" aria-label="${esc(driver.name)}’s car"><div class="car-title">${personButton({ person: driver })}<small>${openSeats(driver)} of ${driver.seats} open</small></div><ul class="person-list">${driver.riders.map((person) => `<li>${personButton({ person })}<small>${person.rideApproval === 'pending' ? 'Awaiting acceptance from' : 'Riding with'} ${esc(driver.name)}</small></li>`).join('')}</ul>${openSeats(driver) ? quickMatchButton(driver,trip) : ''}${openSeats(driver) ? `<button class="secondary-button" data-join="${driver.id}">Join this car</button>` : '<p class="form-help">This car is full.</p>'}</section>`).join('') : '<p class="lead">No cars offered yet. Use Add my car to offer seats.</p>'}</section>
    ${personSection('Waiting for a ride', trip.waitlist, seats, true)}${personSection('Have their own transportation', trip.attendees, seats, false)}`;
  $('#session-support')?.addEventListener('click', () => openSupportForm([trip.date]));
}
function renderVisualCar(driver) {
  const remaining = openSeats(driver);
  const passengers = Array.from({ length: driver.seats }, (_, index) => {
    const rider = driver.riders[index];
    return rider ? `<button class="car-seat taken occupied-seat-button ${rider.rideApproval === 'pending' ? 'pending-seat' : ''}" type="button" data-person="${rider.id}" data-tooltip="${esc(rider.name)}${rider.lookingForCompany ? ' · Looking for company' : ''}" aria-label="${esc(rider.name)}, ${rider.rideApproval === 'pending' ? 'awaiting driver acceptance' : 'passenger'}${rider.lookingForCompany ? ', looking for company' : ''}. Manage signup."><span class="seat-initials">${esc(initials(rider.name))}</span></button>`
      : `<button class="car-seat open-seat-button" type="button" data-join="${driver.id}" aria-label="Open seat with ${esc(driver.name)}. Tap to join."><span class="car-seat-plus" aria-hidden="true">＋</span></button>`;
  }).join('');
  return `<article class="visual-car-card" aria-label="${esc(driver.name)}’s car"><button class="car-card-heading" type="button" data-car="${driver.id}" aria-label="View everyone in ${esc(driver.name)}’s car"><span class="driver-identity"><span class="driver-avatar" aria-hidden="true">${esc(initials(driver.name))}</span><span><strong>${esc(driver.name)}</strong>${company(driver)}</span></span><span class="open-seat-count">${remaining ? `${remaining} open` : 'Full'}</span><span class="car-heading-arrow" aria-hidden="true">›</span></button>
    <div class="car-shell"><div class="car-wheel front left"></div><div class="car-wheel front right"></div><div class="car-wheel rear left"></div><div class="car-wheel rear right"></div><div class="car-hood"><span class="headlight left"></span><span class="car-badge">◇</span><span class="headlight right"></span></div><div class="car-windshield"></div><div class="car-seat-grid"><button class="car-seat driver" type="button" data-person="${driver.id}" aria-label="${esc(driver.name)}, driver. Manage signup."><span class="seat-symbol" aria-hidden="true">◉</span><span class="seat-initials">${esc(initials(driver.name))}</span></button>${passengers}</div><div class="car-rear-window"></div><div class="car-trunk"><span class="tail-light left"></span><span class="tail-light right"></span></div></div>
    ${remaining ? quickMatchButton(driver, selectedTrip()) : ''}${driver.riders.some(r=>r.rideApproval === 'pending') ? '<p class="car-company-note">Striped seats: awaiting driver acceptance. Open the car to review riders.</p>' : ''}${driver.riders.some((rider) => rider.lookingForCompany) ? `<p class="car-company-note">Looking for company: ${driver.riders.filter((rider) => rider.lookingForCompany).map((rider) => esc(rider.name)).join(', ')}</p>` : ''}</article>`;
}
function quickMatchButton(person, trip=null) {
  const driver=trip ? trip.drivers.includes(person) : person.transport==='offer';
  return `<form data-match-id="${person.id}" class="week-form card-match">${errorMarkup()}<p class="form-help">${driver ? 'Driver: add and accept waiting riders who share your times, up to your open seats.' : 'Hold a place in any car that shares your selected times. The driver still needs to accept.'}</p><button class="primary-button" type="submit" aria-label="${driver ? 'Add available riders to' : 'Join any matching car for'} ${esc(person.name)}${driver ? '’s car' : ''}">${driver ? 'Add available riders' : 'Join any matching car'}</button></form>`;
}
function bindQuickMatch(person, trip=null, form=dialog.querySelector('form[data-match-id]')) {
  if (!form || !person) return;
  const driver=trip ? trip.drivers.includes(person) : person.transport==='offer';
  const frozen={...context(trip),...(trip ? {tripId:trip.id,personSnapshot:JSON.stringify(person)} : {availabilityRevision:person.revision}),action:driver?'fill':'join'};
  form.onsubmit=event=>{event.preventDefault();submit(form,async()=>{
    const result=await saveWithReview(`/api/week/match/${person.id}`,frozen,'POST',false);
    if (!result) return;
    const message = driver ? result.added.length ? `${result.added.join(', ')}: rides accepted with ${person.name}.` : 'No compatible waiting riders could be added. Your car is unchanged.' : result.matched ? `Place held with ${result.driverName}. Awaiting driver acceptance.` : 'No matching open seat yet. Your ride request is still listed.';
    if (dialog.contains(form)) return saved(message, result.tripId);
    if (refreshPromise) await refreshPromise.catch(() => undefined);
    await refresh(true);
    if (result.tripId && selectedTrip()?.id !== result.tripId) navigate(`#session/${result.tripId}`);
    announce(message);
    const status = $('#status');
    status.tabIndex = -1;
    status.focus();
  });};
}
function openCar(driverId) {
  const trip = selectedTrip();
  const driver = trip.drivers.find((item) => item.id === driverId);
  showDialog(`${dialogHeader(`${esc(driver.name)}’s car`)}<p class="form-context">${esc(sessionLabel(trip))}</p>${quickMatchButton(driver,trip)}<ul class="person-list"><li>${personButton({ person: driver })}<small>Driver</small></li>${driver.riders.map((person) => `<li>${personButton({ person })}<button class="secondary-button" data-review-rider="${person.id}">${person.rideApproval === 'pending' ? 'Review request' : 'Manage ride'}</button></li>`).join('')}</ul><p class="form-help">Driver: open a rider request to accept or decline. This trusted group uses typed names, not identity verification.</p>`);
  bindQuickMatch(driver,trip);
  dialog.querySelectorAll('[data-review-rider]').forEach(button => { button.onclick = () => rideDecision(driver, driver.riders.find(r=>r.id===button.dataset.reviewRider), trip); });
  dialog.querySelectorAll('[data-person]').forEach((button) => { button.onclick = () => openManage(button.dataset.person); });
}
function personSection(title, entries, seats, waiting) {
  if (!entries.length) return '';
  return `<section class="roster-group"><h2>${title}</h2><ul class="person-list">${entries.map((person) => `<li class="${waiting ? 'waiting-entry' : ''}">${personButton({ person })}${waiting ? quickMatchButton(person,selectedTrip()) : ''}${waiting ? `<button class="secondary-button" data-move="${person.id}" ${seats ? '' : 'disabled'}>Add to a car</button>` : ''}</li>`).join('')}</ul></section>`;
}
function dialogHeader(title) {
  return `<div class="dialog-heading"><h2 id="form-heading">${title}</h2><button class="close-button" data-close type="button" aria-label="Close form">×</button></div>`;
}
function showDialog(html) {
  if (!dialog.open) lastFocus = document.activeElement;
  dialog.innerHTML = html;
  if (!dialog.open) dialog.showModal();
  requestAnimationFrame(() => ($('input[type="radio"]:checked', dialog) || $('input:not([type="hidden"]), select, button:not([data-close])', dialog))?.focus());
}
function errorMarkup() { return '<p class="form-error" role="alert" tabindex="-1" hidden></p>'; }
function confirmation(name) {
  return `<div class="confirm-section"><label for="confirmation-name">Type <strong>${esc(name)}</strong> to confirm</label><input id="confirmation-name" name="confirmationName" maxlength="80" autocomplete="off" data-confirm="${esc(name)}" required /></div>`;
}
function syncConfirmation(form) {
  if (form.dataset.stale) { $('[type="submit"]', form).disabled = true; return; }
  const input = $('[data-confirm]', form);
  if (input && !input.disabled) $('[type="submit"]', form).disabled = normalized(input.value) !== normalized(input.dataset.confirm);
}
async function submit(form, work) {
  if (busy) return;
  const button = $('[type="submit"]', form);
  const error = $('.form-error', form);
  busy = true;
  if (button) button.disabled = true;
  error.hidden = true;
  try { await work(); }
  catch (failure) {
    error.textContent = failure.message;
    error.hidden = false;
    if (failure.code === 'STALE_CONTEXT' && view.contains(form) && form.hasAttribute('data-match-id')) {
      await refresh(true);
      announce('These plans changed. Review the updated cards before trying again.');
      $('#status').tabIndex = -1;
      $('#status').focus();
      return;
    }
    if (failure.code === 'STALE_CONTEXT') {
      // Leave the original form/context intact. Closing it loads the new week.
      form.dataset.stale = 'true';
    }
    error.focus();
  } finally {
    busy = false;
    if (button && !form.dataset.stale) { button.disabled = false; syncConfirmation(form); }
  }
}
async function saved(message, tripId) {
  dialog.close();
  dirtyAdmin = false;
  planningDays.clear();
  // A completed write must not be followed by an older in-flight poll response.
  if (refreshPromise) await refreshPromise.catch(() => undefined);
  await refresh(true);
  if (tripId && !state.week?.publishedSessionId) navigate(`#session/${tripId}`);
  else focusHeading();
  announce(message);
}
function matchDescription(match) {
  return match.placement === 'flexible' ? 'flexible plan; session time not chosen' : match.placement === 'pending' ? `awaiting acceptance from ${match.driverName}` : match.placement === 'driver' ? 'offering a car' : match.placement === 'car' ? `riding with ${match.driverName}` : match.placement === 'own' ? 'has own transportation' : 'waiting for a ride';
}
function reviewNames(error, allowCars = true) {
  return new Promise((resolve) => {
    review.innerHTML = `<div class="dialog-heading"><h2 id="review-heading">Check this name</h2><button class="close-button" data-review-cancel aria-label="Cancel signup">×</button></div><p>These are possible matches for the session time(s) you selected. A shared last name does not establish a family relationship.</p>
      <ul>${error.matches.map((match) => `<li><strong>${esc(match.name)}</strong> — ${match.matchType === 'exact' ? 'possible duplicate' : 'possible family member'}; ${esc(matchDescription(match))}.</li>`).join('')}</ul>
      <div class="manage-actions">${allowCars ? error.eligibleCars.map((car) => `<button class="secondary-button" data-match-car="${car.id}">Join ${esc(car.name)}’s car (${car.openSeats} open)</button>`).join('') : ''}<button class="primary-button" data-review-continue>Continue as planned</button><button class="secondary-button" data-review-cancel>Cancel</button></div>`;
    let choice = null;
    review.onclick = (event) => {
      if (event.target.closest('[data-review-continue]')) choice = { confirmedMatchIds: error.matches.map((match) => match.id) };
      else if (event.target.closest('[data-match-car]')) choice = { confirmedMatchIds: error.matches.map((match) => match.id), transport: 'car', driverId: event.target.closest('[data-match-car]').dataset.matchCar, assignmentMode: '' };
      else if (!event.target.closest('[data-review-cancel]')) return;
      review.close();
    };
    review.addEventListener('close', () => resolve(choice), { once: true });
    review.showModal();
  });
}
async function saveWithReview(path, body, method = 'POST', allowCars = true) {
  let data = { ...body };
  for (;;) {
    try { return await api(path, { method, body: data }); }
    catch (error) {
      if (error.code !== 'NAME_MATCH_CONFIRMATION_REQUIRED') throw error;
      const choice = await reviewNames(error, allowCars);
      if (!choice) return null;
      data = { ...data, ...choice };
    }
  }
}
function dayOptions(selected) {
  const start = state.week.startDate;
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(`${start}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + index);
    const value = date.toISOString().slice(0, 10);
    return `<option value="${value}" ${value === selected ? 'selected' : ''}>${esc(dateLabel(value))}</option>`;
  }).join('');
}
const selectionSummary = sessions => sessions.length > 2 ? `${sessions.length} possible sessions · ${[...new Set(sessions.map(t=>dateLabel(t.date)))].join('; ')}` : sessions.map(t=>sessionLabel(t)).join('; ');
const rangeLabel = a => a.sessionIds ? selectionSummary(trips().filter(t=>fits(a,t))) || 'Selected sessions changed. Edit your availability.' : `${dateLabel(a.date)} · ${timeLabel(a.earliest)}–${timeLabel(a.latest)}`;
const flexibleRiders = driver => (state.availability || []).filter(a=>a.intendedDriverId===driver.id);
const fits = (entry,trip) => entry.sessionIds ? entry.sessionIds.includes(trip.id) && (!entry.sessionChoices || entry.sessionChoices.some(ref=>ref.id===trip.id && ref.revision===trip.revision)) : entry.date === trip.date && trip.sessionTime >= entry.earliest && trip.sessionTime <= entry.latest;
const carTimes = driver => trips().filter(t=>fits(driver,t) && flexibleRiders(driver).every(r=>fits(r,t)));
const timesText = sessions => sessions.length ? sessions.map(t=>sessionLabel(t)).join('; ') : 'No listed sessions work. Review these plans.';
const availabilityRole = a => a.intendedDriverId ? `${a.rideApproval === 'accepted' ? 'Ride accepted' : 'Awaiting acceptance'} · ${(state.availability || []).find(d=>d.id===a.intendedDriverId)?.name || 'Car unavailable'}` : a.transport === 'offer' ? `Offering ${a.seats} passenger places · time not chosen` : a.transport === 'need' ? 'Needs a ride' : 'Has own transportation';
function availabilityList(date) {
  const entries = (state.availability || []).filter(a => { const available = a.transport==='offer' ? carTimes(a) : trips().filter(t=>fits(a,t)); return available.some(t=>t.date===date) || (!available.length && a.date===date); });
  if (!entries.length) return '';
  const drivers = entries.filter(a=>a.transport==='offer');
  const others = entries.filter(a=>a.transport!=='offer' && !a.intendedDriverId);
  return `<section class="flexible-list"><h3>Flexible plans · time not chosen</h3><p class="form-help">Request a place in a car. Possible times narrow to those everyone can attend. Drivers accept riders, then choose one session.</p>
    <div class="visual-car-list">${drivers.map(driver => {
      const riders = flexibleRiders(driver);
      const car = renderVisualCar({...driver,riders}).replaceAll('data-join=', 'data-flex-join=').replaceAll('data-person=', 'data-availability=').replaceAll('data-car=', 'data-availability=');
      return `<section class="flexible-car">${car}<p class="form-help"><strong>Possible sessions:</strong> ${esc(timesText(carTimes(driver)))}</p><p>${riders.filter(r=>r.rideApproval==='pending').length} awaiting acceptance · ${riders.filter(r=>r.rideApproval==='accepted').length} accepted · time not chosen</p></section>`;
    }).join('')}</div><ul class="person-list">${others.map(a => `<li><button class="person-name" data-availability="${a.id}">${esc(a.name)}<span class="company">${esc(rangeLabel(a))}</span>${company(a)}</button><small>${esc(availabilityRole(a))}</small>${a.transport === 'need' ? quickMatchButton(a) : ''}</li>`).join('')}</ul></section>`;
}
function flexibleCarsFor(trip) {
  return state.availability.filter(driver => driver.transport === 'offer' &&
    driver.seats > flexibleRiders(driver).length && carTimes(driver).some(option => option.id === trip.id));
}

function sessionCarInfo(trip) {
  const count = trip.drivers.length;
  const seats = trip.drivers.reduce((total, driver) => total + openSeats(driver), 0);
  const fixed = count ? `${count} ${count === 1 ? 'car' : 'cars'} · ${seats} open ${seats === 1 ? 'seat' : 'seats'}` : 'No cars scheduled';
  const flexible = flexibleCarsFor(trip);
  return flexible.length ? `${fixed}. ${flexible.length} flexible ${flexible.length === 1 ? 'car could' : 'cars could'} go at this time.` : fixed;
}

function chooseDriveOrRide(sessions, frozen) {
  const back = () => openSessionPicker({deciding:true, selected:sessions.map(trip => trip.id)});
  showDialog(`${dialogHeader('Would you like to drive or ride?')}
    <p class="form-context">${esc(selectionSummary(sessions))}</p>
    <button type="button" class="text-button" id="change-times">Change selected times</button>
    <div class="selection-actions"><button type="button" class="primary-button" id="decide-drive">I can offer a ride</button>
    <button type="button" class="secondary-button" id="decide-ride">I need a ride</button>
    <button type="button" class="text-button" id="decide-own">I have my own transportation</button></div>`);
  $('#change-times').onclick = back;
  const choose = transport => {
    const [trip] = sessions;
    const canJoinFlexible = transport === 'need' && flexibleCarsFor(trip).length > 0;
    if (sessions.length === 1 && !canJoinFlexible) {
      openPlan({trip,transport});
    } else openAvailabilityDetails({sessions,frozen,transport,back});
  };
  $('#decide-drive').onclick = () => choose('offer');
  $('#decide-ride').onclick = () => choose('need');
  $('#decide-own').onclick = () => choose('own');
}

function openSessionPicker({days = null, entry = null, transport = null, intendedDriver = null, selected = [], dayJoin = false, deciding = false} = {}) {
  intendedDriver ||= entry?.intendedDriverId ? state.availability.find(a=>a.id===entry.intendedDriverId) : null;
  const frozen = {...context(), ...(entry ? {availabilityRevision:entry.revision} : {}), ...(intendedDriver ? {intendedDriverId:intendedDriver.id,driverRevision:intendedDriver.revision} : {})};
  const sessions = trips().filter(t=>(!days || days.includes(t.date)) && (!intendedDriver || (fits(intendedDriver,t) && flexibleRiders(intendedDriver).filter(r=>r.id!==entry?.id).every(r=>fits(r,t)))));
  const chosen = new Set(selected.length ? selected : entry ? sessions.filter(t=>fits(entry,t)).map(t=>t.id) : []);
  const dates = [...new Set(sessions.map(t=>t.date))];
  showDialog(`${dialogHeader('Which sessions work?')}<p>Choose every session you could attend. You’ll go to <strong>one</strong> of these sessions.</p>${intendedDriver ? `<p class="form-context">Request a seat with ${esc(intendedDriver.name)}. Only times that work for this car are shown.</p>` : ''}<form class="week-form" id="session-picker">${errorMarkup()}
    <div class="session-shortcuts" role="group" aria-label="Selection shortcuts">${sessions.some(t=>t.sessionTime>='12:00' && t.sessionTime<'17:00') ? '<button type="button" class="secondary-button" data-shortcut="afternoon">Select afternoons</button>' : ''}${sessions.some(t=>t.sessionTime>='17:00') ? '<button type="button" class="secondary-button" data-shortcut="evening">Select evenings</button>' : ''}<button type="button" class="text-button" data-shortcut="all">Select all</button><button type="button" class="text-button" data-shortcut="clear">Clear</button></div>
    ${dates.map(date=>`<fieldset class="session-choices"><legend>${esc(dateLabel(date))}</legend>${sessions.filter(t=>t.date===date).map(t=>`<label class="session-choice"><input type="checkbox" name="sessions" value="${t.id}" ${chosen.has(t.id) ? 'checked' : ''} /><span><strong>${esc(timeLabel(t.sessionTime))}</strong><small>${esc(languageLabel(t))}</small>${deciding ? `<small class="session-car-info">${esc(sessionCarInfo(t))}</small>` : ''}</span></label>`).join('')}</fieldset>`).join('') || '<p>No compatible sessions are listed. Close this form to review your plans.</p>'}
    <p class="selection-count" id="session-selection-count" aria-live="polite"></p>
    <div class="selection-actions">${deciding || transport || entry || intendedDriver ? '<button type="submit" class="primary-button">Continue</button>' : '<h3>How will you get there?</h3><button type="submit" name="role" value="offer" class="primary-button">I can offer a ride</button><button type="submit" name="role" value="need" class="secondary-button">I need a ride</button><button type="submit" name="role" value="own" class="text-button">I have my own transportation</button>'}<button type="button" class="text-button" data-close>${deciding ? 'Back to choices' : intendedDriver ? 'Back to rides' : 'Back to days'}</button></div></form>`);
  const form = $('#session-picker');
  const sync = () => { const count = form.querySelectorAll('input[name="sessions"]:checked').length; $('#session-selection-count').textContent = count ? `${count} ${count===1 ? 'session' : 'sessions'} selected` : 'Select at least one session'; form.querySelectorAll('[type="submit"]').forEach(b=>b.disabled=!count); };
  form.oninput=sync; sync();
  form.querySelectorAll('[data-shortcut]').forEach(b=>b.onclick=()=>{for(const checkbox of form.querySelectorAll('input[name="sessions"]')) {const t=sessions.find(t=>t.id===checkbox.value);if(b.dataset.shortcut==='clear')checkbox.checked=false;else if(b.dataset.shortcut==='all' || (b.dataset.shortcut==='afternoon' && t.sessionTime>='12:00' && t.sessionTime<'17:00') || (b.dataset.shortcut==='evening' && t.sessionTime>='17:00'))checkbox.checked=true;}sync();});
  form.onsubmit = event => {
    event.preventDefault();
    const selectedSessions = sessions.filter(t=>new FormData(form).getAll('sessions').includes(t.id));
    if (!selectedSessions.length) return;
    if (deciding) return chooseDriveOrRide(selectedSessions,frozen);
    const role = intendedDriver ? 'need' : transport || entry?.transport || event.submitter.value;
    if (!dayJoin && selectedSessions.length===1 && !entry && !intendedDriver) openPlan({trip:selectedSessions[0],transport:role});
    else openAvailabilityDetails({sessions:selectedSessions,dayJoin,entry,transport:role,intendedDriver,frozen,back:()=>openSessionPicker({days,dayJoin,entry,transport,intendedDriver,selected:selectedSessions.map(t=>t.id)})});
  };
}
function openAvailability(date, entry = null, transport = 'need', intendedDriver = null) {
  openSessionPicker({days:entry || intendedDriver ? null : [date],entry,transport,intendedDriver});
}
function openAvailabilityDetails({sessions,entry,transport,intendedDriver,frozen,back,dayJoin=false,exactJoin=false}) {
  showDialog(`${dialogHeader(exactJoin || dayJoin ? 'Join Any Car' : intendedDriver ? `Request a seat with ${esc(intendedDriver.name)}` : entry ? 'Update your plans' : transport==='offer' ? 'Offer a ride' : transport==='need' ? 'Request a ride' : 'Your attendance')}<p class="form-context">${esc(selectionSummary(sessions))}</p>${sessions.length>2 ? `<details class="selection-review"><summary>Review selected times</summary><ul>${sessions.map(t=>`<li>${esc(sessionLabel(t))}</li>`).join('')}</ul></details>` : ''}<p>${exactJoin ? 'Request a seat for this session. The driver will need to accept. If no seat is open, your request stays listed for this time.' : dayJoin ? 'Any one of these times may be matched. Your driver will need to accept. If no seat is open, your request stays listed.' : `One session from these choices. ${intendedDriver ? 'A place will be held while the driver reviews your request.' : 'The final session time is not chosen yet.'}`}</p>${back ? '<button class="text-button" type="button" id="change-session-selection">Change selected sessions</button>' : ''}${entry?.transport==='offer' && flexibleRiders(entry).length ? '<p class="danger-explanation">If you stop offering this car, riders keep their availability and need another ride.</p>' : ''}<form class="week-form" id="availability-form">${errorMarkup()}
    <label for="flex-name">Your full name</label><input id="flex-name" name="name" autocomplete="name" maxlength="80" value="${esc(entry?.name || '')}" required />
    ${entry && !intendedDriver ? '<label for="flex-transport">How will you get there?</label><select name="transport" id="flex-transport"><option value="offer">I can offer a ride</option><option value="need">I need a ride</option><option value="own">I have my own transportation</option></select>' : `<input name="transport" type="hidden" value="${esc(transport)}" />`}
    <div id="flex-seats-field" ${transport==='offer' ? '' : 'hidden'}><label for="flex-seats">Passenger seats you can offer</label><select id="flex-seats" name="seats">${Array.from({length:8},(_,i)=>`<option value="${i+1}">${i+1}</option>`).join('')}</select></div>
    <label class="check-label"><input type="checkbox" name="lookingForCompany" ${entry?.lookingForCompany ? 'checked' : ''} />I’d like someone to attend with</label>
    ${entry ? confirmation(entry.name) : ''}${privacy}<button class="primary-button" type="submit">${intendedDriver ? 'Send seat request' : entry ? 'Save changes' : transport==='offer' ? 'Offer my ride' : transport==='need' ? 'Join any matching car' : 'Save my plans'}</button><button class="secondary-button" type="button" data-close>Cancel</button></form>`);
  if (back) $('#change-session-selection').onclick=back;
  const form=$('#availability-form');form.elements.transport.value=transport;form.elements.seats.value=entry?.seats || 3;
  const sync=()=>{ $('#flex-seats-field').hidden=form.elements.transport.value!=='offer';syncConfirmation(form);};form.oninput=sync;sync();
  form.onsubmit=event=>{event.preventDefault();submit(form,async()=>{
    const data=Object.fromEntries(new FormData(form));
    const result=await saveWithReview(`/api/week/availability${entry ? `/${entry.id}` : ''}`,{...data,...frozen,joinAny:!entry && !intendedDriver && transport==='need',sessionIds:sessions.map(t=>t.id),sessions:sessions.map(t=>({id:t.id,revision:t.revision})),seats:Number(data.seats),lookingForCompany:form.elements.lookingForCompany.checked},entry?'PATCH':'POST',false);
    const matchedSession = sessions.find(trip => trip.id === result?.match?.tripId);
    if(result){navigate('#week');await saved(result.match ? result.match.matched ? `Place held with ${result.match.driverName}. ${matchedSession ? sessionLabel(matchedSession) : selectionSummary(sessions)}. Awaiting driver acceptance.` : 'No matching open seat yet. Your availability is saved; you are still waiting for a ride.' : `${intendedDriver ? 'Seat request saved' : 'Plans saved'}: ${rangeLabel(result)}. ${intendedDriver ? 'Awaiting driver acceptance.' : 'One session; final time not chosen.'}`,result.match?.tripId);}
  });};
}
function rideDecision(driver, rider, trip = null, cancel = false) {
  const frozen = trip ? { ...context(trip), riderName:rider.name, expectedApproval:rider.rideApproval || 'accepted', expectedRequestId:rider.rideRequestId || null } : { ...context(), driverRevision:driver.revision, availabilityRevision:rider.revision };
  const name = cancel ? rider.name : driver.name;
  showDialog(`${dialogHeader(cancel ? 'Cancel this seat request?' : 'Driver: review rider')}<p class="form-context">${trip ? esc(sessionLabel(trip)) : esc(rangeLabel(driver))}</p><p><strong>${esc(rider.name)}</strong> · ${esc(driver.name)}’s car</p><p>${cancel ? 'Release this place and keep your availability to find another ride.' : trip ? 'Accept this rider, or decline and keep them on the waiting list.' : 'Accept this rider for the shared possible times, or decline and keep their availability. The final session is still to be chosen.'}</p><form class="week-form" id="ride-decision">${errorMarkup()}${cancel ? '<input name="decision" type="hidden" value="cancel" />' : '<label for="ride-choice">Driver decision</label><select name="decision" id="ride-choice"><option value="accept">Accept rider</option><option value="decline">Decline ride</option></select>'}${confirmation(name)}<p class="privacy-note">Only record the driver’s decision. Typed names are a safeguard, not identity verification.</p><button class="primary-button" type="submit" disabled>Save decision</button><button class="secondary-button" type="button" data-close>Cancel</button></form>`);
  const form = $('#ride-decision'); form.oninput = ()=>syncConfirmation(form);
  form.onsubmit = event => { event.preventDefault(); submit(form, async()=> {
    const decision = form.elements.decision.value;
    await api(trip ? `/api/trips/${trip.id}/drivers/${driver.id}/riders/${rider.id}` : `/api/week/availability/${driver.id}/riders/${rider.id}`,{method:'POST',body:{...frozen,decision,confirmationName:form.elements.confirmationName.value}});
    await saved(decision === 'accept' ? `${rider.name}: ride accepted with ${driver.name}.${trip ? ` ${sessionLabel(trip)}.` : ' Session time not yet chosen.'}` : `${rider.name}: place released; still listed as needing a ride.`);
  }); };
}
function manageAvailability(entry) {
  if (!entry) return;
  const driver = state.availability.find(a=>a.id===entry.intendedDriverId);
  const riders = entry.transport==='offer' ? flexibleRiders(entry) : [];
  const candidates = entry.transport==='need' && !driver ? state.availability.filter(a=>a.transport==='offer' && a.seats>flexibleRiders(a).length && carTimes(a).some(t=>fits(entry,t))) : [];
  showDialog(`${dialogHeader(esc(entry.name))}<p class="form-context">${esc(rangeLabel(entry))}</p><p><strong>${esc(availabilityRole(entry))}</strong></p>${company(entry)}${entry.transport==='offer' ? `<p><strong>Possible sessions:</strong> ${esc(timesText(carTimes(entry)))}</p><ul class="person-list">${riders.map(r=>`<li><span>${esc(r.name)}${approvalLabel(r)}${company(r)}</span><button class="secondary-button" data-review-flex="${r.id}">Review rider</button></li>`).join('')}</ul>` : ''}${!driver && ['need','offer'].includes(entry.transport) ? quickMatchButton(entry) : ''}<div class="manage-actions">${driver ? '<button class="secondary-button" id="cancel-intent">Cancel seat request</button>' : `<button class="primary-button" id="confirm-availability" ${riders.some(r=>r.rideApproval==='pending') ? 'disabled' : ''}>Choose one session${riders.length ? ' for this car' : ''}</button>${riders.some(r=>r.rideApproval==='pending') ? '<p class="form-help">Driver: accept or decline pending riders first.</p>' : ''}`}${candidates.map(d=>`<button class="secondary-button" data-request-existing="${d.id}">Request a seat with ${esc(d.name)}</button>`).join('')}<button class="secondary-button" id="edit-availability">Edit availability</button><button class="text-button" id="remove-availability">Remove availability</button></div>`);
  bindQuickMatch(entry);
  $('#edit-availability').onclick = () => openAvailability(entry.date, entry);
  if ($('#confirm-availability')) $('#confirm-availability').onclick = () => resolveAvailability(entry);
  if ($('#cancel-intent')) $('#cancel-intent').onclick = () => rideDecision(driver,entry,null,true);
  $('#remove-availability').onclick = () => resolveAvailability(entry, true);
  dialog.querySelectorAll('[data-review-flex]').forEach(b=>b.onclick=()=>rideDecision(entry,riders.find(r=>r.id===b.dataset.reviewFlex)));
  dialog.querySelectorAll('[data-request-existing]').forEach(b=>b.onclick=()=>openAvailability(entry.date,entry,'need',candidates.find(d=>d.id===b.dataset.requestExisting)));
}
function resolveAvailability(entry, removing = false) {
  const frozen = { ...context(), availabilityId: entry.id, availabilityRevision: entry.revision };
  const sessions = entry.transport === 'offer' ? carTimes(entry) : trips().filter(t => fits(entry,t));
  showDialog(`${dialogHeader(removing ? 'Remove availability?' : 'Choose one session')}<p class="form-context">${esc(entry.name)} · ${esc(rangeLabel(entry))}</p><form class="week-form" id="resolve-form">${errorMarkup()}
    ${removing ? `<p>${entry.transport === 'offer' ? 'This removes the car. All intended riders keep their availability and will need another ride.' : 'This removes the flexible plan and releases any held place.'}</p>` : `<label for="resolve-session">Session to attend</label><select id="resolve-session" name="tripId" required><option value="">Choose a session</option>${sessions.map(t => `<option value="${t.id}">${esc(sessionLabel(t))}</option>`).join('')}</select><p class="form-help">${entry.transport === 'need' ? 'We’ll hold an open seat at this time, awaiting driver acceptance. If none is open, you’ll be waiting for a ride for this session.' : entry.transport === 'offer' ? 'Your car and all accepted riders will move together to this session. Other possible times will be released.' : 'You’ll be listed with your own transportation for this session only.'} Your flexible plan will be replaced.</p>`}
    ${confirmation(entry.name)}<button type="submit" class="${removing ? 'danger-button' : 'primary-button'}" disabled>${removing ? 'Remove availability' : 'Confirm this session'}</button><button class="secondary-button" type="button" data-close>Cancel</button></form>`);
  const form = $('#resolve-form'); form.oninput = () => syncConfirmation(form);
  form.onsubmit = event => {
    event.preventDefault();
    submit(form, async () => {
      const body = { ...frozen, confirmationName: form.elements.confirmationName.value };
      if (removing) {
        await api(`/api/week/availability/${entry.id}`, {method:'DELETE', body});
        await saved(`Availability removed: ${entry.name}, ${rangeLabel(entry)}.`);
      } else {
        const trip = sessions.find(t => t.id === form.elements.tripId.value);
        const result = await saveWithReview('/api/week/plans', { ...body, tripId: trip.id, sessionRevision: trip.revision, date: trip.date, sessionTime: trip.sessionTime, language: trip.language }, 'POST', false);
        if (result) await saved(`${sessionLabel(trip)}: ${result.driverName ? `Seat held with ${result.driverName}; awaiting driver acceptance.` : result.placement === 'need' ? 'Waiting for a ride — no seat confirmed.' : result.placement === 'offer' ? 'Your car is now offered for this session.' : 'Attending with your own transportation.'}`, trip.id);
      }
    });
  };
}

function openPlan({ trip = selectedTrip(), transport = '', driverId = '', any = false, found = null } = {}) {
  if (!state.week) return;
  const frozen = context(trip);
  const person = found?.person;
  const editing = Boolean(person);
  transport ||= found?.transport || '';
  const car = trip?.drivers.find((driver) => driver.id === (driverId || found?.driver?.id));
  const carSignup = !editing && transport === 'car';
  const heading = editing ? 'Edit plans' : carSignup ? (any ? 'I need a ride' : `Ride with ${esc(car.name)}`) : transport === 'offer' ? 'Add my car' : transport === 'need' ? 'I need a ride' : 'Attend this session';
  showDialog(`${dialogHeader(heading)}<p class="form-context">${esc(trip ? sessionLabel(trip) : state.week.temple)}</p><form class="week-form" id="plan-form">${errorMarkup()}
    ${trip ? '' : `<label for="plan-date">Day</label><select id="plan-date" name="date" required><option value="">Choose a day</option>${dayOptions('')}</select><label for="plan-time">Session time</label><input id="plan-time" type="time" name="sessionTime" required /><label for="plan-language">Session language (if known)</label><input id="plan-language" name="language" maxlength="60" /><p class="form-help">Use the time and language listed in the temple schedule.</p>`}
    ${!editing && trip && !carSignup && trips().filter(t => t.date === trip.date).length > 1 ? '<button class="text-button" type="button" id="choose-flexible">Choose other sessions instead</button>' : ''}<label for="plan-name">Your full name</label><input id="plan-name" name="name" autocomplete="name" maxlength="80" value="${esc(person?.name || '')}" required />
    ${!editing ? `<input type="hidden" name="transport" value="${esc(transport)}" />${transport === 'need' || any ? '<p>Request a seat in any open car, filling cars first. The driver must accept. If no seats are open, you’ll join the waiting list.</p>' : carSignup ? `<p>You are requesting an open seat with ${esc(car.name)}. The driver must accept before your ride is confirmed.</p>` : transport === 'own' ? '<p>You’ll be listed as attending with your own transportation. You can still ask for someone to attend with below.</p>' : ''}` : `<label for="plan-transport">How will you get there?</label><select id="plan-transport" name="transport" required><option value="offer">I can offer seats</option><option value="need">${found.transport === 'need' ? 'Keep waiting for a ride' : 'I need a ride — join any open car'}</option><option value="own">I have my own transportation</option>${found?.transport === 'car' ? `<option value="car">Ride with ${esc(found.driver.name)}</option>` : ''}</select>`}
    <div id="seat-field" hidden><label for="plan-seats">Passenger seats you can offer</label><select id="plan-seats" name="seats">${Array.from({ length: 8 }, (_, index) => `<option value="${index + 1}">${index + 1} ${index ? 'seats' : 'seat'}</option>`).join('')}</select></div>
    <label class="check-label"><input type="checkbox" name="lookingForCompany" ${person?.lookingForCompany ? 'checked' : ''} />I’d like someone to attend with</label><p class="form-help">Your name will show “Looking for company.” Coordinate with each other outside the app.</p>
    ${found?.transport === 'offer' && person.riders.length ? `<p class="danger-explanation" id="driver-consequence" hidden>If you stop offering your car, its ${person.riders.length} riders will move to this session’s rider list.</p>` : ''}
    ${editing ? confirmation(person.name) : ''}${privacy}<button class="primary-button" type="submit">${editing ? 'Save changes' : transport === 'offer' ? 'Add my car' : transport === 'need' || any ? 'Find me a ride' : carSignup ? 'Join this car' : 'Add my name'}</button></form>`);
  const form = $('#plan-form');
  if ($('#choose-flexible')) $('#choose-flexible').onclick = () => openAvailability(trip.date, null, transport);
  form.elements.transport.value = transport;
  form.elements.seats.value = String(person?.seats || 3);
  const sync = () => {
    $('#seat-field').hidden = form.elements.transport.value !== 'offer';
    form.elements.seats.disabled = form.elements.transport.value !== 'offer';
    const consequence = $('#driver-consequence');
    if (consequence) consequence.hidden = form.elements.transport.value === 'offer';
    syncConfirmation(form);
  };
  form.addEventListener('input', sync);
  sync();
  form.onsubmit = (event) => {
    event.preventDefault();
    submit(form, async () => {
      const data = Object.fromEntries(new FormData(form));
      data.lookingForCompany = form.elements.lookingForCompany.checked;
      if (data.seats) data.seats = Number(data.seats);
      if (data.transport === 'car') {
        if (any) data.assignmentMode = 'any';
        else data.driverId = driverId || found?.driver?.id;
      }
      const selected = trip || state.trips.find((item) => item.date === data.date && item.sessionTime === data.sessionTime && normalized(item.language || '') === normalized(data.language || ''));
      const body = { ...data, ...frozen, ...(trip ? { date: trip.date, sessionTime: trip.sessionTime, language: trip.language } : {}), ...(!trip && selected ? { tripId: selected.id, sessionRevision: selected.revision } : {}) };
      const result = await saveWithReview(editing ? `/api/trips/${trip.id}/people/${person.id}` : '/api/week/plans', body, editing ? 'PATCH' : 'POST', !(found?.transport === 'offer' && person.riders.length));
      if (result) await saved(`${editing ? 'Plans updated' : result.placement === 'offer' ? 'Car added' : 'Plans saved'} for ${sessionLabel(body)}.${result.driverName ? ` ${result.person?.rideApproval === 'pending' ? 'Seat held; awaiting acceptance from' : 'Ride accepted by'} ${result.driverName}.` : result.placement === 'need' ? ' You’re on the waiting list for a ride.' : ''}${result.movedToWaitlist ? ` ${result.movedToWaitlist} riders now need a ride.` : ''}`, result.tripId || trip?.id);
    });
  };
}
function openManage(personId) {
  const trip = selectedTrip();
  const found = people(trip).find(({ person }) => person.id === personId);
  if (!found) return;
  showDialog(`${dialogHeader(esc(found.person.name))}<p class="form-context">${esc(sessionLabel(trip))}</p><p>${esc(found.transport === 'offer' ? `Offering ${found.person.seats} seats` : found.transport === 'car' ? `${found.person.rideApproval === 'pending' ? 'Awaiting acceptance from' : 'Ride accepted by'} ${found.driver.name}` : found.transport === 'need' ? 'Waiting for a ride' : 'Has own transportation')}${company(found.person)}</p>${found.transport==='need' ? quickMatchButton(found.person,trip) : ''}<div class="manage-actions">${found.transport === 'offer' ? '<button class="primary-button" id="review-car-riders">Review riders</button>' : found.transport === 'car' ? '<button class="secondary-button" id="driver-review-ride">Driver: review this ride</button>' : ''}${found.transport !== 'offer' ? `<button class="primary-button" id="change-car">${found.transport === 'car' ? 'Change cars' : 'Add to a car'}</button>` : ''}<button class="secondary-button" id="edit-plan">Edit plans</button><button class="danger-button" id="remove-plan">Remove signup</button></div>`);
  $('#change-car')?.addEventListener('click', () => openMove(found.person.id));
  if (found.transport==='need') bindQuickMatch(found.person,trip);
  if ($('#review-car-riders')) $('#review-car-riders').onclick = () => openCar(found.person.id);
  if ($('#driver-review-ride')) $('#driver-review-ride').onclick = () => rideDecision(found.driver,found.person,trip);
  $('#edit-plan').onclick = () => openPlan({ trip, found });
  $('#remove-plan').onclick = () => openRemove(trip, found);
}
function openMove(personId) {
  const trip = selectedTrip();
  const found = people(trip).find(({ person }) => person.id === personId);
  if (!found) return;
  const frozen = context(trip);
  const cars = trip.drivers.filter((driver) => openSeats(driver) > 0 && driver.id !== found.driver?.id);
  showDialog(`${dialogHeader(found.transport === 'car' ? 'Change cars' : 'Add to a car')}<p class="form-context">${esc(found.person.name)} · ${esc(sessionLabel(trip))}</p><form class="week-form" id="move-form">${errorMarkup()}<div class="move-options" role="group" aria-label="Choose a new ride">${found.transport !== 'car' ? '<button class="secondary-button" type="button" data-destination="any">I need a ride — join any open car</button>' : ''}${cars.map((car) => `<button class="secondary-button" type="button" data-destination="${car.id}">Ride with ${esc(car.name)} (${openSeats(car)} open)</button>`).join('')}</div><p class="form-help">${found.transport === 'car' ? (cars.length ? 'Choose another car with an open seat.' : 'No other cars have an open seat right now.') : 'We’ll fill open cars first. If no seat is available when you save, you’ll join the waiting list.'}</p><div id="move-confirm" hidden>${confirmation(found.person.name)}<button class="primary-button" type="submit" disabled>Save ride change</button></div></form>`);
  const form = $('#move-form');
  let destination;
  form.onclick = (event) => {
    const button = event.target.closest('[data-destination]');
    if (!button) return;
    destination = button.dataset.destination;
    form.querySelectorAll('[data-destination]').forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
    $('#move-confirm').hidden = false;
    $('#confirmation-name').focus();
  };
  form.oninput = () => syncConfirmation(form);
  form.onsubmit = (event) => {
    event.preventDefault();
    if (!destination) return;
    submit(form, async () => {
      const result = await saveWithReview(`/api/trips/${trip.id}/people/${personId}`, { ...frozen, name: found.person.name, confirmationName: form.elements.confirmationName.value, transport: 'car', ...(destination === 'any' ? { assignmentMode: 'any' } : { driverId: destination }) }, 'PATCH');
      if (result) await saved(`Ride updated for ${sessionLabel(trip)}.${result.driverName ? ` ${result.person?.rideApproval === 'pending' ? 'Seat held; awaiting acceptance from' : 'Ride accepted by'} ${result.driverName}.` : ' On the rider list.'}`, trip.id);
    });
  };
}
function openRemove(trip, found) {
  const frozen = context(trip);
  showDialog(`${dialogHeader('Remove this signup?')}<p class="form-context">${esc(sessionLabel(trip))}</p><p>Remove ${esc(found.person.name)} from this session?</p>${found.transport === 'offer' ? '<p class="danger-explanation">Everyone riding in this car will move to this session’s rider list.</p>' : ''}<form class="week-form" id="remove-form">${errorMarkup()}${confirmation(found.person.name)}<button class="danger-button" type="submit" disabled>Remove signup</button><button class="secondary-button" type="button" data-close>Keep signup</button></form>`);
  const form = $('#remove-form');
  form.oninput = () => syncConfirmation(form);
  form.onsubmit = (event) => {
    event.preventDefault();
    submit(form, async () => {
      await api(`/api/trips/${trip.id}/people/${found.person.id}`, { method: 'DELETE', body: { ...frozen, confirmationName: form.elements.confirmationName.value } });
      await saved(`${found.person.name} removed from ${sessionLabel(trip)}.`, trip.id);
    });
  };
}
const supportLabels = {babysitting:'Babysitting', ride:'A ride', company:'Someone to attend with', questions:'Questions answered', familyHistory:'Family history help'};

function openSupportForm(days) {
  const frozen = context();
  const when = days.length === 1 ? sessionLabel(selectedTrip()) : `${dateLabel(days[0])} – ${dateLabel(days.at(-1))}`;
  showDialog(`${dialogHeader('Ask the organizer for support')}<p>${esc(state.week.temple)} · ${esc(when)}</p>
    ${config.demoAdminPin ? '<p class="privacy-note">Local demo with a shared admin PIN. Use a sample name and example needs.</p>' : ''}
    <p>The organizer will follow up with you privately. This request does not reserve a seat or arrange care.</p>
    <form class="week-form" id="support-form">${errorMarkup()}<label for="support-name">Your full name</label><input id="support-name" name="name" autocomplete="name" maxlength="80" required>
    <fieldset><legend>What would help you attend?</legend>${Object.entries(supportLabels).map(([key,label]) => `<label class="check-label"><input type="checkbox" name="needs" value="${key}">${label}</label>
      ${key === 'babysitting' ? '<label class="check-label nursing-choice" hidden><input type="checkbox" name="nursing">I need a babysitter with nursing credentials</label>' : ''}`).join('')}</fieldset>
    <label for="support-day">Preferred day</label><select id="support-day" name="date"><option value="">I’m not sure yet</option>${days.map(day => `<option value="${day}">${esc(dateLabel(day))}</option>`).join('')}</select>
    <button type="submit" class="primary-button">Send request to organizer</button></form>`);
  const form = $('#support-form');
  form.onchange = () => {
    const childcare = form.querySelector('[value="babysitting"]').checked;
    form.querySelector('.nursing-choice').hidden = !childcare;
    if (!childcare) form.elements.nursing.checked = false;
  };
  form.onsubmit = event => {
    event.preventDefault();
    submit(form, async () => {
      const data = new FormData(form);
      await api('/api/week/support',{method:'POST',body:{...frozen,name:data.get('name'),date:data.get('date'),needs:data.getAll('needs'),nursing:form.elements.nursing.checked}});
      await saved('Your request was sent to the organizer for follow-up.');
    });
  };
}

async function openSupportInbox() {
  const frozen = context();
  showDialog(`${dialogHeader('Support requests')}<div id="support-inbox" aria-live="polite">Loading requests…</div>`);
  const target = $('#support-inbox');
  try {
    const result = await api('/api/week/support');
    if (!target.isConnected || !dialog.open || !pin || location.hash !== '#admin') return;
    if (result.weekId !== frozen.weekId) throw new Error('The week changed. Close and reopen the inbox.');
    target.innerHTML = result.requests.length ? result.requests.slice().reverse().map(request => `<article class="admin-section">
      <h3>${esc(request.name)}</h3><p>${request.date ? esc(dateLabel(request.date)) : 'Day undecided'}</p>
      <ul>${request.needs.map(need => `<li>${esc(supportLabels[need])}${need === 'babysitting' && request.nursing ? ' · sitter with nursing credentials requested' : ''}</li>`).join('')}</ul>
      ${request.completed ? '<p>Follow-up complete</p>' : `<form class="week-form" data-complete="${request.id}">${errorMarkup()}<button class="secondary-button" type="submit">Mark follow-up complete</button></form>`}</article>`).join('') : '<p>No support requests this week.</p>';
    for (const form of target.querySelectorAll('form')) form.onsubmit = event => {
      event.preventDefault();
      submit(form,async () => {
        await api('/api/week/support',{method:'PATCH',body:{...frozen,id:form.dataset.complete}});
        await openSupportInbox();
      });
    };
  } catch (error) { target.textContent = error.message; }
}
function renderAdmin() {
  if (!pin) {
    view.innerHTML = `<a class="back-button" href="#week">← View member page</a><section class="week-header"><h1>Organizer access</h1><p class="lead">Enter the admin PIN to manage temple events.</p></section><form id="login-form" class="week-form">${errorMarkup()}<label for="admin-pin">Admin PIN</label><input id="admin-pin" name="pin" type="password" inputmode="numeric" autocomplete="current-password" maxlength="12" required /><p class="form-help">${config.demoAdminPin ? `Local demo PIN: ${esc(config.demoAdminPin)}` : 'Ask the trip organizer for the PIN.'}</p><button class="primary-button" type="submit">Open Admin</button></form>`;
    const form = $('#login-form');
    form.oninput = () => { dirtyAdmin = true; };
    form.onsubmit = (event) => {
      event.preventDefault();
      submit(form, async () => {
        const candidate = form.elements.pin.value;
        await api('/api/admin/verify', { method: 'POST', body: { pin: candidate } });
        pin = candidate;
        sessionStorage.setItem('templeWeekAdminPin', pin);
        dirtyAdmin = false;
        await refresh(true);
        focusHeading();
      });
    };
    return;
  }
  const week = state.week;
  view.innerHTML = `<div class="admin-topline"><a href="#week" class="back-button">← View member page</a><button class="text-button" id="lock-admin">Lock Admin</button></div><section class="week-header"><h1>Temple events</h1></section>
    ${eventLibrary()}
    ${week ? `<section class="admin-section"><h2>Active event settings</h2><div class="week-actions"><button class="text-button" id="remove-week">Delete active event</button></div></section>` : ''}
    ${week ? `<section class="admin-section"><h2>Member support</h2><button class="secondary-button" id="support-requests">View support requests</button></section><section class="admin-section"><h2>Endowment sessions</h2><p>Copy the date, time, and language from the temple’s current reservation schedule.</p><p><a class="text-button" href="https://www.churchofjesuschrist.org/temples/schedule/appointment?lang=eng&amp;templeOrgId=40" target="_blank" rel="noopener">Open LA temple schedule ↗</a></p><button class="primary-button" id="add-session">Add endowment session</button>${trips().length ? trips().map((trip) => `<div class="admin-session"><strong>${esc(sessionLabel(trip))}</strong>${!week.publishedSessionId || week.publishedSessionId === trip.id ? `<a class="text-button" href="#session/${trip.id}">View roster (${people(trip).length})</a>` : `<span>${people(trip).length} signed up</span>`}<button class="secondary-button" data-edit-session="${trip.id}">Edit session</button><button class="text-button" data-log="${trip.id}">Change log</button>${week.publishedSessionId === trip.id ? '<small>Change the active event type or select another session before removing this session.</small>' : `<button class="danger-button" data-delete-session="${trip.id}">Remove session</button>`}</div>`).join('') : '<p>No endowment sessions posted yet.</p>'}</section>` : ''}`;
  $('#lock-admin').onclick = () => { pin = ''; sessionStorage.removeItem('templeWeekAdminPin'); renderAdmin(); focusHeading(); };
  $('#support-requests')?.addEventListener('click',openSupportInbox);
  $('#edit-week')?.addEventListener('click', () => week.publishedSessionId ? openSessionForm(selectedTrip()) : openWeekForm());
  bindEventLibrary();
  $('#add-session')?.addEventListener('click', () => openSessionForm());
  $('#remove-week')?.addEventListener('click', openDeleteWeek);
}
function eventDates(event) {
  const dated = date => `${dateLabel(date)}, ${date.slice(0,4)}`;
  if (event.session) return `${dated(event.session.date)} · ${timeLabel(event.session.sessionTime)} · ${languageLabel(event.session)}`;
  const first = event.startDate.slice(0,4) === event.endDate.slice(0,4) ? dateLabel(event.startDate) : dated(event.startDate);
  return `${first} – ${dated(event.endDate)}`;
}
function eventCard(event) {
  const link = '/?preview=' + encodeURIComponent(event.id) + '#week';
  return `<article class="event-card"><h3>${esc(event.temple)}</h3>
    <p>${event.session ? 'Temple Session' : 'Temple Week'} · ${esc(eventDates(event))}</p>
    <div class="week-actions">${event.status === 'active' ? `
      <button class="secondary-button" id="edit-week" aria-haspopup="dialog">${event.session ? 'Edit session details' : 'Edit week details'}</button>
      <button class="secondary-button" id="change-event-type" aria-haspopup="dialog">Change event type</button>` : ''}
    <a class="secondary-button" href="${link}" aria-label="Preview ${esc(event.temple)} on ${esc(eventDates(event))}">Preview</a>
    ${event.status === 'draft' ? `<button class="secondary-button" data-edit-event="${event.id}">Edit draft</button>` : ''}
    ${event.status === 'active' ? '<button class="text-button" id="end-event">End event</button>' : `<button class="primary-button" data-activate="${event.id}">Make active</button>`}</div></article>`;
}
function eventLibrary() {
  const week = state.week;
  const active = week && {...week, status:'active', session:state.trips.find(trip => trip.id === week.publishedSessionId)};
  const events = state.events || [];
  const drafts = events.filter(event => event.status === 'draft').sort((a,b) => a.startDate.localeCompare(b.startDate));
  const history = events.filter(event => event.status === 'past').reverse();
  return `<section class="admin-section"><h2>Active event</h2>${active ? eventCard(active) : '<p>Members will see signups once you make an event active.</p>'}</section>
    <section class="admin-section"><h2>Upcoming drafts</h2><p>Plan and preview an event before opening signups.</p>
    <button class="primary-button" id="new-event">Create event</button>${drafts.map(eventCard).join('')}</section>
    <details class="admin-section event-history"><summary>Event history (${history.length})</summary>
    ${history.map(eventCard).join('') || '<p>Ended events will appear here with their signups.</p>'}</details>`;
}
function bindEventLibrary() {
  $('#new-event').onclick = () => openEventEditor();
  $('#change-event-type')?.addEventListener('click', openEventType);
  $('#end-event')?.addEventListener('click', () => openActivation(null));
  for (const button of view.querySelectorAll('[data-activate]')) {
    button.onclick = () => openActivation(state.events.find(event => event.id === button.dataset.activate));
  }
  for (const button of view.querySelectorAll('[data-edit-event]')) {
    button.onclick = async () => {
      try {
        const data = await api('/api/admin/events/' + button.dataset.editEvent + '/preview');
        if (button.isConnected && location.hash === '#admin' && pin) openEventEditor(data);
      } catch (error) { announce(error.message); }
    };
  }
}
function openActivation(event) {
  const current = state.week;
  const frozen = {weekId:current?.id ?? null, weekRevision:current?.revision};
  const title = event ? 'Make this event active?' : 'End this event?';
  const currentDates = current && eventDates({...current, session:state.trips.find(trip => trip.id === current.publishedSessionId)});
  const previous = current ? `The event at ${esc(current.temple)} (${esc(currentDates)}) will move to history with its signups.` : '';
  showDialog(`${dialogHeader(title)}<p class="form-context">${event ? esc(event.temple) + ' · ' + esc(eventDates(event)) : esc(current.temple)}</p>
    <p>${event ? 'Members will see this event and can sign up immediately.' : 'Members will see that there is no active event.'} ${previous}</p>
    <form class="week-form" id="activate-form">${errorMarkup()}<button type="submit" class="primary-button">${event ? 'Make active' : 'End event'}</button><button type="button" class="text-button" data-close>Cancel</button></form>`);
  const form = $('#activate-form');
  form.onsubmit = e => {
    e.preventDefault();
    submit(form, async () => {
      const action = event ? event.id + '/activate' : 'end';
      await api('/api/admin/events/' + action, {method:'POST', body:{...frozen, revision:event?.revision}});
      await saved(event ? 'The event is active. Members can sign up now.' : 'Event saved in history.');
    });
  };
}

function openEventEditor(data) {
  const week = data?.week;
  const slots = data?.trips || [];
  const session = slots.find(trip => trip.id === week?.publishedSessionId);
  const isWeek = Boolean(week && !session);
  showDialog(`${dialogHeader(week ? 'Edit draft' : 'Create event')}<form class="week-form" id="event-form">${errorMarkup()}
    <fieldset><legend>Event type</legend>
    <label class="check-label"><input type="radio" name="kind" value="session" ${isWeek ? '' : 'checked'}>Temple Session</label>
    <label class="check-label"><input type="radio" name="kind" value="week" ${isWeek ? 'checked' : ''}>Temple Week</label></fieldset>
    <label for="event-temple">Temple</label><input id="event-temple" name="temple" maxlength="100" value="${esc(week?.temple ?? state.week?.temple ?? '')}" required>
    <label for="event-date" id="event-date-label">Event date</label><input type="date" name="startDate" id="event-date" value="${esc(week?.startDate)}" required>
    <div id="event-single" class="event-fields"><label for="event-time">Endowment time</label><input id="event-time" type="time" value="${esc(session?.sessionTime)}" required>
    <label for="event-language">Session language (if known)</label><input id="event-language" maxlength="60" value="${esc(session?.language)}"></div>
    <section id="event-week" hidden><h3>Endowment sessions</h3><p class="form-help">Add the times members can choose during these seven days.</p><div id="event-slots"></div><button type="button" class="secondary-button" id="add-draft-slot">Add a session</button></section>
    <label for="event-note">Organizer note (optional)</label><textarea name="notes" id="event-note" maxlength="240">${esc(week?.notes)}</textarea>
    <button class="primary-button" type="submit">Save draft</button></form>`);
  const form = $('#event-form');
  const addSlot = (slot = {}) => {
    const row = document.createElement('fieldset');
    row.className = 'event-fields';
    row.innerHTML = `<legend>Session</legend><label>Day<input type="date" name="slotDate" value="${esc(slot.date || form.elements.startDate.value)}" required></label>
      <label>Endowment time<input type="time" name="slotTime" value="${esc(slot.sessionTime)}" required></label>
      <label>Session language (if known)<input name="slotLanguage" maxlength="60" value="${esc(slot.language)}"></label><button class="text-button" type="button">Remove time</button>`;
    $('button', row).onclick = () => { row.remove(); $('#add-draft-slot').focus(); };
    $('#event-slots').append(row);
    return row;
  };
  slots.forEach(addSlot);
  const sync = () => {
    const single = form.elements.kind.value === 'session';
    $('#event-date-label').textContent = single ? 'Event date' : 'First day of temple week';
    $('#event-single').hidden = !single;
    $('#event-week').hidden = single;
    for (const control of $('#event-single').querySelectorAll('input')) control.disabled = !single;
    const first = form.elements.startDate.value;
    const end = first && new Date(first + 'T12:00:00Z');
    if (end) end.setUTCDate(end.getUTCDate() + 6);
    for (const row of $('#event-slots').children) {
      row.disabled = single;
      const day = $('input[type=date]',row);
      day.min = first;
      day.max = end ? end.toISOString().slice(0,10) : '';
    }
  };
  form.oninput = sync;
  $('#add-draft-slot').onclick = () => { const row = addSlot(); sync(); $('input',row).focus(); };
  sync();
  form.onsubmit = e => {
    e.preventDefault();
    submit(form, async () => {
      const {kind,temple,startDate,notes} = Object.fromEntries(new FormData(form));
      const sessions = kind === 'session' ? [{date:startDate, sessionTime:$('#event-time').value, language:$('#event-language').value}]
        : [...$('#event-slots').children].map(row => ({date:$('[name=slotDate]',row).value, sessionTime:$('[name=slotTime]',row).value, language:$('[name=slotLanguage]',row).value}));
      await api('/api/admin/events' + (week ? '/' + week.id : ''), {method:week ? 'PATCH' : 'POST', body:{kind, temple, startDate, notes, sessions, revision:week?.revision}});
      await saved('Draft saved. Preview it or make it active when you’re ready.');
    });
  };
}

function openEventType() {
  const frozen = context();
  const selected = state.week.publishedSessionId;
  const sessions = trips();
  showDialog(`${dialogHeader('Change event type')}<p class="form-context">${esc(state.week.temple)} · ${esc(eventDates(state.week))}</p><form class="week-form" id="member-view-form">${errorMarkup()}
    <fieldset><legend>Event type</legend>
    <label class="check-label"><input type="radio" name="mode" value="week" ${selected ? '' : 'checked'}>Temple Week</label>
    <label class="check-label"><input type="radio" name="mode" value="session" ${selected ? 'checked' : ''} ${sessions.length ? '' : 'disabled'}>Temple Session</label></fieldset>
    ${sessions.length ? '' : '<p class="form-help">Add an endowment session to choose it here.</p>'}
    <div id="member-session-field"><label for="member-session">Which session?</label><select id="member-session" name="tripId" required>
    <option value="">Choose a session</option>${sessions.map(trip => `<option value="${trip.id}" ${selected === trip.id ? 'selected' : ''}>${esc(sessionLabel(trip))}</option>`).join('')}</select></div>
    <p class="form-help">Choosing one session opens its roster for everyone. You can show the whole week again at any time. All signups are kept.</p>
    <button class="primary-button" type="submit">Save event type</button></form>`);
  const form = $('#member-view-form');
  const sync = () => {
    const single = form.elements.mode.value === 'session';
    $('#member-session-field').hidden = !single;
    form.elements.tripId.disabled = !single;
  };
  form.onchange = sync;
  sync();
  form.onsubmit = event => {
    event.preventDefault();
    submit(form, async () => {
      const mode = form.elements.mode.value;
      const trip = mode === 'session' && sessions.find(item => item.id === form.elements.tripId.value);
      await api('/api/week/member-view', {method:'PATCH', body:{...frozen, mode, ...(trip ? {tripId:trip.id, sessionRevision:trip.revision} : {})}});
      await saved(trip ? `Members now see ${sessionLabel(trip)}.` : 'Members now see the whole Temple Week.');
    });
  };
}

function openWeekForm() {
  const week = state.week;
  const frozen = context();

  showDialog(`${dialogHeader(week ? 'Edit temple week' : 'Set up temple week')}<form class="week-form" id="week-form">${errorMarkup()}<label for="week-temple">Temple</label><input id="week-temple" name="temple" maxlength="100" value="${esc(week?.temple || 'Los Angeles Temple')}" required /><label for="week-start">First day of temple week</label><input id="week-start" name="startDate" type="date" value="${esc(week?.startDate || '')}" required /><p class="form-help" id="week-range">Includes this day and the next six days.</p><label for="week-note">Note (optional)</label><textarea id="week-note" name="notes" maxlength="240" rows="3">${esc(week?.notes || '')}</textarea><div id="replace-confirm" hidden><p class="danger-explanation">Changing the temple or dates replaces this week. All ${state.trips.length} sessions, ${state.trips.reduce((sum, trip) => sum + people(trip).length, 0)} signups, ${(state.availability || []).length} flexible plans, support requests, and session logs will be removed.</p>${week ? confirmation(week.temple) : ''}</div><button class="primary-button" type="submit">Save week</button></form>`);
  const form = $('#week-form');
  const replacementNeeded = () => week && (form.elements.temple.value.trim().replace(/\s+/g, ' ') !== week.temple || form.elements.startDate.value !== week.startDate);
  const sync = () => {
    const replacement = replacementNeeded();
    $('#replace-confirm').hidden = !replacement;
    const confirm = form.elements.confirmationName;
    if (confirm) { confirm.disabled = !replacement; confirm.required = Boolean(replacement); }
    $('[type="submit"]', form).disabled = Boolean(replacement && normalized(confirm.value) !== normalized(week.temple));
    const start = form.elements.startDate.value;
    if (start) {
      const end = new Date(`${start}T12:00:00Z`);
      if (!Number.isNaN(end.valueOf())) { end.setUTCDate(end.getUTCDate() + 6); $('#week-range').textContent = `Through ${dateLabel(end.toISOString().slice(0, 10))}.`; }
    }
  };
  form.oninput = sync;
  sync();
  form.onsubmit = (event) => {
    event.preventDefault();
    submit(form, async () => {
      const data = Object.fromEntries(new FormData(form));
      await api('/api/week', { method: 'POST', body: { ...data, ...frozen, replace: Boolean(replacementNeeded()), confirmationTemple: replacementNeeded() ? week.temple : undefined } });
      await saved(replacementNeeded() ? 'Temple week replaced. Add plans for the new week.' : 'Temple week saved.');
    });
  };
}
function openDeleteWeek() {
  const week = state.week;
  const frozen = context();
  showDialog(`${dialogHeader('Remove temple week?')}<p class="form-context">${esc(week.temple)} · ${esc(dateLabel(week.startDate))}</p><p class="danger-explanation">This removes every session, signup, flexible plan, support request, and change log for this week.</p><form class="week-form" id="delete-week-form">${errorMarkup()}${confirmation(week.temple)}<button class="danger-button" type="submit" disabled>Remove entire week</button></form>`);
  const form = $('#delete-week-form');
  form.oninput = () => syncConfirmation(form);
  form.onsubmit = (event) => {
    event.preventDefault();
    submit(form, async () => {
      await api('/api/week', { method: 'DELETE', body: { ...frozen, confirmationTemple: normalized(form.elements.confirmationName.value) === normalized(week.temple) ? week.temple : form.elements.confirmationName.value } });
      await saved('Temple week removed.');
    });
  };
}
function openSessionForm(trip, remove = false) {
  const frozen = context(trip);
  const creating = !trip;
  trip ||= { date: state.week.startDate, sessionTime: '', language: '', notes: '' };
  showDialog(`${dialogHeader(remove ? 'Remove this session?' : creating ? 'Add endowment session' : 'Edit endowment session')}<p class="form-context">${esc(creating ? state.week.temple : sessionLabel(trip))}</p><form class="week-form" id="session-form">${errorMarkup()}${remove ? `<p class="danger-explanation">Remove this session, its ${people(trip).length} signups, and its change log? Other sessions and flexible plans will stay.</p>` : `<label for="session-date">Day</label><select id="session-date" name="date">${dayOptions(trip.date)}</select><label for="session-time">Session time</label><input id="session-time" type="time" name="sessionTime" value="${trip.sessionTime}" required /><label for="session-language">Session language (if known)</label><input id="session-language" name="language" maxlength="60" value="${esc(trip.language || '')}" placeholder="As listed in the temple schedule" /><p class="form-help">Leave blank if the schedule does not specify a language.</p><label for="session-note">Note (optional)</label><textarea id="session-note" name="notes" rows="3" maxlength="240">${esc(trip.notes)}</textarea><p class="form-help">Use the endowment time and language listed by the temple. Everyone in this roster will see these details.</p>`}<button class="${remove ? 'danger' : 'primary'}-button" type="submit">${remove ? 'Remove session and signups' : 'Save session'}</button><button class="secondary-button" data-close type="button">Cancel</button></form>`);
  const form = $('#session-form');
  form.onsubmit = (event) => {
    event.preventDefault();
    submit(form, async () => {
      await api(creating ? '/api/trips' : `/api/trips/${trip.id}`, { method: remove ? 'DELETE' : creating ? 'POST' : 'PATCH', body: { ...Object.fromEntries(new FormData(form)), ...frozen } });
      await saved(remove ? `${sessionLabel(trip)} session removed.` : `${creating ? 'Session posted' : 'Session updated'}: ${sessionLabel(Object.fromEntries(new FormData(form)))}.`);
    });
  };
}
async function openLog(trip) {
  showDialog(`${dialogHeader('Session changes')}<p class="form-context">${esc(sessionLabel(trip))}</p><p>PIN protected. Records changes, not the identity of an unauthenticated member.</p><div id="log-content"><p role="status">Loading changes…</p></div>`);
  const target = $('#log-content');
  try {
    const { entries } = await api(`/api/trips/${trip.id}/change-log`);
    if (!target.isConnected) return;
    target.innerHTML = entries.length ? `<ol class="log-list">${entries.map((entry) => `<li>${esc(entry.description)}<small>${esc(new Date(entry.timestamp).toLocaleString())} · ${entry.actor === 'administrator' ? 'Admin request' : 'Member request'}</small></li>`).join('')}</ol>` : '<p>No changes recorded.</p>';
  } catch (error) { target.textContent = error.message; }
}
view.addEventListener('click', (event) => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.dataset.day) {
    expandedDay = expandedDay === button.dataset.day ? null : button.dataset.day;
    render();
    // Closing the preceding day's long list can move this heading off screen.
    $(`#day-toggle-${button.dataset.day}`, view)?.scrollIntoView({ block: expandedDay ? 'start' : 'nearest' });
    return;
  }
  if (button.hasAttribute('data-add')) openPlan({ transport: 'offer' });
  if (button.hasAttribute('data-need')) openPlan({ transport: 'need' });
  if (button.hasAttribute('data-own')) openPlan({ transport: 'own' });
  if (button.dataset.flexJoin) { const driver = state.availability.find(a=>a.id===button.dataset.flexJoin); openAvailability(driver.date,null,'need',driver); }
  if (button.dataset.flex) openAvailability(button.dataset.flex);
  if (button.dataset.availability) manageAvailability(state.availability.find(a => a.id === button.dataset.availability));
  if (button.dataset.car) openCar(button.dataset.car);
  if (button.dataset.join) openPlan({ transport: 'car', driverId: button.dataset.join });
  if (button.dataset.person) openManage(button.dataset.person);
  if (button.dataset.move) openMove(button.dataset.move);
  if (button.dataset.view) { groupView = button.dataset.view; sessionStorage.setItem('templeWeekGroupView', groupView); render(); $(`[data-view="${groupView}"]`, view).focus(); }
  if (button.dataset.editSession) openSessionForm(state.trips.find((trip) => trip.id === button.dataset.editSession));
  if (button.dataset.deleteSession) openSessionForm(state.trips.find((trip) => trip.id === button.dataset.deleteSession), true);
  if (button.dataset.log) openLog(state.trips.find((trip) => trip.id === button.dataset.log));
});
for (const modal of [dialog, help]) {
  modal.addEventListener('click', (event) => { if (!busy && event.target.closest('[data-close]')) modal.close(); });
  modal.addEventListener('cancel', (event) => { if (busy) event.preventDefault(); });
  modal.addEventListener('close', () => {
    if (modal === dialog && !dialog.open && dialog.querySelector('form[data-stale]')) planningDays.clear();
    if (modal === dialog && !dialog.open && dialog.querySelector('#support-inbox')) dialog.replaceChildren();
    if (modal === dialog && lastFocus?.isConnected) lastFocus.focus();
    if (!busy) refresh().then(() => { if (modal === dialog && !lastFocus?.isConnected) focusHeading(); }).catch((error) => announce(error.message));
  });
}
for (const modal of [dialog, review, help]) {
  modal.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab') return;
    const controls = [...modal.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]')].filter((control) => control.getClientRects().length > 0);
    const first = controls[0];
    const last = controls.at(-1);
    if (!first) { event.preventDefault(); return; }
    if (event.shiftKey && (document.activeElement === first || !controls.includes(document.activeElement))) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && (document.activeElement === last || !controls.includes(document.activeElement))) { event.preventDefault(); first.focus(); }
  });
}
$('#help-button').onclick = () => {
  const single = Boolean(state.week?.publishedSessionId);
  $('#week-help').hidden = single;
  $('#session-help').hidden = !single;
  help.showModal();
};
$('.skip-link').onclick = (event) => { event.preventDefault(); $('#main-content').focus(); };
window.addEventListener('hashchange', () => {
  dirtyAdmin = false;
  if ($('#status').dataset.route !== location.hash) $('#status').hidden = true;
  if (review.open) review.close();
  if (dialog.open) dialog.close();
  if (help.open) help.close();
  if (location.hash !== '#admin' && state.week?.publishedSessionId) {
    state = {...state, trips:state.trips.filter(trip => trip.id === state.week.publishedSessionId), availability:[]};
  }
  if (!previewId && location.hash === '#admin' && pin) {
    view.innerHTML = '<p role="status">Loading organizer settings…</p>';
    refresh(true).then(focusHeading).catch(error => announce(error.message));
    return;
  }
  render();
  focusHeading();
  refresh().catch((error) => announce(error.message));
});
setInterval(() => {
  if (!document.hidden && !interacting() && location.hash !== '#admin') refresh().catch(() => announce('The roster could not refresh. Your plans are still on screen; trying again shortly.'));
}, 10_000);
document.addEventListener('visibilitychange', () => { if (!document.hidden && !interacting()) refresh().catch((error) => announce(error.message)); });
if (previewId) {
  $('#preview-banner').hidden = false;
  $('.admin-link').href = '/#admin';
}
api('/api/config').then(async settings => {
  config = settings;
  if (settings.mode !== 'temple-week') throw new Error('Use the local Temple Week experiment launcher to open this experience.');
  await refresh(true);
}).catch((error) => {
  view.innerHTML = `<section class="week-empty"><h1>${previewId ? 'Preview unavailable' : 'Temple week could not load'}</h1>${previewId ? '<p><a class="text-button" href="/#admin">Open Admin to choose an event</a></p>' : ''}<p>${esc(error.message)}</p><button class="primary-button" id="retry-load">Try again</button></section>`;
  $('#retry-load').onclick = () => location.reload();
});
