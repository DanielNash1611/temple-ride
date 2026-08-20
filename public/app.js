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
  joinAnyCarButton: document.querySelector('#join-any-car-button'),
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
  riderAssignmentMode: document.querySelector('#rider-assignment-mode'),
  riderSubmit: document.querySelector('#rider-submit'),
  carRosterDialog: document.querySelector('#car-roster-dialog'),
  carRosterHeading: document.querySelector('#car-roster-heading'),
  carRosterContent: document.querySelector('#car-roster-content'),
  rosterJoinButton: document.querySelector('#roster-join-button'),
  rosterRemoveCarButton: document.querySelector('#roster-remove-car-button'),
  toast: document.querySelector('#toast'),
  tripForm: document.querySelector('#trip-form'),
  editTripId: document.querySelector('#edit-trip-id'),
  tripSubmit: document.querySelector('#trip-submit'),
  signupCount: document.querySelector('#signup-count'),
  adminPeopleList: document.querySelector('#admin-people-list'),
  deleteTripButton: document.querySelector('#delete-trip-button'),
  adminChangeLogSection: document.querySelector('#admin-change-log-section'),
  adminChangeLogList: document.querySelector('#admin-change-log-list'),
  editPersonDialog: document.querySelector('#edit-person-dialog'),
  editPersonForm: document.querySelector('#edit-person-form'),
  editPersonId: document.querySelector('#edit-person-id'),
  editPersonType: document.querySelector('#edit-person-type'),
  editPersonNameField: document.querySelector('#edit-person-name-field'),
  editDriverSeatsField: document.querySelector('#edit-driver-seats-field'),
  editDriverSeats: document.querySelector('#edit-driver-seats'),
  editRiderCurrent: document.querySelector('#edit-rider-current'),
  editRiderChangeButton: document.querySelector('#edit-rider-change-button'),
  editRiderDestinationField: document.querySelector('#edit-rider-destination-field'),
  editRiderDestinations: document.querySelector('#edit-rider-destinations'),
  editPersonConfirmationSection: document.querySelector('#edit-person-confirmation-section'),
  editPersonConfirmation: document.querySelector('#edit-person-confirmation'),
  editPersonConfirmationName: document.querySelector('#edit-person-confirmation-name'),
  editPersonSubmit: document.querySelector('#edit-person-submit'),
  editPersonRemoveStart: document.querySelector('#edit-person-remove-start'),
  editPersonRemove: document.querySelector('#edit-person-remove'),
  removePersonDialog: document.querySelector('#remove-person-dialog'),
  removePersonForm: document.querySelector('#remove-person-form'),
  removePersonHeading: document.querySelector('#remove-person-heading'),
  removePersonDescription: document.querySelector('#remove-person-description'),
  removePersonConfirmation: document.querySelector('#remove-person-confirmation'),
  removePersonConfirmationName: document.querySelector('#remove-person-confirmation-name'),
  confirmRemovePerson: document.querySelector('#confirm-remove-person'),
  nameMatchDialog: document.querySelector('#name-match-dialog'),
  nameMatchHeading: document.querySelector('#name-match-heading'),
  nameMatchIntro: document.querySelector('#name-match-intro'),
  nameMatchList: document.querySelector('#name-match-list'),
  nameMatchCarOptions: document.querySelector('#name-match-car-options'),
  nameMatchCarButtons: document.querySelector('#name-match-car-buttons')
};

let state = { version: 3, activeTripId: null, trips: [] };
let adminPin = sessionStorage.getItem('templeRideAdminPin') || '';
let groupView = sessionStorage.getItem('templeRideGroupView') === 'names' ? 'names' : 'seats';
let changeLogEntries = [];
let toastTimer;
let carRosterAnchor = null;
let riderDialogAnchor = null;
let editPersonAnchor = null;
let editPersonManagementMode = false;
let editPersonPendingAction = null;
let pendingRemoval = null;
let pendingNameMatchResolve = null;

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

function formatTimestamp(timestamp) {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  }).format(new Date(timestamp));
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
  if (!response.ok) {
    const error = new Error(payload.error || 'Something went wrong.');
    error.status = response.status;
    Object.assign(error, payload);
    throw error;
  }
  return payload;
}

async function refreshState() {
  state = await api('/api/state');
  renderMember();
  renderAdmin();
  if (adminPin && !elements.adminView.hidden) await refreshChangeLog();
}

async function refreshChangeLog() {
  const trip = currentTrip();
  if (!trip) {
    changeLogEntries = [];
    renderChangeLog();
    return;
  }
  const payload = await api('/api/trips/' + trip.id + '/change-log');
  changeLogEntries = payload.entries;
  renderChangeLog();
}

function findPerson(personId) {
  const trip = currentTrip();
  if (!trip) return null;
  const driver = trip.drivers.find((candidate) => candidate.id === personId);
  if (driver) return { person: driver, personType: 'driver', driver };
  for (const candidateDriver of trip.drivers) {
    const rider = candidateDriver.riders.find((candidate) => candidate.id === personId);
    if (rider) return { person: rider, personType: 'rider', driver: candidateDriver };
  }
  const rider = trip.waitlist.find((candidate) => candidate.id === personId);
  return rider ? { person: rider, personType: 'rider', driver: null } : null;
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
  elements.joinAnyCarButton.disabled = totalOpenSeats === 0;
  elements.joinAnyCarButton.title = totalOpenSeats === 0 ? 'No cars have an open seat right now' : '';
  elements.carList.classList.toggle('names-view', showingNames);
  elements.carList.innerHTML = trip.drivers.length
    ? trip.drivers.map(showingNames ? renderNameGroup : renderVisualCar).join('')
    : renderEmptyCar();

  elements.riderListSection.hidden = trip.waitlist.length === 0;
  elements.riderList.innerHTML = trip.waitlist
    .map((rider) => [
      '<li class="member-person-row">',
      '<span>', escapeHtml(rider.name), '</span>',
      '<span class="member-person-actions">',
      '<button type="button" data-add-to-car="', rider.id, '" aria-label="Add ', escapeHtml(rider.name), ' to a car"',
      totalOpenSeats === 0 ? ' disabled title="No cars have an open seat right now"' : '', '>Add to a car</button>',
      '<button type="button" data-remove-person="', rider.id, '" aria-label="Remove ', escapeHtml(rider.name), '">Remove</button>',
      '</span></li>'
    ].join(''))
    .join('');
}

function renderVisualCar(driver) {
  const remaining = openSeats(driver);
  const passengerSeats = Array.from({ length: driver.seats }, (_, index) => {
    const rider = driver.riders[index];
    if (rider) {
      return [
        '<button class="car-seat taken occupied-seat-button" type="button"',
        ' data-rider-id="', rider.id, '"',
        ' data-tooltip="', escapeHtml(rider.name), '"',
        ' aria-label="', escapeHtml(rider.name), ', passenger. Tap to manage rider.">',
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
        '<strong class="member-person-name">', escapeHtml(rider.name), '</strong>',
        '<span class="member-person-actions">',
        '<button type="button" data-edit-person="', rider.id, '" aria-label="Edit ', escapeHtml(rider.name), '">Edit</button>',
        '<button type="button" data-remove-person="', rider.id, '" aria-label="Remove ', escapeHtml(rider.name), '">Remove</button>',
        '</span></li>'
      ].join('')).join('') + '</ul>'
    : '<p class="no-riders-yet">No riders yet</p>';

  return [
    '<article class="name-car-group" aria-label="People in ', escapeHtml(driver.name), '&apos;s car">',
    '<div class="name-driver-row">',
    '<span class="driver-avatar" aria-hidden="true">', escapeHtml(initials(driver.name)), '</span>',
    '<span><small>Driver</small><strong>', escapeHtml(driver.name), '</strong></span>',
    '<b>', remaining ? remaining + ' open' : 'Full', '</b>',
    '</div>',
    '<div class="driver-member-actions member-person-actions">',
    '<button type="button" data-edit-person="', driver.id, '" aria-label="Edit ', escapeHtml(driver.name), '">Edit driver</button>',
    '<button type="button" data-remove-person="', driver.id, '" aria-label="Remove ', escapeHtml(driver.name), '">Remove driver</button>',
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
      name: driver.name,
      label: driver.name + ' — driver, ' + driver.seats + ' ' + (driver.seats === 1 ? 'seat' : 'seats')
    })),
    ...trip.drivers.flatMap((driver) => driver.riders.map((rider) => ({
      id: rider.id,
      name: rider.name,
      label: rider.name + ' — with ' + driver.name
    }))),
    ...trip.waitlist.map((rider) => ({
      id: rider.id,
      name: rider.name,
      label: rider.name + ' — waiting'
    }))
  ] : [];

  elements.signupCount.textContent = people.length + ' ' + (people.length === 1 ? 'person' : 'people');
  elements.adminPeopleList.innerHTML = people.length
    ? people.map((person) => [
        '<div class="person-row">',
        '<span>', escapeHtml(person.label), '</span>',
        '<button type="button" data-remove-person="', person.id, '" aria-label="Remove ', escapeHtml(person.name), '">Remove</button>',
        '</div>'
      ].join('')).join('')
    : '<p class="admin-empty">No one has signed up yet.</p>';

  elements.adminChangeLogSection.hidden = !trip;
  if (!trip) changeLogEntries = [];
  renderChangeLog();
}

function renderChangeLog() {
  if (!currentTrip()) {
    elements.adminChangeLogList.innerHTML = '';
    return;
  }
  elements.adminChangeLogList.innerHTML = changeLogEntries.length
    ? changeLogEntries.map((entry) => [
        '<li>',
        '<div class="change-log-meta"><time datetime="', escapeHtml(entry.timestamp), '">', escapeHtml(formatTimestamp(entry.timestamp)), '</time>',
        '<span>', entry.actor === 'administrator' ? 'Admin request' : 'Member request', '</span></div>',
        '<strong>', escapeHtml(entry.displayName), '</strong>',
        '<p>', escapeHtml(entry.description), '</p>',
        '</li>'
      ].join('')).join('')
    : '<li class="admin-empty">No recorded changes for this trip yet.</li>';
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
  if (viewName === 'admin') {
    refreshChangeLog().catch((error) => showToast(error.message));
  }
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

function openRiderDialog(driverId = '', driverName = '', { anyCar = false, trigger = null } = {}) {
  const isCarSeat = Boolean(driverId);
  riderDialogAnchor = trigger;
  document.querySelector('#rider-form').reset();
  elements.selectedDriverId.value = driverId;
  elements.riderAssignmentMode.value = anyCar ? 'any' : '';
  elements.riderDialogLabel.textContent = anyCar ? 'Any open seat' : isCarSeat ? 'Open seat' : 'Rider list';
  elements.riderDialogHeading.textContent = anyCar ? 'Join any open car' : isCarSeat ? 'Ride with ' + driverName : 'I need a ride';
  elements.riderSubmit.textContent = anyCar ? 'Join any car' : isCarSeat ? 'Take this seat' : 'Join the rider list';
  elements.riderDialog.showModal();
  requestAnimationFrame(() => document.querySelector('#rider-name').focus());
}

function closeRiderDialog(restoreFocus = true) {
  elements.riderDialog.close();
  if (restoreFocus) riderDialogAnchor?.focus({ preventScroll: true });
  riderDialogAnchor = null;
}

function findDriver(driverId) {
  return currentTrip()?.drivers.find((driver) => driver.id === driverId) || null;
}

function beginRiderConfirmation(action) {
  const found = findPerson(elements.editPersonId.value);
  if (!editPersonManagementMode || !found) return;
  editPersonPendingAction = action;
  elements.editPersonConfirmation.value = '';
  elements.editPersonConfirmationSection.hidden = false;
  elements.editPersonConfirmation.disabled = false;
  elements.editPersonConfirmation.required = true;
  elements.editPersonSubmit.hidden = action !== 'move';
  elements.editPersonSubmit.disabled = true;
  elements.editPersonRemoveStart.hidden = true;
  elements.editPersonRemove.hidden = action !== 'remove';
  elements.editPersonRemove.disabled = true;
  if (action === 'remove') {
    elements.editRiderDestinationField.hidden = true;
    elements.editRiderChangeButton.hidden = true;
  }
  requestAnimationFrame(() => elements.editPersonConfirmation.focus());
}

function revealRiderDestinations() {
  editPersonPendingAction = null;
  elements.editRiderChangeButton.hidden = true;
  elements.editRiderDestinationField.hidden = false;
  elements.editPersonConfirmationSection.hidden = true;
  elements.editPersonConfirmation.disabled = true;
  elements.editPersonConfirmation.required = false;
  elements.editPersonSubmit.hidden = true;
  elements.editPersonRemove.hidden = true;
  elements.editPersonRemoveStart.hidden = false;
  requestAnimationFrame(() => elements.editRiderDestinations.querySelector('input:not(:disabled)')?.focus());
}

function openEditPerson(personId, { manageRider = false, startChoosing = false, trigger = null } = {}) {
  const found = findPerson(personId);
  const trip = currentTrip();
  if (!found || !trip) {
    showToast('That signup is no longer available.');
    return;
  }

  editPersonAnchor = trigger;
  editPersonManagementMode = manageRider && found.personType === 'rider';
  editPersonPendingAction = null;
  elements.editPersonForm.reset();
  elements.editPersonId.value = personId;
  elements.editPersonType.value = found.personType;
  elements.editPersonForm.elements.name.value = found.person.name;
  const isDriver = found.personType === 'driver';
  const requiresRiderConfirmation = !isDriver;
  elements.editPersonNameField.hidden = editPersonManagementMode;
  elements.editPersonForm.elements.name.required = !editPersonManagementMode;
  elements.editDriverSeatsField.hidden = !isDriver;
  elements.editDriverSeats.required = isDriver;
  elements.editRiderCurrent.hidden = !editPersonManagementMode;
  elements.editRiderChangeButton.hidden = !editPersonManagementMode;
  elements.editRiderDestinationField.hidden = isDriver || editPersonManagementMode;
  elements.editPersonConfirmationSection.hidden = !requiresRiderConfirmation || editPersonManagementMode;
  elements.editPersonConfirmation.disabled = !requiresRiderConfirmation || editPersonManagementMode;
  elements.editPersonConfirmation.required = requiresRiderConfirmation && !editPersonManagementMode;
  elements.editPersonConfirmationName.textContent = found.person.name;
  elements.editPersonRemoveStart.hidden = !editPersonManagementMode;
  elements.editPersonRemove.hidden = true;
  elements.editPersonRemove.textContent = 'Remove ' + found.person.name + ' from trip';
  elements.editPersonSubmit.hidden = editPersonManagementMode;
  elements.editPersonSubmit.disabled = requiresRiderConfirmation;
  elements.editPersonRemove.disabled = editPersonManagementMode;

  if (isDriver) {
    elements.editDriverSeats.value = String(found.person.seats);
    document.querySelector('#edit-person-heading').textContent = 'Edit ' + found.person.name + '’s car';
  } else {
    document.querySelector('#edit-person-heading').textContent = editPersonManagementMode
      ? 'Manage ' + found.person.name
      : 'Edit ' + found.person.name;
    elements.editRiderCurrent.textContent = found.driver
      ? 'Currently riding with ' + found.driver.name
      : 'Currently waiting for a seat';
    elements.editRiderChangeButton.textContent = found.driver ? 'Change cars' : 'Add to a car';
    const carOptions = trip.drivers.map((driver) => ({
        id: driver.id,
        name: driver.name + '’s car',
        detail: driver.id === found.driver?.id
          ? 'Current car'
          : openSeats(driver) + ' open ' + (openSeats(driver) === 1 ? 'seat' : 'seats'),
        available: driver.id === found.driver?.id || openSeats(driver) > 0
      }));
    const options = editPersonManagementMode
      ? (found.driver ? [] : [{ id: '__any__', name: 'Join any car', detail: 'We’ll choose an open seat', available: true }])
          .concat(carOptions
          .filter((option) => option.id !== found.driver?.id && option.available)
          .concat(found.driver ? [{ id: '', name: 'Rider list', detail: 'Wait for a seat', available: true }] : []))
      : carOptions.concat([{ id: '', name: 'Rider list', detail: 'Waiting for a seat', available: true }]);
    elements.editRiderDestinations.innerHTML = options.map((option) => [
      '<label class="ride-option">',
      '<input type="radio" name="driverId" value="', option.id, '"',
      option.id === (found.driver?.id || '') ? ' checked' : '',
      option.available ? '' : ' disabled', '>',
      '<span class="ride-option-content"><span class="ride-driver">', escapeHtml(option.name), '</span>',
      '<span class="ride-seats">', escapeHtml(option.available ? option.detail : 'Full'), '</span></span>',
      '</label>'
    ].join('')).join('') || '<p class="form-help">No other cars have an open seat right now.</p>';
  }

  elements.editPersonSubmit.textContent = editPersonManagementMode ? 'Save ride change' : 'Save changes';
  elements.editPersonDialog.showModal();
  if (editPersonManagementMode && startChoosing) {
    revealRiderDestinations();
  } else {
    requestAnimationFrame(() => (requiresRiderConfirmation && !editPersonManagementMode
      ? elements.editPersonConfirmation
      : editPersonManagementMode
        ? elements.editRiderChangeButton
        : elements.editPersonForm.elements.name).focus());
  }
}

function closeEditPerson(restoreFocus = true) {
  elements.editPersonDialog.close();
  if (restoreFocus) editPersonAnchor?.focus({ preventScroll: true });
  editPersonAnchor = null;
  editPersonManagementMode = false;
  editPersonPendingAction = null;
}

function openRemovePerson(personId, trigger) {
  const found = findPerson(personId);
  if (!found) {
    showToast('That signup is no longer available.');
    return;
  }
  pendingRemoval = { personId, trigger, found };
  elements.removePersonHeading.textContent = 'Remove ' + found.person.name + '?';
  elements.removePersonDescription.textContent = found.personType === 'driver'
    ? found.person.name + ' will be removed as a driver. Their ' + found.person.riders.length + ' assigned ' + (found.person.riders.length === 1 ? 'rider' : 'riders') + ' will move to the rider list.'
    : found.person.name + ' will be removed from the current trip.';
  elements.removePersonForm.reset();
  elements.removePersonConfirmationName.textContent = found.person.name;
  elements.confirmRemovePerson.textContent = 'Remove ' + found.person.name;
  elements.confirmRemovePerson.disabled = true;
  elements.removePersonDialog.showModal();
  requestAnimationFrame(() => elements.removePersonConfirmation.focus());
}

function closeRemovePerson() {
  const trigger = pendingRemoval?.trigger;
  pendingRemoval = null;
  elements.removePersonForm.reset();
  elements.confirmRemovePerson.disabled = true;
  elements.removePersonDialog.close();
  trigger?.focus({ preventScroll: true });
}

function normalizedConfirmationName(value) {
  return String(value ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
}

function matchStatus(match) {
  if (match.placement === 'driver') {
    return 'Driving' + (match.openSeats ? ' with ' + match.openSeats + ' open ' + (match.openSeats === 1 ? 'seat' : 'seats') : ' in a full car');
  }
  if (match.placement === 'car') return 'Riding with ' + match.driverName;
  return 'Waiting for a seat';
}

function resolveNameMatch(decision) {
  const resolve = pendingNameMatchResolve;
  pendingNameMatchResolve = null;
  if (elements.nameMatchDialog.open) elements.nameMatchDialog.close();
  resolve?.(decision);
}

function openNameMatchDialog(error, allowCarChoice) {
  const hasExact = error.matches.some((match) => match.matchType === 'exact');
  const hasFamily = error.matches.some((match) => match.matchType === 'family');
  elements.nameMatchHeading.textContent = hasExact ? 'Possible duplicate signup' : 'Possible family-member signup';
  elements.nameMatchIntro.textContent = hasExact && hasFamily
    ? 'This name may duplicate one signup and may match other family members. Review every match before continuing.'
    : hasExact
      ? 'The same normalized name is already on this trip. Confirm that you want another signup.'
      : 'The last name matches someone on this trip. This is only a possible family-member match.';
  elements.nameMatchList.innerHTML = error.matches.map((match) => [
    '<li>',
    '<strong>', escapeHtml(match.name), '</strong>',
    '<span class="match-kind">', match.matchType === 'exact' ? 'Possible duplicate' : 'Possible family member', '</span>',
    '<span>', escapeHtml(matchStatus(match)), '</span>',
    '</li>'
  ].join('')).join('');

  const eligibleCars = allowCarChoice ? error.eligibleCars : [];
  elements.nameMatchCarOptions.hidden = eligibleCars.length === 0;
  elements.nameMatchCarButtons.innerHTML = eligibleCars.map((car) => [
    '<button class="secondary-button" type="button" data-match-driver-id="', car.id, '">Join ', escapeHtml(car.name), '’s car — ',
    car.openSeats, ' open ', car.openSeats === 1 ? 'seat' : 'seats', '</button>'
  ].join('')).join('');

  elements.nameMatchDialog.showModal();
  requestAnimationFrame(() => document.querySelector('#continue-name-match').focus());
  return new Promise((resolve) => {
    pendingNameMatchResolve = resolve;
  });
}

async function saveWithNameReview({ path, method = 'POST', data, allowCarChoice = false, convertDriverToRider = false }) {
  let requestPath = path;
  let requestData = { ...data };
  const confirmedMatchIds = new Set();
  let usedAlternative = false;

  while (true) {
    try {
      const result = await api(requestPath, {
        method,
        body: JSON.stringify({ ...requestData, confirmedMatchIds: [...confirmedMatchIds] })
      });
      return { result, usedAlternative };
    } catch (error) {
      if (error.code !== 'NAME_MATCH_CONFIRMATION_REQUIRED') throw error;
      const reviewError = {
        ...error,
        eligibleCars: (error.eligibleCars || []).filter((car) => car.id !== requestData.driverId)
      };
      const decision = await openNameMatchDialog(reviewError, allowCarChoice);
      if (!decision) return null;
      error.matches.forEach((match) => confirmedMatchIds.add(match.id));
      if (decision.driverId) {
        requestData.driverId = decision.driverId;
        delete requestData.assignmentMode;
        usedAlternative = true;
        if (convertDriverToRider) {
          requestPath = requestPath.replace(/\/drivers$/, '/riders');
          delete requestData.seats;
        }
      }
    }
  }
}

function openCarRoster(driverId, trigger) {
  const driver = findDriver(driverId);
  if (!driver) return;
  carRosterAnchor = trigger;
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
  elements.rosterRemoveCarButton.dataset.driverId = driver.id;
  elements.rosterRemoveCarButton.setAttribute('aria-label', 'Remove ' + driver.name + '’s car');
  elements.carRosterDialog.showModal();
}

function closeCarRoster(restoreFocus = true) {
  elements.carRosterDialog.close();
  if (restoreFocus) carRosterAnchor?.focus({ preventScroll: true });
  carRosterAnchor = null;
}

document.querySelector('#home-button').addEventListener('click', () => showView('member'));
document.querySelector('#admin-button').addEventListener('click', () => showView(adminPin ? 'admin' : 'login'));
document.querySelector('#empty-admin-button').addEventListener('click', () => showView(adminPin ? 'admin' : 'login'));
document.querySelectorAll('[data-go-home]').forEach((button) => button.addEventListener('click', () => showView('member')));
document.querySelectorAll('[data-close-panel]').forEach((button) => button.addEventListener('click', closeDriverPanel));
elements.driveButton.addEventListener('click', openDriverPanel);
elements.joinAnyCarButton.addEventListener('click', () => openRiderDialog('', '', {
  anyCar: true,
  trigger: elements.joinAnyCarButton
}));
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
  const editButton = event.target.closest('[data-edit-person]');
  if (editButton) {
    openEditPerson(editButton.dataset.editPerson);
    return;
  }
  const removeButton = event.target.closest('[data-remove-person]');
  if (removeButton) {
    openRemovePerson(removeButton.dataset.removePerson, removeButton);
    return;
  }
  const occupiedSeat = event.target.closest('[data-rider-id]');
  if (occupiedSeat) {
    openEditPerson(occupiedSeat.dataset.riderId, { manageRider: true, trigger: occupiedSeat });
    return;
  }
  const openSeat = event.target.closest('[data-driver-id]');
  if (openSeat) {
    openRiderDialog(openSeat.dataset.driverId, openSeat.dataset.driverName);
    return;
  }
  const carHeading = event.target.closest('[data-show-car-id]');
  if (carHeading) {
    openCarRoster(carHeading.dataset.showCarId, carHeading);
    return;
  }
  if (event.target.closest('[data-open-driver-form]')) openDriverPanel();
});

elements.riderList.addEventListener('click', (event) => {
  const addToCarButton = event.target.closest('[data-add-to-car]');
  if (addToCarButton) {
    openEditPerson(addToCarButton.dataset.addToCar, {
      manageRider: true,
      startChoosing: true,
      trigger: addToCarButton
    });
  }
  const removeButton = event.target.closest('[data-remove-person]');
  if (removeButton) openRemovePerson(removeButton.dataset.removePerson, removeButton);
});

document.querySelector('#close-rider-dialog').addEventListener('click', closeRiderDialog);
elements.riderDialog.addEventListener('click', (event) => {
  if (event.target === elements.riderDialog) closeRiderDialog();
});
elements.riderDialog.addEventListener('cancel', (event) => {
  event.preventDefault();
  closeRiderDialog();
});
document.querySelector('#close-car-roster').addEventListener('click', () => closeCarRoster());
elements.carRosterDialog.addEventListener('click', (event) => {
  if (event.target === elements.carRosterDialog) closeCarRoster();
});
elements.carRosterDialog.addEventListener('cancel', (event) => {
  event.preventDefault();
  closeCarRoster();
});
document.querySelector('#close-edit-person').addEventListener('click', () => closeEditPerson());
elements.editPersonDialog.addEventListener('click', (event) => {
  if (event.target === elements.editPersonDialog) closeEditPerson();
});
elements.editPersonDialog.addEventListener('cancel', (event) => {
  event.preventDefault();
  closeEditPerson();
});
document.querySelector('#close-remove-person').addEventListener('click', closeRemovePerson);
document.querySelector('#cancel-remove-person').addEventListener('click', closeRemovePerson);
elements.removePersonDialog.addEventListener('cancel', (event) => {
  event.preventDefault();
  closeRemovePerson();
});
elements.removePersonConfirmation.addEventListener('input', () => {
  const expectedName = pendingRemoval?.found.person.name;
  elements.confirmRemovePerson.disabled = !expectedName
    || normalizedConfirmationName(elements.removePersonConfirmation.value) !== normalizedConfirmationName(expectedName);
});
document.querySelector('#close-name-match').addEventListener('click', () => resolveNameMatch(null));
document.querySelector('#cancel-name-match').addEventListener('click', () => resolveNameMatch(null));
document.querySelector('#continue-name-match').addEventListener('click', () => resolveNameMatch({}));
elements.nameMatchCarButtons.addEventListener('click', (event) => {
  const button = event.target.closest('[data-match-driver-id]');
  if (button) resolveNameMatch({ driverId: button.dataset.matchDriverId });
});
elements.nameMatchDialog.addEventListener('cancel', (event) => {
  event.preventDefault();
  resolveNameMatch(null);
});
elements.rosterJoinButton.addEventListener('click', () => {
  const { driverId, driverName } = elements.rosterJoinButton.dataset;
  closeCarRoster(false);
  openRiderDialog(driverId, driverName);
});
elements.rosterRemoveCarButton.addEventListener('click', () => {
  const driverId = elements.rosterRemoveCarButton.dataset.driverId;
  const returnFocusTo = carRosterAnchor;
  closeCarRoster(false);
  openRemovePerson(driverId, returnFocusTo);
});
elements.editRiderChangeButton.addEventListener('click', revealRiderDestinations);
elements.editRiderDestinations.addEventListener('change', (event) => {
  if (editPersonManagementMode && event.target.matches('input[name="driverId"]')) {
    beginRiderConfirmation('move');
  }
});
elements.editPersonRemoveStart.addEventListener('click', () => beginRiderConfirmation('remove'));
elements.editPersonConfirmation.addEventListener('input', () => {
  const found = findPerson(elements.editPersonId.value);
  const confirmed = Boolean(found)
    && normalizedConfirmationName(elements.editPersonConfirmation.value) === normalizedConfirmationName(found.person.name);
  elements.editPersonSubmit.disabled = editPersonManagementMode && editPersonPendingAction !== 'move' ? true : !confirmed;
  elements.editPersonRemove.disabled = editPersonPendingAction !== 'remove' || !confirmed;
});

document.querySelector('#driver-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type=submit]');
  try {
    setBusy(button, true, 'Adding car…');
    const saved = await saveWithNameReview({
      path: '/api/trips/' + currentTrip().id + '/drivers',
      data: Object.fromEntries(new FormData(form)),
      allowCarChoice: true,
      convertDriverToRider: true
    });
    if (!saved) return;
    form.reset();
    closeDriverPanel();
    await refreshState();
    showToast(saved.usedAlternative
      ? 'You’re riding with ' + saved.result.driverName + '.'
      : 'Your car is ready for riders.');
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
    const saved = await saveWithNameReview({
      path: '/api/trips/' + currentTrip().id + '/riders',
      data: Object.fromEntries(new FormData(form)),
      allowCarChoice: true
    });
    if (!saved) return;
    closeRiderDialog(false);
    await refreshState();
    showToast(saved.result.placement === 'car' ? 'You’re riding with ' + saved.result.driverName + '.' : 'You’re on the rider list.');
  } catch (error) {
    closeRiderDialog(false);
    await refreshState().catch(() => undefined);
    showToast(error.message);
  } finally {
    setBusy(button, false);
  }
});

elements.editPersonForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (editPersonManagementMode && editPersonPendingAction !== 'move') return;
  const formData = Object.fromEntries(new FormData(event.currentTarget));
  const personId = formData.personId;
  const personType = formData.personType;
  delete formData.personId;
  delete formData.personType;
  if (formData.driverId === '__any__') {
    delete formData.driverId;
    formData.assignmentMode = 'any';
  }
  try {
    setBusy(elements.editPersonSubmit, true, 'Saving changes…');
    const saved = await saveWithNameReview({
      path: '/api/trips/' + currentTrip().id + '/people/' + personId,
      method: 'PATCH',
      data: formData,
      allowCarChoice: personType === 'rider'
    });
    if (!saved) return;
    closeEditPerson(false);
    await refreshState();
    showToast(saved.result.personType === 'driver'
      ? 'Driver updated for everyone.'
      : saved.result.placement === 'car'
        ? saved.result.name + ' is riding with ' + saved.result.driverName + '.'
        : saved.result.name + ' is on the rider list.');
  } catch (error) {
    showToast(error.message);
  } finally {
    setBusy(elements.editPersonSubmit, false);
  }
});

elements.editPersonRemove.addEventListener('click', async () => {
  const personId = elements.editPersonId.value;
  const found = findPerson(personId);
  if (!editPersonManagementMode || editPersonPendingAction !== 'remove' || !found || !currentTrip()) return;
  try {
    setBusy(elements.editPersonRemove, true, 'Removing…');
    await api('/api/trips/' + currentTrip().id + '/people/' + personId, {
      method: 'DELETE',
      body: JSON.stringify({ confirmationName: elements.editPersonConfirmation.value })
    });
    closeEditPerson(false);
    await refreshState();
    showToast(found.person.name + ' removed from the trip.');
  } catch (error) {
    await refreshState().catch(() => undefined);
    showToast(error.message);
  } finally {
    setBusy(elements.editPersonRemove, false);
    const current = findPerson(personId);
    const confirmed = Boolean(current)
      && normalizedConfirmationName(elements.editPersonConfirmation.value) === normalizedConfirmationName(current.person.name);
    elements.editPersonRemove.disabled = editPersonPendingAction !== 'remove' || !confirmed;
    elements.editPersonSubmit.disabled = editPersonPendingAction !== 'move' || !confirmed;
  }
});

elements.removePersonForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const removal = pendingRemoval;
  if (!removal || !currentTrip()) return;
  try {
    setBusy(elements.confirmRemovePerson, true, 'Removing…');
    const result = await api('/api/trips/' + currentTrip().id + '/people/' + removal.personId, {
      method: 'DELETE',
      body: JSON.stringify({ confirmationName: elements.removePersonConfirmation.value })
    });
    closeRemovePerson();
    await refreshState();
    showToast(result.movedToWaitlist
      ? 'Driver removed. ' + result.movedToWaitlist + ' rider(s) moved to the rider list.'
      : removal.found.person.name + ' removed.');
  } catch (error) {
    await refreshState().catch(() => undefined);
    showToast(error.message);
  } finally {
    setBusy(elements.confirmRemovePerson, false);
    const expectedName = pendingRemoval?.found.person.name;
    elements.confirmRemovePerson.disabled = !expectedName
      || normalizedConfirmationName(elements.removePersonConfirmation.value) !== normalizedConfirmationName(expectedName);
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
  openRemovePerson(removeButton.dataset.removePerson, removeButton);
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
    && !elements.editPersonDialog.open
    && !elements.removePersonDialog.open
    && !elements.nameMatchDialog.open;
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
