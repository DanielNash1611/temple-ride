const elements = {
  memberView: document.querySelector('#member-view'),
  adminLoginView: document.querySelector('#admin-login-view'),
  adminView: document.querySelector('#admin-view'),
  tripContent: document.querySelector('#trip-content'),
  memberEmpty: document.querySelector('#member-empty'),
  tripDate: document.querySelector('#trip-date'),
  tripTemple: document.querySelector('#trip-temple'),
  tripSession: document.querySelector('#trip-session'),
  tripNote: document.querySelector('#trip-note'),
  ridesHeading: document.querySelector('#rides-heading'),
  seatsViewButton: document.querySelector('#seats-view-button'),
  namesViewButton: document.querySelector('#names-view-button'),
  driveButton: document.querySelector('#drive-button'),
  driverPanel: document.querySelector('#driver-panel'),
  carList: document.querySelector('#car-list'),
  seatLegend: document.querySelector('#seat-legend'),
  waitlistAction: document.querySelector('#waitlist-action'),
  waitlistButton: document.querySelector('#waitlist-button'),
  riderListSection: document.querySelector('#rider-list-section'),
  riderList: document.querySelector('#rider-list'),
  riderDialog: document.querySelector('#rider-dialog'),
  riderDialogLabel: document.querySelector('#rider-dialog-label'),
  riderDialogHeading: document.querySelector('#rider-dialog-heading'),
  selectedDriverId: document.querySelector('#selected-driver-id'),
  riderSubmit: document.querySelector('#rider-submit'),
  carRosterDialog: document.querySelector('#car-roster-dialog'),
  carRosterHeading: document.querySelector('#car-roster-heading'),
  carRosterContent: document.querySelector('#car-roster-content'),
  rosterJoinButton: document.querySelector('#roster-join-button'),
  seatNamePopover: document.querySelector('#seat-name-popover'),
  seatNameText: document.querySelector('#seat-name-text'),
  toast: document.querySelector('#toast'),
  tripForm: document.querySelector('#trip-form'),
  editTripId: document.querySelector('#edit-trip-id'),
  tripSubmit: document.querySelector('#trip-submit'),
  signupCount: document.querySelector('#signup-count'),
  adminPeopleList: document.querySelector('#admin-people-list'),
  deleteTripButton: document.querySelector('#delete-trip-button')
};

let state = { version: 2, activeTripId: null, trips: [] };
let adminPin = sessionStorage.getItem('templeRideAdminPin') || '';
let groupView = sessionStorage.getItem('templeRideGroupView') === 'names' ? 'names' : 'seats';
let toastTimer;
let seatNameAnchor = null;

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function initials(name) {
  return String(name)
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || '?';
}

function formatDate(dateString) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric'
  }).format(new Date(dateString + 'T12:00:00'));
}

function formatTime(time) {
  const [hours, minutes] = time.split(':').map(Number);
  return new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit'
  }).format(new Date(2000, 0, 1, hours, minutes));
}

function currentTrip() {
  return state.trips.find((trip) => trip.id === state.activeTripId) || null;
}

function openSeats(driver) {
  return Math.max(0, driver.seats - driver.riders.length);
}

function setBusy(button, busy, busyLabel) {
  if (busy) {
    button.dataset.originalLabel = button.textContent;
    button.textContent = busyLabel;
    button.disabled = true;
    return;
  }
  button.textContent = button.dataset.originalLabel || button.textContent;
  delete button.dataset.originalLabel;
  button.disabled = false;
}

function showToast(message) {
  clearTimeout(toastTimer);
  elements.toast.textContent = message;
  elements.toast.hidden = false;
  toastTimer = setTimeout(() => {
    elements.toast.hidden = true;
  }, 4500);
}

async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (adminPin) headers['X-Admin-Pin'] = adminPin;
  const response = await fetch(path, { ...options, headers });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Something went wrong.');
  return payload;
}

async function refreshState() {
  state = await api('/api/state');
  renderMember();
  renderAdmin();
}

function renderMember() {
  const trip = currentTrip();
  elements.memberEmpty.hidden = Boolean(trip);
  elements.tripContent.hidden = !trip;
  closeDriverPanel();
  if (!trip) return;

  elements.tripDate.textContent = formatDate(trip.date);
  elements.tripTemple.textContent = trip.temple;
  elements.tripSession.textContent = formatTime(trip.sessionTime);
  elements.tripNote.textContent = trip.notes;
  elements.tripNote.hidden = !trip.notes;

  const totalOpenSeats = trip.drivers.reduce((total, driver) => total + openSeats(driver), 0);
  const showingNames = groupView === 'names';
  elements.ridesHeading.textContent = showingNames ? 'Who’s riding' : 'Choose an open seat';
  elements.seatsViewButton.setAttribute('aria-selected', String(!showingNames));
  elements.namesViewButton.setAttribute('aria-selected', String(showingNames));
  elements.seatLegend.hidden = showingNames || trip.drivers.length === 0;
  elements.waitlistAction.hidden = totalOpenSeats > 0;
  elements.carList.classList.toggle('names-view', showingNames);
  elements.carList.innerHTML = trip.drivers.length
    ? trip.drivers.map(showingNames ? renderNameGroup : renderVisualCar).join('')
    : renderEmptyCar();

  elements.riderListSection.hidden = trip.waitlist.length === 0;
  elements.riderList.innerHTML = trip.waitlist
    .map((rider) => '<li>' + escapeHtml(rider.name) + '</li>')
    .join('');
}

function renderVisualCar(driver) {
  const remaining = openSeats(driver);
  const passengerSeats = Array.from({ length: driver.seats }, (_, index) => {
    const rider = driver.riders[index];
    if (rider) {
      return [
        '<button class="car-seat taken occupied-seat-button" type="button"',
        ' data-rider-name="', escapeHtml(rider.name), '"',
        ' data-tooltip="', escapeHtml(rider.name), '"',
        ' aria-label="', escapeHtml(rider.name), ', passenger. Tap to show full name.">',
        '<span class="seat-initials">', escapeHtml(initials(rider.name)), '</span>',
        '</button>'
      ].join('');
    }
    return [
      '<button class="car-seat open-seat-button" type="button"',
      ' data-driver-id="', driver.id, '"',
      ' data-driver-name="', escapeHtml(driver.name), '"',
      ' aria-label="Open seat with ', escapeHtml(driver.name), '. Tap to join.">',
      '<span class="car-seat-plus" aria-hidden="true">＋</span>',
      '</button>'
    ].join('');
  }).join('');

  return [
    '<article class="visual-car-card" aria-label="', escapeHtml(driver.name), '&apos;s car">',
    '<button class="car-card-heading" type="button" data-show-car-id="', driver.id, '"',
    ' aria-label="View riders in ', escapeHtml(driver.name), '&apos;s car">',
    '<div class="driver-identity">',
    '<span class="driver-avatar" aria-hidden="true">', escapeHtml(initials(driver.name)), '</span>',
    '<strong>', escapeHtml(driver.name), '</strong>',
    '</div>',
    '<span class="open-seat-count">', remaining ? remaining + ' open' : 'Full', '</span>',
    '<span class="car-heading-arrow" aria-hidden="true">›</span>',
    '</button>',
    '<div class="car-shell">',
    '<span class="car-wheel front left" aria-hidden="true"></span>',
    '<span class="car-wheel front right" aria-hidden="true"></span>',
    '<span class="car-wheel rear left" aria-hidden="true"></span>',
    '<span class="car-wheel rear right" aria-hidden="true"></span>',
    '<div class="car-hood" aria-hidden="true">',
    '<i class="headlight left"></i><span class="car-badge">◇</span><i class="headlight right"></i>',
    '</div>',
    '<div class="car-windshield" aria-hidden="true"></div>',
    '<div class="car-seat-grid">',
    '<div class="car-seat driver" aria-label="', escapeHtml(driver.name), ', driver">',
    '<span class="seat-symbol" aria-hidden="true">◉</span>',
    '<span class="seat-initials">', escapeHtml(initials(driver.name)), '</span>',
    '</div>',
    passengerSeats,
    '</div>',
    '<div class="car-rear-window" aria-hidden="true"></div>',
    '<div class="car-trunk" aria-hidden="true"><i class="tail-light left"></i><i class="tail-light right"></i></div>',
    '</div></article>'
  ].join('');
}

function renderNameGroup(driver) {
  const remaining = openSeats(driver);
  const riders = driver.riders.length
    ? '<ul class="full-name-list">' + driver.riders.map((rider) => [
        '<li><span class="name-avatar" aria-hidden="true">', escapeHtml(initials(rider.name)), '</span>',
        '<strong>', escapeHtml(rider.name), '</strong></li>'
      ].join('')).join('') + '</ul>'
    : '<p class="no-riders-yet">No riders yet</p>';

  return [
    '<article class="name-car-group" aria-label="People in ', escapeHtml(driver.name), '&apos;s car">',
    '<div class="name-driver-row">',
    '<span class="driver-avatar" aria-hidden="true">', escapeHtml(initials(driver.name)), '</span>',
    '<span><small>Driver</small><strong>', escapeHtml(driver.name), '</strong></span>',
    '<b>', remaining ? remaining + ' open' : 'Full', '</b>',
    '</div>',
    riders,
    remaining ? [
      '<button class="join-name-list-button" type="button"',
      ' data-driver-id="', driver.id, '" data-driver-name="', escapeHtml(driver.name), '">',
      '<span aria-hidden="true">＋</span> Join this car',
      '</button>'
    ].join('') : '',
    '</article>'
  ].join('');
}

function renderEmptyCar() {
  return [
    '<div class="empty-car-visual"><div>',
    '<div class="empty-car-icon" aria-hidden="true">⌁</div>',
    '<strong>No cars yet</strong>',
    '<button class="secondary-button" type="button" data-open-driver-form>Add my car</button>',
    '</div></div>'
  ].join('');
}

function renderAdmin() {
  const trip = currentTrip();
  if (trip) {
    elements.editTripId.value = trip.id;
    ['temple', 'date', 'sessionTime', 'notes'].forEach((field) => {
      elements.tripForm.elements[field].value = trip[field] || '';
    });
    elements.tripSubmit.textContent = 'Update trip';
    elements.deleteTripButton.hidden = false;
  } else {
    elements.tripForm.reset();
    elements.editTripId.value = '';
    elements.tripSubmit.textContent = 'Post trip';
    elements.deleteTripButton.hidden = true;
  }

  const people = trip ? [
    ...trip.drivers.map((driver) => ({
      id: driver.id,
      label: driver.name + ' — driver, ' + driver.seats + ' ' + (driver.seats === 1 ? 'seat' : 'seats')
    })),
    ...trip.drivers.flatMap((driver) => driver.riders.map((rider) => ({
      id: rider.id,
      label: rider.name + ' — with ' + driver.name
    }))),
    ...trip.waitlist.map((rider) => ({
      id: rider.id,
      label: rider.name + ' — waiting'
    }))
  ] : [];

  elements.signupCount.textContent = people.length + ' ' + (people.length === 1 ? 'person' : 'people');
  elements.adminPeopleList.innerHTML = people.length
    ? people.map((person) => [
        '<div class="person-row">',
        '<span>', escapeHtml(person.label), '</span>',
        '<button type="button" data-remove-person="', person.id, '">Remove</button>',
        '</div>'
      ].join('')).join('')
    : '<p class="admin-empty">No one has signed up yet.</p>';
}

function showView(viewName) {
  elements.memberView.hidden = viewName !== 'member';
  elements.adminLoginView.hidden = viewName !== 'login';
  elements.adminView.hidden = viewName !== 'admin';
  window.scrollTo({ top: 0, behavior: 'smooth' });
  requestAnimationFrame(() => {
    const heading = viewName === 'member'
      ? elements.memberView.querySelector('#trip-content:not([hidden]) h1, #member-empty:not([hidden]) h1')
      : document.querySelector('#' + (viewName === 'login' ? 'admin-login-view' : 'admin-view') + ' h1');
    heading?.setAttribute('tabindex', '-1');
    heading?.focus({ preventScroll: true });
  });
}

function openDriverPanel() {
  elements.driverPanel.hidden = false;
  elements.driveButton.setAttribute('aria-expanded', 'true');
  requestAnimationFrame(() => document.querySelector('#driver-name').focus());
  elements.driverPanel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function closeDriverPanel() {
  elements.driverPanel.hidden = true;
  elements.driveButton.setAttribute('aria-expanded', 'false');
}

function openRiderDialog(driverId = '', driverName = '') {
  const isCarSeat = Boolean(driverId);
  document.querySelector('#rider-form').reset();
  elements.selectedDriverId.value = driverId;
  elements.riderDialogLabel.textContent = isCarSeat ? 'Open seat' : 'Rider list';
  elements.riderDialogHeading.textContent = isCarSeat ? 'Ride with ' + driverName : 'I need a ride';
  elements.riderSubmit.textContent = isCarSeat ? 'Take this seat' : 'Join the rider list';
  elements.riderDialog.showModal();
  requestAnimationFrame(() => document.querySelector('#rider-name').focus());
}

function findDriver(driverId) {
  return currentTrip()?.drivers.find((driver) => driver.id === driverId) || null;
}

function openCarRoster(driverId) {
  const driver = findDriver(driverId);
  if (!driver) return;
  const remaining = openSeats(driver);
  elements.carRosterHeading.textContent = driver.name + '’s car';
  elements.carRosterContent.innerHTML = [
    '<div class="roster-driver"><span class="driver-avatar" aria-hidden="true">', escapeHtml(initials(driver.name)), '</span>',
    '<span><small>Driver</small><strong>', escapeHtml(driver.name), '</strong></span></div>',
    driver.riders.length
      ? '<ul class="roster-rider-list">' + driver.riders.map((rider) => [
          '<li><span class="name-avatar" aria-hidden="true">', escapeHtml(initials(rider.name)), '</span>',
          '<strong>', escapeHtml(rider.name), '</strong></li>'
        ].join('')).join('') + '</ul>'
      : '<p class="no-riders-yet">No riders yet</p>',
    '<p class="roster-seat-status">', remaining ? remaining + ' open ' + (remaining === 1 ? 'seat' : 'seats') : 'This car is full', '</p>'
  ].join('');
  elements.rosterJoinButton.hidden = remaining === 0;
  elements.rosterJoinButton.dataset.driverId = driver.id;
  elements.rosterJoinButton.dataset.driverName = driver.name;
  elements.carRosterDialog.showModal();
}

function closeSeatName(restoreFocus = true) {
  elements.seatNamePopover.hidden = true;
  if (restoreFocus) seatNameAnchor?.focus({ preventScroll: true });
  seatNameAnchor = null;
}

function openSeatName(anchor, riderName) {
  seatNameAnchor = anchor;
  elements.seatNameText.textContent = riderName;
  elements.seatNamePopover.hidden = false;
  const anchorRect = anchor.getBoundingClientRect();
  const popupRect = elements.seatNamePopover.getBoundingClientRect();
  const left = Math.max(12, Math.min(window.innerWidth - popupRect.width - 12, anchorRect.left + anchorRect.width / 2 - popupRect.width / 2));
  const below = anchorRect.bottom + 10;
  const top = below + popupRect.height < window.innerHeight
    ? below
    : anchorRect.top - popupRect.height - 10;
  elements.seatNamePopover.style.left = left + 'px';
  elements.seatNamePopover.style.top = Math.max(12, top) + 'px';
  document.querySelector('#close-seat-name').focus({ preventScroll: true });
}

document.querySelector('#home-button').addEventListener('click', () => showView('member'));
document.querySelector('#admin-button').addEventListener('click', () => showView(adminPin ? 'admin' : 'login'));
document.querySelector('#empty-admin-button').addEventListener('click', () => showView(adminPin ? 'admin' : 'login'));
document.querySelectorAll('[data-go-home]').forEach((button) => button.addEventListener('click', () => showView('member')));
document.querySelectorAll('[data-close-panel]').forEach((button) => button.addEventListener('click', closeDriverPanel));
elements.driveButton.addEventListener('click', openDriverPanel);
elements.waitlistButton.addEventListener('click', () => openRiderDialog());
elements.seatsViewButton.addEventListener('click', () => {
  groupView = 'seats';
  sessionStorage.setItem('templeRideGroupView', groupView);
  renderMember();
});
elements.namesViewButton.addEventListener('click', () => {
  groupView = 'names';
  sessionStorage.setItem('templeRideGroupView', groupView);
  renderMember();
});

elements.carList.addEventListener('click', (event) => {
  const occupiedSeat = event.target.closest('[data-rider-name]');
  if (occupiedSeat) {
    openSeatName(occupiedSeat, occupiedSeat.dataset.riderName);
    return;
  }
  const openSeat = event.target.closest('[data-driver-id]');
  if (openSeat) {
    openRiderDialog(openSeat.dataset.driverId, openSeat.dataset.driverName);
    return;
  }
  const carHeading = event.target.closest('[data-show-car-id]');
  if (carHeading) {
    openCarRoster(carHeading.dataset.showCarId);
    return;
  }
  if (event.target.closest('[data-open-driver-form]')) openDriverPanel();
});

document.querySelector('#close-rider-dialog').addEventListener('click', () => elements.riderDialog.close());
elements.riderDialog.addEventListener('click', (event) => {
  if (event.target === elements.riderDialog) elements.riderDialog.close();
});
document.querySelector('#close-car-roster').addEventListener('click', () => elements.carRosterDialog.close());
elements.carRosterDialog.addEventListener('click', (event) => {
  if (event.target === elements.carRosterDialog) elements.carRosterDialog.close();
});
elements.rosterJoinButton.addEventListener('click', () => {
  const { driverId, driverName } = elements.rosterJoinButton.dataset;
  elements.carRosterDialog.close();
  openRiderDialog(driverId, driverName);
});
document.querySelector('#close-seat-name').addEventListener('click', () => closeSeatName());
document.addEventListener('pointerdown', (event) => {
  if (elements.seatNamePopover.hidden) return;
  if (elements.seatNamePopover.contains(event.target) || event.target.closest('[data-rider-name]')) return;
  closeSeatName(false);
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !elements.seatNamePopover.hidden) closeSeatName();
});

document.querySelector('#driver-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type=submit]');
  try {
    setBusy(button, true, 'Adding car…');
    await api('/api/trips/' + currentTrip().id + '/drivers', {
      method: 'POST',
      body: JSON.stringify(Object.fromEntries(new FormData(form)))
    });
    form.reset();
    closeDriverPanel();
    await refreshState();
    showToast('Your car is ready for riders.');
  } catch (error) {
    showToast(error.message);
  } finally {
    setBusy(button, false);
  }
});

document.querySelector('#rider-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type=submit]');
  try {
    setBusy(button, true, 'Saving your seat…');
    const result = await api('/api/trips/' + currentTrip().id + '/riders', {
      method: 'POST',
      body: JSON.stringify(Object.fromEntries(new FormData(form)))
    });
    elements.riderDialog.close();
    await refreshState();
    showToast(result.placement === 'car' ? 'You’re riding with ' + result.driverName + '.' : 'You’re on the rider list.');
  } catch (error) {
    elements.riderDialog.close();
    await refreshState().catch(() => undefined);
    showToast(error.message);
  } finally {
    setBusy(button, false);
  }
});

document.querySelector('#admin-login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type=submit]');
  const pin = new FormData(form).get('pin');
  try {
    setBusy(button, true, 'Checking PIN…');
    await api('/api/admin/verify', {
      method: 'POST',
      body: JSON.stringify({ pin }),
      headers: { 'X-Admin-Pin': '' }
    });
    adminPin = pin;
    sessionStorage.setItem('templeRideAdminPin', pin);
    form.reset();
    showView('admin');
  } catch (error) {
    showToast(error.message);
  } finally {
    setBusy(button, false);
  }
});

document.querySelector('#admin-logout-button').addEventListener('click', () => {
  adminPin = '';
  sessionStorage.removeItem('templeRideAdminPin');
  showView('member');
  showToast('Admin is locked.');
});

elements.tripForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = Object.fromEntries(new FormData(event.currentTarget));
  const tripId = formData.tripId;
  delete formData.tripId;
  let saved = false;
  try {
    setBusy(elements.tripSubmit, true, tripId ? 'Updating trip…' : 'Posting trip…');
    await api(tripId ? '/api/trips/' + tripId : '/api/trips', {
      method: tripId ? 'PATCH' : 'POST',
      body: JSON.stringify(formData)
    });
    await refreshState();
    saved = true;
    showToast(tripId ? 'Trip updated for everyone.' : 'Trip posted for everyone.');
  } catch (error) {
    showToast(error.message);
  } finally {
    setBusy(elements.tripSubmit, false);
    if (saved) renderAdmin();
  }
});

elements.adminPeopleList.addEventListener('click', async (event) => {
  const removeButton = event.target.closest('[data-remove-person]');
  if (!removeButton || !currentTrip()) return;
  if (!window.confirm('Remove this person from the trip?')) return;
  try {
    setBusy(removeButton, true, 'Removing…');
    const result = await api('/api/trips/' + currentTrip().id + '/people/' + removeButton.dataset.removePerson, {
      method: 'DELETE'
    });
    await refreshState();
    showToast(result.movedToWaitlist
      ? 'Driver removed. ' + result.movedToWaitlist + ' rider(s) moved to the rider list.'
      : 'Person removed.');
  } catch (error) {
    showToast(error.message);
    setBusy(removeButton, false);
  }
});

elements.deleteTripButton.addEventListener('click', async () => {
  const trip = currentTrip();
  if (!trip || !window.confirm('Remove the ' + trip.temple + ' trip and every signup?')) return;
  try {
    setBusy(elements.deleteTripButton, true, 'Removing trip…');
    await api('/api/trips/' + trip.id, { method: 'DELETE' });
    await refreshState();
    showToast('Current trip removed.');
  } catch (error) {
    showToast(error.message);
  } finally {
    setBusy(elements.deleteTripButton, false);
    renderAdmin();
  }
});

setInterval(() => {
  const safeToRefresh = !document.hidden
    && !elements.memberView.hidden
    && elements.driverPanel.hidden
    && !elements.riderDialog.open
    && !elements.carRosterDialog.open
    && elements.seatNamePopover.hidden;
  if (safeToRefresh) refreshState().catch(() => undefined);
}, 10_000);

Promise.all([
  refreshState(),
  api('/api/config').then((config) => {
    if (config.demoAdminPin) {
      document.querySelector('#admin-pin-help').innerHTML = 'The demo PIN is <strong>' + escapeHtml(config.demoAdminPin) + '</strong>.';
    }
  })
]).catch((error) => {
  elements.memberEmpty.hidden = false;
  elements.tripContent.hidden = true;
  elements.memberEmpty.querySelector('h1').textContent = 'The app could not load';
  elements.memberEmpty.querySelector('p').textContent = error.message;
});
