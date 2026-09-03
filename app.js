const TIME_ZONE = 'Asia/Kolkata';
const INITIAL_RANGE_START = '2026-09-01';

const MONTH_FORMATTER = new Intl.DateTimeFormat('en-IN', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});
const WEEKDAY_FORMATTER = new Intl.DateTimeFormat('en-IN', {
  weekday: 'short',
  timeZone: 'UTC',
});
const FULL_WEEKDAY_FORMATTER = new Intl.DateTimeFormat('en-IN', {
  weekday: 'long',
  timeZone: 'UTC',
});
const TIME_FORMATTER = new Intl.DateTimeFormat('en-IN', {
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
  timeZone: 'UTC',
});

const dom = {};
let appState = null;
let statusTimer = null;
let drawerCloseTimer = null;
let menuCloseTimer = null;

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  })[character]);
}

function safeUrl(value) {
  if (!value || typeof value !== 'string') return '';

  try {
    const url = new URL(value, window.location.href);
    if (url.protocol === 'https:' || url.protocol === 'http:' || url.protocol === 'mailto:') {
      return url.href;
    }
  } catch (error) {
    console.warn('[Ritmo] Ignoring invalid URL:', value);
  }

  return '';
}

function parseMumbaiDateTime(value) {
  if (typeof value !== 'string') return null;

  const match = value.match(
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?/
  );
  if (!match) return null;

  const [, year, month, day, hour, minute, second = '0'] = match;
  const date = new Date(Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second)
  ));

  return Number.isNaN(date.getTime()) ? null : date;
}

function getMumbaiNow() {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: TIME_ZONE,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(new Date())
      .filter(({ type }) => type !== 'literal')
      .map(({ type, value }) => [type, value])
  );

  return new Date(Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  ));
}

function getDateKey(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, '0'),
    String(date.getUTCDate()).padStart(2, '0'),
  ].join('-');
}

function dateKeyToDate(dateKey) {
  const [year, month, day] = String(dateKey).split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
}

function addDays(dateKey, amount) {
  const date = dateKeyToDate(dateKey);
  date.setUTCDate(date.getUTCDate() + amount);
  return getDateKey(date);
}

function addMonths(dateKey, amount) {
  const date = dateKeyToDate(getMonthStartKey(dateKey));
  date.setUTCMonth(date.getUTCMonth() + amount, 1);
  return getDateKey(date);
}

function getMonthStartKey(dateKey) {
  const [year, month] = String(dateKey).split('-');
  return `${year}-${month}-01`;
}

function getMonthDates(monthStartKey) {
  const monthStart = dateKeyToDate(getMonthStartKey(monthStartKey));
  const nextMonthStart = new Date(Date.UTC(
    monthStart.getUTCFullYear(),
    monthStart.getUTCMonth() + 1,
    1,
    12,
    0,
    0
  ));
  const dayCount = Math.round((nextMonthStart.getTime() - monthStart.getTime()) / 86400000);

  return Array.from({ length: dayCount }, (_, index) => addDays(getMonthStartKey(monthStartKey), index));
}

function formatMonthLabel(dateKey) {
  return MONTH_FORMATTER.format(dateKeyToDate(dateKey));
}

function formatWeekday(date) {
  return WEEKDAY_FORMATTER.format(date).replace('.', '');
}

function formatFullWeekday(date) {
  return FULL_WEEKDAY_FORMATTER.format(date).replace('.', '');
}

function formatTime(date) {
  return TIME_FORMATTER.format(date).replace(/\s+/g, ' ').toUpperCase();
}

function formatDateHeading(dateKey) {
  const date = dateKeyToDate(dateKey);
  return `${formatWeekday(date)} ${date.getUTCDate()} ${date.toLocaleDateString('en-IN', {
    month: 'short',
    timeZone: 'UTC',
  })}`;
}

function formatFullDate(date) {
  return `${formatFullWeekday(date)}, ${date.toLocaleDateString('en-IN', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })}`;
}

function formatDayGroup(dateKey) {
  const date = dateKeyToDate(dateKey);
  return {
    weekday: formatWeekday(date),
    day: String(date.getUTCDate()).padStart(2, '0'),
    month: date.toLocaleDateString('en-IN', { month: 'long', timeZone: 'UTC' }),
  };
}

function formatDateCellLabel(dateKey, eventCount) {
  const date = dateKeyToDate(dateKey);
  const countLabel = eventCount === 0
    ? 'no events'
    : `${eventCount} ${eventCount === 1 ? 'event' : 'events'}`;
  return `${formatFullWeekday(date)}, ${date.toLocaleDateString('en-IN', {
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  })}, ${countLabel}`;
}


function formatEndTime(date) {
  return `ends ${formatWeekday(date)} ${formatTime(date)}`;
}

function formatTimeRange(event) {
  const startLabel = formatTime(event.startDate);
  if (!event.endDate) return startLabel;

  const endLabel = formatTime(event.endDate);
  return getDateKey(event.startDate) === getDateKey(event.endDate)
    ? `${startLabel}–${endLabel}`
    : `${startLabel}–${formatWeekday(event.endDate)} ${endLabel}`;
}

function formatCurrencyAmount(amount, currency = '₹') {
  const number = Number(String(amount).replace(/,/g, '').trim());
  if (!Number.isFinite(number)) return `${currency}${escapeHtml(amount)}`;
  return `${currency}${new Intl.NumberFormat('en-IN').format(number)}`;
}

function formatCost(cost, currency = '₹') {
  if (cost === null || cost === undefined || String(cost).trim() === '') return '';

  const source = String(cost).trim();
  if (/^contact host$/i.test(source)) return 'Contact host';

  const range = source.match(/^(\d[\d,]*)\s*-\s*(\d[\d,]*)$/);
  if (range) {
    return `${currency}${new Intl.NumberFormat('en-IN').format(Number(range[1].replace(/,/g, '')))}–${new Intl.NumberFormat('en-IN').format(Number(range[2].replace(/,/g, '')))}`;
  }

  const labelled = source
    .split('|')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const match = item.match(/^(.+?):\s*(\d[\d,]*)$/);
      return match
        ? `${match[1].trim()} ${formatCurrencyAmount(match[2], currency)}`
        : item;
    });

  const parenthesized = labelled.join(' | ').replace(
    /(\d[\d,]*)\s*\(([^)]+)\)/g,
    (_, amount, label) => `${label.trim()} ${formatCurrencyAmount(amount, currency)}`
  );

  if (parenthesized !== source) {
    return parenthesized.replace(/\s*\|\s*/g, ' · ').replace(/,\s*/g, ' · ');
  }

  if (/^\d[\d,]*$/.test(source)) return formatCurrencyAmount(source, currency);
  return escapeHtml(source);
}

function splitDanceStyles(value) {
  if (!value || typeof value !== 'string') return [];
  return value
    .split(/\s*(?:•|·|\|)\s*/)
    .map((style) => style.trim())
    .filter(Boolean);
}

function getStatus(event, now = getMumbaiNow()) {
  if (event.cancelled) return 'cancelled';

  if (event.endMs && now.getTime() >= event.startMs && now.getTime() <= event.endMs) {
    return 'live';
  }

  const minutesUntilStart = (event.startMs - now.getTime()) / 60000;
  if (minutesUntilStart > 0 && minutesUntilStart <= 30) return 'upcoming';

  return '';
}

function prepareEvent(rawEvent, index) {
  const startDate = parseMumbaiDateTime(rawEvent.start_date_time);
  if (!startDate) {
    throw new Error(`Event ${index + 1} has an invalid start_date_time.`);
  }

  const endDate = rawEvent.end_date_time ? parseMumbaiDateTime(rawEvent.end_date_time) : null;
  const styles = splitDanceStyles(rawEvent.dance_styles);
  const searchableText = [
    rawEvent.title,
    rawEvent.venue,
    rawEvent.organizer_name,
    rawEvent.event_type,
    rawEvent.dance_styles,
    rawEvent.summary,
    rawEvent.theme,
  ]
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase('en-IN');

  return {
    ...rawEvent,
    id: String(rawEvent.id || `event-${index + 1}`),
    dateKey: getDateKey(startDate),
    startDate,
    endDate,
    startMs: startDate.getTime(),
    endMs: endDate ? endDate.getTime() : 0,
    styles,
    searchableText,
  };
}

async function loadEvents(url = 'events.json') {
  const response = await fetch(url, { cache: 'no-cache' });
  if (!response.ok) throw new Error(`Events request failed with ${response.status}.`);

  const data = await response.json();
  if (!data || !Array.isArray(data.events)) {
    throw new Error('The events file does not contain an events array.');
  }

  return data.events
    .map(prepareEvent)
    .sort((first, second) => first.startMs - second.startMs);
}

function getUniqueValues(events, key) {
  return [...new Set(events.flatMap((event) => {
    if (key === 'dance_styles') return event.styles;
    return event[key] ? [event[key]] : [];
  }))].sort((first, second) => first.localeCompare(second));
}

function matchesFilters(event) {
  const query = appState.searchQuery.trim().toLocaleLowerCase('en-IN');
  const matchesSearch = !query || event.searchableText.includes(query);
  const matchesType = !appState.selectedEventTypes.size
    || appState.selectedEventTypes.has(event.event_type);
  const matchesStyle = !appState.selectedDanceStyles.size
    || event.styles.some((style) => appState.selectedDanceStyles.has(style));

  return matchesSearch && matchesType && matchesStyle;
}

function getFilteredEvents() {
  return appState.events.filter(matchesFilters);
}

function getMonthEvents(events = getFilteredEvents()) {
  const monthStart = getMonthStartKey(appState.rangeStartKey);
  const nextMonthStart = addMonths(monthStart, 1);
  return events.filter((event) => event.dateKey >= monthStart && event.dateKey < nextMonthStart);
}


function getAdjacentEventMonth(monthStartKey, direction) {
  const currentMonthStart = getMonthStartKey(monthStartKey);
  const eventMonths = [...new Set(appState.events.map((event) => getMonthStartKey(event.dateKey)))].sort();
  const currentIndex = eventMonths.indexOf(currentMonthStart);

  if (currentIndex !== -1) {
    return eventMonths[currentIndex + direction] || '';
  }

  return direction < 0
    ? [...eventMonths].reverse().find((month) => month < currentMonthStart) || ''
    : eventMonths.find((month) => month > currentMonthStart) || '';
}

function getFirstEventDateInMonth(monthStartKey) {
  const monthEvents = appState.events
    .filter((event) => event.dateKey >= monthStartKey && event.dateKey < addMonths(monthStartKey, 1))
    .sort((first, second) => first.startMs - second.startMs);

  return monthEvents[0]?.dateKey || monthStartKey;
}

function getActiveFilterCount() {
  return appState.selectedEventTypes.size + appState.selectedDanceStyles.size;
}

function getElementIdForEvent(eventId) {
  return `event-card-${String(eventId).replace(/[^a-z0-9_-]/gi, '-')}`;
}

function getStatusMarkup(event) {
  const status = getStatus(event, appState.now);
  if (!status) return '';

  const labels = {
    live: 'Live',
    upcoming: 'Upcoming',
    cancelled: 'Cancelled',
  };

  return `<span class="status status-${status}">${labels[status]}</span>`;
}

function renderDateStrip() {
  const filteredEvents = getFilteredEvents();
  const monthStart = getMonthStartKey(appState.rangeStartKey);
  const dates = getMonthDates(monthStart);

  dom.dateStrip.innerHTML = dates.map((dateKey) => {
    const eventCount = filteredEvents.filter((event) => event.dateKey === dateKey).length;
    const isSelected = dateKey === appState.selectedDateKey;
    const ticks = eventCount
      ? `<span class="date-ticks" aria-hidden="true">${Array.from({ length: Math.min(eventCount, 2) }, () => '<i></i>').join('')}</span>`
      : '';

    return `
      <button
        class="date-cell${isSelected ? ' is-selected' : ''}${eventCount ? ' has-events' : ''}"
        type="button"
        data-action="select-date"
        data-date-key="${dateKey}"
        aria-label="${escapeHtml(formatDateCellLabel(dateKey, eventCount))}"
        ${isSelected ? 'aria-current="date"' : ''}
      >
        <span class="date-weekday">${escapeHtml(formatWeekday(dateKeyToDate(dateKey)))}</span>
        <strong class="date-number">${dateKey.slice(-2)}</strong>
        ${ticks}
      </button>
    `;
  }).join('');

  const previousMonthStart = getAdjacentEventMonth(monthStart, -1);
  const nextMonthStart = getAdjacentEventMonth(monthStart, 1);
  const hasPreviousMonth = Boolean(previousMonthStart);
  const hasNextMonth = Boolean(nextMonthStart);

  dom.rangePrev.hidden = !hasPreviousMonth;
  dom.rangeNext.hidden = !hasNextMonth;
  dom.rangePrev.disabled = !hasPreviousMonth;
  dom.rangeNext.disabled = !hasNextMonth;
  dom.rangePrev.setAttribute('aria-disabled', String(!hasPreviousMonth));
  dom.rangeNext.setAttribute('aria-disabled', String(!hasNextMonth));
  if (hasPreviousMonth) {
    dom.rangePrev.setAttribute('aria-label', `Previous month with events, ${formatMonthLabel(previousMonthStart)}`);
    dom.rangePrev.title = dom.rangePrev.getAttribute('aria-label');
  }
  if (hasNextMonth) {
    dom.rangeNext.setAttribute('aria-label', `Next month with events, ${formatMonthLabel(nextMonthStart)}`);
    dom.rangeNext.title = dom.rangeNext.getAttribute('aria-label');
  }
  dom.monthLabel.textContent = formatMonthLabel(monthStart);
  dom.monthIndex.textContent = monthStart.slice(5, 7) + ' / ' + monthStart.slice(0, 4);
}

function renderFilterTray() {
  const eventTypes = getUniqueValues(appState.events, 'event_type');
  const danceStyles = getUniqueValues(appState.events, 'dance_styles');
  const selectedCount = getMonthEvents().filter((event) => event.dateKey === appState.selectedDateKey).length;

  dom.filtersToggle.setAttribute('aria-expanded', String(appState.filtersOpen));
  dom.filterTray.hidden = !appState.filtersOpen;

  if (!appState.filtersOpen) {
    dom.filterTray.innerHTML = '';
    return;
  }

  const renderCheckboxes = (values, group, selectedValues) => values.map((value) => {
    const checked = selectedValues.has(value);
    return `
      <label class="filter-option">
        <input
          type="checkbox"
          value="${escapeHtml(value)}"
          data-filter-group="${group}"
          ${checked ? 'checked' : ''}
        />
        <span class="custom-check" aria-hidden="true"><i class="ti ti-check"></i></span>
        <span>${escapeHtml(value)}</span>
      </label>
    `;
  }).join('');

  dom.filterTray.innerHTML = `
    <div class="filter-tray-inner">
      <div class="filter-groups">
        <fieldset class="filter-group">
          <legend>Event type</legend>
          <div class="filter-options">${renderCheckboxes(eventTypes, 'event_type', appState.selectedEventTypes)}</div>
        </fieldset>
        <fieldset class="filter-group filter-group-styles">
          <legend>Dance style</legend>
          <div class="filter-options">${renderCheckboxes(danceStyles, 'dance_style', appState.selectedDanceStyles)}</div>
        </fieldset>
      </div>
      <div class="filter-actions">
        <button class="text-action" type="button" data-action="clear-filters">Clear filters</button>
        <button class="solid-action" type="button" data-action="close-filters">Show ${selectedCount} ${selectedCount === 1 ? 'event' : 'events'}</button>
      </div>
    </div>
  `;
}

function renderEventTicket(event) {
  const selected = event.id === appState.selectedEventId;
  const cancelled = Boolean(event.cancelled);
  const ticketLabel = [
    event.title,
    event.venue ? `at ${event.venue}` : '',
    formatTimeRange(event),
    cancelled ? 'Cancelled' : '',
  ].filter(Boolean).join(', ');

  return `
    <button
      class="event-ticket${selected ? ' is-selected' : ''}${cancelled ? ' is-cancelled' : ''}"
      id="${getElementIdForEvent(event.id)}"
      type="button"
      data-action="select-event"
      data-event-id="${escapeHtml(event.id)}"
      aria-pressed="${selected}"
      aria-label="${escapeHtml(ticketLabel)}"
    >
      <span class="ticket-time">
        <span class="time-primary${cancelled ? ' is-struck' : ''}">${escapeHtml(formatTime(event.startDate))}</span>
        ${event.endDate ? `<span class="time-end${cancelled ? ' is-struck' : ''}">${escapeHtml(formatEndTime(event.endDate))}</span>` : ''}
      </span>
      <span class="ticket-content">
        <span class="ticket-title-row">
          <span class="ticket-title">${cancelled ? '<span class="cancelled-prefix">Cancelled</span> ' : ''}${escapeHtml(event.title)}</span>
          ${getStatusMarkup(event)}
          <i class="ti ti-arrow-right ticket-arrow" aria-hidden="true"></i>
        </span>
        ${event.venue ? `<span class="ticket-venue"><i class="ti ti-map-pin" aria-hidden="true"></i><span>${escapeHtml(event.venue)}</span></span>` : ''}
      </span>
      <span class="timeline-stop${cancelled ? ' is-cancelled' : ''}" aria-hidden="true"></span>
    </button>
  `;
}

function renderDateGroup(dateKey, events) {
  const group = formatDayGroup(dateKey);
  return `
    <section class="date-group" id="date-group-${dateKey}" aria-labelledby="heading-${dateKey}">
      <div class="date-marker">
        <span>${escapeHtml(group.weekday)}</span>
        <strong id="heading-${dateKey}">${escapeHtml(group.day)}</strong>
        <small>${escapeHtml(group.month)}</small>
      </div>
      <div class="date-group-events">
        ${events.map(renderEventTicket).join('')}
      </div>
    </section>
  `;
}

function renderEmptyDateState(filteredEvents) {
  const nextEvent = filteredEvents.find((event) => event.dateKey > appState.selectedDateKey);
  const selectedLabel = formatDateHeading(appState.selectedDateKey);
  const nextAction = nextEvent
    ? `
      <p>The next listed event is <strong>${escapeHtml(nextEvent.title)}</strong> on ${escapeHtml(formatDateHeading(nextEvent.dateKey))}.</p>
      <button class="text-action" type="button" data-action="select-date" data-date-key="${nextEvent.dateKey}">Go to ${escapeHtml(formatDateHeading(nextEvent.dateKey))}</button>
    `
    : '<p>There are no later events in the current calendar range.</p>';

  return `
    <div class="state-panel empty-date-state">
      <p class="state-kicker">No events listed for ${escapeHtml(selectedLabel)}.</p>
      ${nextAction}
    </div>
  `;
}

function renderNoMatchState() {
  return `
    <div class="state-panel no-match-state">
      <p class="state-kicker">No events match these filters.</p>
      <p>Try another dance style or clear the current filters.</p>
      <button class="text-action" type="button" data-action="clear-filters">Clear filters</button>
    </div>
  `;
}

function renderTimeline() {
  if (appState.loadState === 'loading') {
    dom.resultCount.textContent = 'Loading events…';
    dom.resultAnnouncement.textContent = 'Loading events…';
    dom.timelineStatus.innerHTML = '';
    dom.timeline.innerHTML = `
      <span class="sr-only">Loading events…</span>
      <div class="timeline-skeleton" aria-hidden="true">
        <div class="skeleton-date"></div>
        <div class="skeleton-ticket"></div>
        <div class="skeleton-ticket"></div>
        <div class="skeleton-ticket"></div>
      </div>
    `;
    return;
  }

  if (appState.loadState === 'error') {
    dom.resultCount.textContent = 'Unavailable';
    dom.resultAnnouncement.textContent = 'Events could not be loaded.';
    dom.timelineStatus.innerHTML = `
      <div class="state-panel error-state">
        <p class="state-kicker">Events couldn’t be loaded.</p>
        <p>Check the local data file and try again.</p>
        <button class="solid-action" type="button" data-action="retry">Try again</button>
      </div>
    `;
    dom.timeline.innerHTML = '';
    return;
  }

  const filteredEvents = getFilteredEvents();
  const monthEvents = getMonthEvents(filteredEvents);
  const selectedEvents = monthEvents.filter((event) => event.dateKey === appState.selectedDateKey);
  const activeSearchOrFilters = Boolean(
    appState.searchQuery.trim() || getActiveFilterCount()
  );
  const selectedDateLabel = formatDateHeading(appState.selectedDateKey);

  dom.resultCount.textContent = `${selectedEvents.length} ${selectedEvents.length === 1 ? 'event' : 'events'} · ${selectedDateLabel}`;
  dom.resultAnnouncement.textContent = `${selectedEvents.length} ${selectedEvents.length === 1 ? 'event' : 'events'} shown for ${selectedDateLabel}.`;

  if (!selectedEvents.length) {
    dom.timelineStatus.innerHTML = !monthEvents.length && activeSearchOrFilters
      ? renderNoMatchState()
      : renderEmptyDateState(filteredEvents);
    dom.timeline.innerHTML = '';
    return;
  }

  dom.timelineStatus.innerHTML = '';

  const groupedEvents = selectedEvents.reduce((groups, event) => {
    if (!groups.has(event.dateKey)) groups.set(event.dateKey, []);
    groups.get(event.dateKey).push(event);
    return groups;
  }, new Map());

  dom.timeline.innerHTML = [...groupedEvents.entries()]
    .map(([dateKey, events]) => renderDateGroup(dateKey, events))
    .join('');
}

function renderInfoRow(label, value) {
  if (!value) return '';
  return `
    <div class="detail-row">
      <dt>${escapeHtml(label)}</dt>
      <dd>${value}</dd>
    </div>
  `;
}

function renderDetailPanel(event, mode) {
  const isDrawer = mode === 'drawer';
  const headingId = `${mode}-title`;
  const status = getStatus(event, appState.now);
  const venueUrl = safeUrl(event.venue_url);
  const organizerUrl = safeUrl(event.organizer_url);
  const postUrl = safeUrl(event.post_url);
  const bannerUrl = safeUrl(event.banner_url);
  const styles = event.styles.length ? event.styles.join(' · ') : '';
  const cost = formatCost(event.cost, event.currency);
  const externalLabel = ' (opens in a new tab)';

  return `
    <div class="detail-panel-shell${isDrawer && appState.drawerExpanded ? ' is-expanded' : ''}">
      ${isDrawer ? '<button class="drawer-handle" type="button" data-action="toggle-drawer" aria-label="Expand event details"><span></span></button>' : ''}
      <div class="detail-topbar">
        <button class="detail-close" type="button" data-action="close-details" aria-label="Close event details"><i class="ti ti-x" aria-hidden="true"></i></button>
        <span class="detail-topline">${escapeHtml(formatFullDate(event.startDate))} · ${escapeHtml(formatTimeRange(event))}</span>
        <span class="detail-type">${escapeHtml(event.event_type || 'Event')}</span>
      </div>
      <div class="detail-scroll">
        ${bannerUrl ? `
          <details class="detail-banner" open>
            <summary>View event poster <i class="ti ti-chevron-down" aria-hidden="true"></i></summary>
            <img src="${escapeHtml(bannerUrl)}" alt="${escapeHtml(event.title)} event poster" loading="lazy" />
          </details>
        ` : ''}
        <div class="detail-heading-block">
          <div class="detail-status-line">
            <span class="detail-kicker">${escapeHtml(event.event_type || 'Event')}</span>
            ${status ? `<span class="status status-${status}">${status === 'live' ? 'Live' : status === 'upcoming' ? 'Upcoming' : 'Cancelled'}</span>` : ''}
          </div>
          <h2 id="${headingId}" tabindex="-1">${cancelledTitle(event)}</h2>
          ${event.summary ? `<p class="detail-summary">${escapeHtml(event.summary)}</p>` : ''}
        </div>
        <dl class="detail-list">
          ${renderInfoRow('Time', `<span class="mono-value">${escapeHtml(formatTimeRange(event))}</span>`)}
          ${renderInfoRow('Venue', event.venue
            ? venueUrl
              ? `<a href="${escapeHtml(venueUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(event.venue)} <i class="ti ti-external-link" aria-hidden="true"></i><span class="sr-only">${externalLabel}</span></a>`
              : escapeHtml(event.venue)
            : '')}
          ${renderInfoRow('Styles', escapeHtml(styles))}
          ${renderInfoRow('Price', cost ? `<span class="mono-value">${cost}</span>` : '')}
          ${renderInfoRow('Theme', event.theme ? escapeHtml(event.theme) : '')}
        </dl>
        ${event.organizer_name ? `
          <div class="organizer-block">
            <span class="detail-label">Hosted by</span>
            ${organizerUrl
              ? `<a class="organizer-link" href="${escapeHtml(organizerUrl)}" target="_blank" rel="noopener noreferrer">${escapeHtml(event.organizer_name)} <i class="ti ti-external-link" aria-hidden="true"></i><span class="sr-only">${externalLabel}</span></a>`
              : `<span class="organizer-link is-plain">${escapeHtml(event.organizer_name)}</span>`}
          </div>
        ` : ''}
        ${(venueUrl || postUrl) ? `
          <div class="detail-actions">
            ${venueUrl ? `<a class="solid-action primary-action" href="${escapeHtml(venueUrl)}" target="_blank" rel="noopener noreferrer"><i class="ti ti-map-pin" aria-hidden="true"></i>Open in Maps<span class="sr-only">${externalLabel}</span></a>` : ''}
            ${postUrl ? `<a class="text-action secondary-action" href="${escapeHtml(postUrl)}" target="_blank" rel="noopener noreferrer"><i class="ti ti-brand-instagram" aria-hidden="true"></i>View Instagram post<span class="sr-only">${externalLabel}</span></a>` : ''}
          </div>
        ` : ''}
      </div>
    </div>
  `;
}

function cancelledTitle(event) {
  return event.cancelled
    ? `<span class="cancelled-prefix">Cancelled</span> ${escapeHtml(event.title)}`
    : escapeHtml(event.title);
}

function renderDetails() {
  const selectedEvent = appState.events.find((event) => event.id === appState.selectedEventId);
  const hasSelection = Boolean(selectedEvent);

  dom.detailInspector.classList.toggle('has-selection', hasSelection);
  dom.detailInspector.innerHTML = hasSelection
    ? renderDetailPanel(selectedEvent, 'inspector')
    : `
      <div class="inspector-empty">
        <span class="inspector-mark" aria-hidden="true"></span>
        <p class="state-kicker">Choose an event to see details</p>
        <p>Open a ticket to check the venue, price, and organizer.</p>
      </div>
    `;

  const drawerOpen = appState.overlay === 'drawer' && hasSelection;

  if (drawerOpen) {
    if (drawerCloseTimer) {
      clearTimeout(drawerCloseTimer);
      drawerCloseTimer = null;
    }
    dom.drawerLayer.classList.remove('is-closing');
    dom.drawerLayer.hidden = false;
    dom.detailDrawer.classList.toggle('is-expanded', appState.drawerExpanded);
    dom.detailDrawer.innerHTML = renderDetailPanel(selectedEvent, 'drawer');
    document.body.classList.add('drawer-is-open');
  } else if (!dom.drawerLayer.hidden) {
    if (!dom.drawerLayer.classList.contains('is-closing')) {
      dom.drawerLayer.classList.add('is-closing');
      document.body.classList.remove('drawer-is-open');
      if (drawerCloseTimer) clearTimeout(drawerCloseTimer);
      drawerCloseTimer = setTimeout(() => {
        dom.drawerLayer.hidden = true;
        dom.drawerLayer.classList.remove('is-closing');
        dom.detailDrawer.innerHTML = '';
        drawerCloseTimer = null;
      }, 300);
    }
  } else {
    document.body.classList.remove('drawer-is-open');
  }
}

function renderMenuState() {
  if (appState.menuOpen) {
    if (menuCloseTimer) {
      clearTimeout(menuCloseTimer);
      menuCloseTimer = null;
    }
    dom.menuLayer.classList.remove('is-closing');
    dom.menuLayer.hidden = false;
    dom.menuToggle.setAttribute('aria-expanded', 'true');
    dom.menuToggle.setAttribute('aria-label', 'Close menu');
    dom.menuToggle.innerHTML = `<i class="ti ti-x" aria-hidden="true"></i>`;
    document.body.classList.add('menu-is-open');
  } else if (!dom.menuLayer.hidden) {
    if (!dom.menuLayer.classList.contains('is-closing')) {
      dom.menuLayer.classList.add('is-closing');
      dom.menuToggle.setAttribute('aria-expanded', 'false');
      dom.menuToggle.setAttribute('aria-label', 'Open menu');
      dom.menuToggle.innerHTML = `<i class="ti ti-menu-2" aria-hidden="true"></i>`;
      document.body.classList.remove('menu-is-open');
      if (menuCloseTimer) clearTimeout(menuCloseTimer);
      menuCloseTimer = setTimeout(() => {
        dom.menuLayer.hidden = true;
        dom.menuLayer.classList.remove('is-closing');
        menuCloseTimer = null;
      }, 300);
    }
  } else {
    dom.menuToggle.setAttribute('aria-expanded', 'false');
    dom.menuToggle.setAttribute('aria-label', 'Open menu');
    dom.menuToggle.innerHTML = `<i class="ti ti-menu-2" aria-hidden="true"></i>`;
    document.body.classList.remove('menu-is-open');
  }
}

function renderApp() {
  if (appState.selectedEventId && !appState.events.some((event) => event.id === appState.selectedEventId)) {
    appState.selectedEventId = null;
    appState.overlay = 'closed';
  }

  dom.calendarContent.setAttribute('aria-busy', String(appState.loadState === 'loading'));
  dom.searchInput.value = appState.searchQuery;
  dom.searchClear.hidden = !appState.searchQuery;
  renderDateStrip();
  renderFilterTray();
  renderTimeline();
  renderDetails();
  renderMenuState();
}

function scrollDateCellIntoView(dateKey) {
  const cell = dom.dateStrip.querySelector(`[data-date-key="${dateKey}"]`);
  if (!cell) return;

  cell.scrollIntoView({
    behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    block: 'nearest',
    inline: 'center',
  });
}

function scrollToDate(dateKey) {
  const group = document.getElementById(`date-group-${dateKey}`);
  if (group) {
    group.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'start',
    });
    return;
  }

  dom.timelineStatus.scrollIntoView({
    behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
    block: 'start',
  });
}

function focusAfterOpen(type) {
  window.requestAnimationFrame(() => {
    const focusTarget = type === 'menu'
      ? dom.menuClose
      : dom.detailDrawer.querySelector('h2') || dom.detailDrawer.querySelector('.detail-close');
    focusTarget?.focus();
  });
}

function openMenu() {
  appState.menuOpen = true;
  appState.menuRestoreFocus = document.activeElement;
  renderMenuState();
  focusAfterOpen('menu');
}

function closeMenu() {
  appState.menuOpen = false;
  renderMenuState();
  const restoreTarget = appState.menuRestoreFocus;
  appState.menuRestoreFocus = null;
  if (restoreTarget && typeof restoreTarget.focus === 'function') restoreTarget.focus();
}

function openEvent(eventId, shouldScroll = false) {
  const event = appState.events.find((item) => item.id === eventId);
  if (!event) return;

  appState.rangeStartKey = getMonthStartKey(event.dateKey);
  appState.selectedEventId = event.id;
  appState.selectedDateKey = event.dateKey;
  appState.overlay = window.matchMedia('(min-width: 960px)').matches ? 'inspector' : 'drawer';
  appState.drawerExpanded = false;
  appState.restoreFocus = document.activeElement;
  appState.restoreEventId = event.id;
  renderApp();

  if (shouldScroll) {
    window.requestAnimationFrame(() => scrollToDate(event.dateKey));
  }

  if (appState.overlay === 'drawer') focusAfterOpen('drawer');
}

function clearSelectedEvent() {
  appState.overlay = 'closed';
  appState.selectedEventId = null;
  appState.drawerExpanded = false;
  appState.restoreFocus = null;
  appState.restoreEventId = null;
}

function closeDetails() {
  appState.overlay = 'closed';
  appState.selectedEventId = null;
  appState.drawerExpanded = false;
  renderApp();
  const restoredEvent = appState.restoreEventId
    ? document.getElementById(getElementIdForEvent(appState.restoreEventId))
    : null;
  const restoreTarget = restoredEvent || appState.restoreFocus;
  appState.restoreFocus = null;
  appState.restoreEventId = null;
  if (restoreTarget && restoreTarget.isConnected && typeof restoreTarget.focus === 'function') {
    restoreTarget.focus();
  }
}

function moveDateSelection(direction) {
  const dates = getMonthDates(appState.rangeStartKey);
  const currentIndex = dates.indexOf(appState.selectedDateKey);
  const nextIndex = Math.min(dates.length - 1, Math.max(0, currentIndex + direction));
  const nextDate = dates[nextIndex];
  if (!nextDate || nextDate === appState.selectedDateKey) return;

  clearSelectedEvent();
  appState.selectedDateKey = nextDate;
  renderApp();
  window.requestAnimationFrame(() => {
    scrollDateCellIntoView(nextDate);
    scrollToDate(nextDate);
  });
  document.querySelector(`[data-date-key="${nextDate}"]`)?.focus();
}

function selectDate(dateKey) {
  const dates = getMonthDates(appState.rangeStartKey);
  if (!dates.includes(dateKey)) return;

  clearSelectedEvent();
  appState.selectedDateKey = dateKey;
  renderApp();
  window.requestAnimationFrame(() => {
    scrollDateCellIntoView(dateKey);
    scrollToDate(dateKey);
  });
}

function shiftRange(direction) {
  const currentMonthStart = getMonthStartKey(appState.rangeStartKey);
  const nextMonthStart = getAdjacentEventMonth(currentMonthStart, direction);
  if (!nextMonthStart) return;

  clearSelectedEvent();
  appState.rangeStartKey = nextMonthStart;
  appState.selectedDateKey = getFirstEventDateInMonth(nextMonthStart);
  renderApp();
  window.requestAnimationFrame(() => scrollDateCellIntoView(appState.selectedDateKey));
}

function clearFilters() {
  appState.searchQuery = '';
  appState.selectedEventTypes.clear();
  appState.selectedDanceStyles.clear();
  renderApp();
}

function getFocusable(container) {
  return [...container.querySelectorAll(
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
  )].filter((element) => !element.hidden && element.offsetParent !== null);
}

function handleKeydown(event) {
  if (event.key === 'Escape') {
    if (appState.menuOpen) {
      event.preventDefault();
      closeMenu();
    } else if (appState.overlay === 'drawer' || appState.overlay === 'inspector') {
      event.preventDefault();
      closeDetails();
    } else if (appState.filtersOpen) {
      event.preventDefault();
      appState.filtersOpen = false;
      renderFilterTray();
    }
    return;
  }

  if (event.key === 'Tab' && appState.menuOpen) {
    const focusable = getFocusable(dom.siteMenu);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
    return;
  }

  if (event.key === 'Tab' && appState.overlay === 'drawer') {
    const focusable = getFocusable(dom.detailDrawer);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  if ((event.key === 'ArrowLeft' || event.key === 'ArrowRight')
    && event.target.matches('.date-cell')) {
    event.preventDefault();
    moveDateSelection(event.key === 'ArrowLeft' ? -1 : 1);
  }
}

function bindEvents() {
  dom.menuToggle.addEventListener('click', () => {
    if (appState.menuOpen) closeMenu();
    else openMenu();
  });
  dom.menuClose.addEventListener('click', closeMenu);
  dom.menuScrim.addEventListener('click', closeMenu);
  dom.siteMenu.addEventListener('click', (event) => {
    const link = event.target.closest('a[href]');
    if (link && !link.classList.contains('is-disabled')) closeMenu();
  });
  dom.drawerScrim.addEventListener('click', closeDetails);
  dom.rangePrev.addEventListener('click', () => shiftRange(-1));
  dom.rangeNext.addEventListener('click', () => shiftRange(1));
  dom.todayButton.addEventListener('click', () => window.location.reload());
  dom.filtersToggle.addEventListener('click', () => {
    appState.filtersOpen = !appState.filtersOpen;
    renderFilterTray();
  });
  dom.searchClear.addEventListener('click', () => {
    appState.searchQuery = '';
    renderApp();
    dom.searchInput.focus();
  });
  dom.searchForm.addEventListener('submit', (event) => event.preventDefault());

  dom.app.addEventListener('input', (event) => {
    if (event.target.id !== 'search-input') return;
    appState.searchQuery = event.target.value;
    renderApp();
  });

  dom.app.addEventListener('change', (event) => {
    if (!event.target.matches('[data-filter-group]')) return;

    const group = event.target.dataset.filterGroup;
    const selectedSet = group === 'event_type'
      ? appState.selectedEventTypes
      : appState.selectedDanceStyles;

    if (event.target.checked) selectedSet.add(event.target.value);
    else selectedSet.delete(event.target.value);
    renderApp();
  });

  dom.app.addEventListener('click', (event) => {
    const actionTarget = event.target.closest('[data-action]');
    if (!actionTarget) return;

    const { action } = actionTarget.dataset;
    if (action === 'select-event') {
      openEvent(actionTarget.dataset.eventId, actionTarget.classList.contains('planning-note'));
    } else if (action === 'select-date') {
      selectDate(actionTarget.dataset.dateKey);
    } else if (action === 'clear-filters') {
      clearFilters();
    } else if (action === 'close-filters') {
      appState.filtersOpen = false;
      renderFilterTray();
    } else if (action === 'retry') {
      loadAndRender();
    } else if (action === 'close-details') {
      closeDetails();
    } else if (action === 'toggle-drawer') {
      appState.drawerExpanded = !appState.drawerExpanded;
      renderDetails();
    }
  });

  document.addEventListener('keydown', handleKeydown);
}

async function loadAndRender() {
  appState.loadState = 'loading';
  renderApp();

  try {
    appState.events = await loadEvents(appState.dataUrl);
    appState.loadState = 'ready';
    renderApp();
    window.requestAnimationFrame(() => scrollDateCellIntoView(appState.selectedDateKey));
  } catch (error) {
    console.error('[Ritmo] Events failed to load:', error);
    appState.loadState = 'error';
    renderApp();
  }
}

function createRitmoCalendar({
  root = document.querySelector('#app'),
  dataUrl = 'events.json',
  initialRangeStart = INITIAL_RANGE_START,
} = {}) {
  if (!root) return null;

  dom.app = root;
  dom.calendarContent = root.querySelector('.calendar-content');
  dom.dateStrip = root.querySelector('#date-strip');
  dom.rangePrev = root.querySelector('#range-prev');
  dom.rangeNext = root.querySelector('#range-next');
  dom.monthLabel = root.querySelector('#month-label');
  dom.monthIndex = root.querySelector('#month-index');
  dom.todayButton = root.querySelector('#today-button');
  dom.filtersToggle = root.querySelector('#filters-toggle');
  dom.filterTray = root.querySelector('#filter-tray');
  dom.searchForm = root.querySelector('#search-form');
  dom.searchInput = root.querySelector('#search-input');
  dom.searchClear = root.querySelector('#search-clear');
  dom.resultCount = root.querySelector('#result-count');
  dom.resultAnnouncement = root.querySelector('#result-announcement');
  dom.timelineStatus = root.querySelector('#timeline-status');
  dom.timeline = root.querySelector('#timeline');
  dom.detailInspector = root.querySelector('#detail-inspector');
  dom.drawerLayer = root.querySelector('#drawer-layer');
  dom.detailDrawer = root.querySelector('#detail-drawer');
  dom.drawerScrim = root.querySelector('#drawer-scrim');
  dom.menuToggle = root.querySelector('#menu-toggle');
  dom.menuLayer = root.querySelector('#site-menu-layer');
  dom.menuScrim = root.querySelector('#menu-scrim');
  dom.siteMenu = root.querySelector('#site-menu');
  dom.menuClose = root.querySelector('#menu-close');

  const requestedMonthStart = /^\d{4}-\d{2}-\d{2}$/.test(initialRangeStart || '')
    ? getMonthStartKey(initialRangeStart)
    : INITIAL_RANGE_START;
  const todayKey = getDateKey(getMumbaiNow());
  const todayMonthStart = getMonthStartKey(todayKey);
  const defaultRangeStart = todayMonthStart || requestedMonthStart;
  const defaultDateKey = todayMonthStart ? todayKey : defaultRangeStart;

  appState = {
    dataUrl,
    loadState: 'loading',
    events: [],
    rangeStartKey: defaultRangeStart,
    selectedDateKey: defaultDateKey,
    selectedEventId: null,
    selectedEventTypes: new Set(),
    selectedDanceStyles: new Set(),
    searchQuery: '',
    filtersOpen: false,
    menuOpen: false,
    menuRestoreFocus: null,
    overlay: 'closed',
    drawerExpanded: false,
    restoreFocus: null,
    restoreEventId: null,
    now: getMumbaiNow(),
  };

  if (statusTimer) window.clearInterval(statusTimer);
  statusTimer = window.setInterval(() => {
    if (!appState || appState.loadState !== 'ready') return;
    appState.now = getMumbaiNow();
    renderTimeline();
    if (appState.selectedEventId) renderDetails();
  }, 60000);

  bindEvents();
  renderApp();
  loadAndRender();

  return {
    reload: loadAndRender,
    getState: () => ({ ...appState }),
  };
}

document.addEventListener('DOMContentLoaded', () => {
  window.RitmoCalendar = createRitmoCalendar();
});
