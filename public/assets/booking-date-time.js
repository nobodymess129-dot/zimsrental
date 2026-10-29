const FIJI_TIME_ZONE = 'Pacific/Fiji';
const FIJI_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: FIJI_TIME_ZONE,
  calendar: 'gregory',
  numberingSystem: 'latn',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23'
});

function wallMilliseconds({ year, month, day, hour, minute, second }) {
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(hour, minute, second, 0);
  return date.getTime();
}

function fijiParts(instant) {
  const parts = Object.fromEntries(
    FIJI_FORMATTER.formatToParts(new Date(instant))
      .filter(part => part.type !== 'literal')
      .map(part => [part.type, Number(part.value)])
  );
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second
  };
}

function sameWallTime(left, right) {
  return left.year === right.year
    && left.month === right.month
    && left.day === right.day
    && left.hour === right.hour
    && left.minute === right.minute
    && left.second === right.second;
}

function parseCalendarDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || '');
  if (!match) return null;
  const [, yearText, monthText, dayText] = match;
  const date = { year: Number(yearText), month: Number(monthText), day: Number(dayText) };
  const probe = new Date(0);
  probe.setUTCHours(0, 0, 0, 0);
  probe.setUTCFullYear(date.year, date.month - 1, date.day);
  if (probe.getUTCFullYear() !== date.year
    || probe.getUTCMonth() + 1 !== date.month
    || probe.getUTCDate() !== date.day) return null;
  return date;
}

function calendarDateMilliseconds(date) {
  const value = new Date(0);
  value.setUTCHours(0, 0, 0, 0);
  value.setUTCFullYear(date.year, date.month - 1, date.day);
  return value.getTime();
}

function formatCalendarDate(date) {
  return [date.year, String(date.month).padStart(2, '0'), String(date.day).padStart(2, '0')].join('-');
}

export function fijiCurrentDate(instant = new Date()) {
  const parts = fijiParts(instant);
  return formatCalendarDate(parts);
}

export function addCalendarDays(dateValue, amount) {
  const date = parseCalendarDate(dateValue);
  if (!date || !Number.isInteger(amount)) return null;
  const result = new Date(calendarDateMilliseconds(date));
  result.setUTCDate(result.getUTCDate() + amount);
  return formatCalendarDate({
    year: result.getUTCFullYear(),
    month: result.getUTCMonth() + 1,
    day: result.getUTCDate()
  });
}

export function calendarDaysBetween(startValue, endValue) {
  const start = parseCalendarDate(startValue);
  const end = parseCalendarDate(endValue);
  if (!start || !end) return null;
  return (calendarDateMilliseconds(end) - calendarDateMilliseconds(start)) / 86400000;
}

export function fijiLocalDateTimeToIso(dateValue, timeValue) {
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateValue || '');
  const timeMatch = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/.exec(timeValue || '');
  if (!dateMatch || !timeMatch) return null;

  const target = {
    year: Number(dateMatch[1]),
    month: Number(dateMatch[2]),
    day: Number(dateMatch[3]),
    hour: Number(timeMatch[1]),
    minute: Number(timeMatch[2]),
    second: timeMatch[3] === undefined ? 0 : Number(timeMatch[3])
  };
  const targetMs = wallMilliseconds(target);
  const calendarProbe = new Date(targetMs);
  if (calendarProbe.getUTCFullYear() !== target.year
    || calendarProbe.getUTCMonth() + 1 !== target.month
    || calendarProbe.getUTCDate() !== target.day
    || calendarProbe.getUTCHours() !== target.hour
    || calendarProbe.getUTCMinutes() !== target.minute
    || calendarProbe.getUTCSeconds() !== target.second) return null;

  // Sample nearby instants to find the UTC offsets currently applicable in
  // Fiji. This also detects ambiguous or nonexistent local times at DST shifts.
  const offsets = new Set();
  for (let hours = -36; hours <= 36; hours += 6) {
    const sample = targetMs + hours * 60 * 60 * 1000;
    offsets.add(wallMilliseconds(fijiParts(sample)) - sample);
  }

  const matches = [...offsets]
    .map(offset => targetMs - offset)
    .filter(instant => sameWallTime(fijiParts(instant), target));

  if (matches.length !== 1) return null;
  return new Date(matches[0]).toISOString();
}