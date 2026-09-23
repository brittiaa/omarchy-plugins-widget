.pragma library

.import "Util.js" as Util

// iCalendar parsing: content lines, time zones and VEVENT expansion.

// iCalendar wraps long lines by breaking them and starting the next with a
// space. A summary of any length arrives in pieces, so nothing can be read
// until the pieces are put back.
function unfoldIcs(raw) {
  var text = String(raw || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n")
  var lines = text.split("\n")
  var out = []
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i]
    var folded = line.length > 0 && (line.charAt(0) === " " || line.charAt(0) === "\t")
    if (folded && out.length > 0) out[out.length - 1] += line.slice(1)
    else out.push(line)
  }
  return out
}

// NAME;PARAM=value;OTHER="quoted:value":the rest of the line. The separating
// colon is the first one outside quotes -- a TZID or an ALTREP is free to
// contain one, and splitting on the first colon in the string would cut a
// line in the wrong place.
function parseIcsLine(line) {
  var s = String(line || "")
  var colon = -1
  var quoted = false
  for (var i = 0; i < s.length; i++) {
    var c = s.charAt(i)
    if (c === '"') { quoted = !quoted; continue }
    if (c === ":" && !quoted) { colon = i; break }
  }
  if (colon === -1) return null
  var head = s.slice(0, colon)
  var parts = head.split(";")
  var params = {}
  for (var p = 1; p < parts.length; p++) {
    var eq = parts[p].indexOf("=")
    if (eq === -1) continue
    params[parts[p].slice(0, eq).toUpperCase()] =
      parts[p].slice(eq + 1).replace(/^"/, "").replace(/"$/, "")
  }
  return { name: parts[0].toUpperCase(), params: params, value: s.slice(colon + 1) }
}

// Text values escape their commas, semicolons and newlines. Scanned rather
// than run through a chain of replaces, so a literal backslash before an "n"
// cannot be mistaken for a newline.
function unescapeIcsText(value) {
  var s = String(value || "")
  var out = ""
  for (var i = 0; i < s.length; i++) {
    var c = s.charAt(i)
    if (c !== "\\") { out += c; continue }
    var next = s.charAt(i + 1)
    i++
    if (next === "n" || next === "N") out += " "
    else out += next
  }
  return Util.clampString(out.replace(/\s+/g, " ").replace(/^\s+|\s+$/g, ""))
}

// "+0530" -> 330, "-0800" -> -480. Seconds are allowed by the spec and are
// dropped: no zone in use has ever needed them, and a partial minute would
// only ever produce a time that looks broken.
function parseUtcOffset(value) {
  var m = /^([+-])(\d{2})(\d{2})(\d{2})?$/.exec(String(value || "").replace(/^\s+|\s+$/g, ""))
  if (!m) return null
  var minutes = Number(m[2]) * 60 + Number(m[3])
  return m[1] === "-" ? -minutes : minutes
}

// A DATE or DATE-TIME, read as a *wall clock* rather than as an instant.
//
// The wall clock is carried in the UTC domain -- Date.UTC of the digits as
// written -- purely so recurrence arithmetic can use the UTC setters and
// never trip over the machine's own daylight saving. `kind` says what has to
// be done to turn it back into a real instant, which is `wallToEpoch`'s job.
function icsWallOf(value, params) {
  var s = String(value || "").replace(/^\s+|\s+$/g, "")
  var m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(s)
  if (!m) return null
  var p = params || {}
  var hasTime = m[4] !== undefined
  var isDate = !hasTime || String(p.VALUE || "").toUpperCase() === "DATE"
  var wall = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]),
    hasTime ? Number(m[4]) : 0, hasTime ? Number(m[5]) : 0, hasTime ? Number(m[6]) : 0)
  if (!isFinite(wall)) return null
  if (isDate) return { wall: wall, kind: "date", tzid: "", allDay: true }
  if (m[7] === "Z") return { wall: wall, kind: "utc", tzid: "", allDay: false }
  var tzid = Util.clampString(p.TZID || "")
  return { wall: wall, kind: tzid ? "tz" : "floating", tzid: tzid, allDay: false }
}

// A wall clock back into an instant on the machine's own timeline.
//
// "utc" is already one. "date" is a whole local day, so it lands at local
// midnight -- an all-day event is on a date, not at an hour. "tz" is offset
// by whatever the file's own VTIMEZONE says was in force. Anything left is
// floating, which the spec defines as local time, and that is what the
// machine's Date constructor gives.
function wallToEpoch(wall, kind, tzid, zones) {
  if (kind === "utc") return wall
  var d = new Date(wall)
  var y = d.getUTCFullYear(), mo = d.getUTCMonth(), day = d.getUTCDate()
  if (kind === "date") return new Date(y, mo, day).getTime()
  if (kind === "tz") {
    var offset = tzOffsetAt(zones, tzid, y, mo + 1, day, d.getUTCHours(), d.getUTCMinutes())
    if (offset !== null) return wall - offset * 60000
  }
  return new Date(y, mo, day, d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds()).getTime()
}

// "P1DT2H30M" -> milliseconds. Weeks are their own form and cannot be
// combined with the rest, which is why they are matched separately.
function parseIcsDuration(value) {
  var s = String(value || "").replace(/^\s+|\s+$/g, "").toUpperCase()
  var sign = s.charAt(0) === "-" ? -1 : 1
  if (s.charAt(0) === "+" || s.charAt(0) === "-") s = s.slice(1)
  var weeks = /^P(\d+)W$/.exec(s)
  if (weeks) return sign * Number(weeks[1]) * 7 * Util.DAY_MS
  var m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(s)
  if (!m) return 0
  var ms = (Number(m[1] || 0) * Util.DAY_MS) + (Number(m[2] || 0) * 3600000)
    + (Number(m[3] || 0) * 60000) + (Number(m[4] || 0) * 1000)
  return sign * ms
}

var ICS_WEEKDAYS = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 }

// The day of the month the nth given weekday falls on. `nth` counts from the
// end when negative, which is how every daylight-saving rule and half the
// recurring meetings in the world are written ("the last Sunday", "the first
// Monday"). Returns a day that exists in the month, or 0 when it does not.
function nthWeekdayOfMonth(year, month, weekday, nth) {
  if (!isFinite(year) || month < 1 || month > 12) return 0
  if (weekday < 0 || weekday > 6 || nth === 0) return 0
  var lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
  if (nth > 0) {
    var firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay()
    var day = 1 + ((weekday - firstWeekday) + 7) % 7 + (nth - 1) * 7
    return day <= lastDay ? day : 0
  }
  var lastWeekday = new Date(Date.UTC(year, month - 1, lastDay)).getUTCDay()
  var back = lastDay - ((lastWeekday - weekday) + 7) % 7 + (nth + 1) * 7
  return back >= 1 ? back : 0
}

// FREQ, INTERVAL, COUNT, UNTIL, BYDAY, BYMONTHDAY, BYMONTH, WKST -- which is
// everything a calendar of meetings produces. Anything else is ignored rather
// than refused: an unhandled BYSETPOS gives a series that recurs slightly too
// often, which is a card that says a bit too much, and dropping the event
// entirely would be a card that says nothing.
function parseRrule(value) {
  var out = {
    freq: "", interval: 1, count: 0, until: "", untilWall: null,
    byday: [], bymonthday: [], bymonth: [], wkst: 1
  }
  var parts = String(value || "").split(";")
  for (var i = 0; i < parts.length; i++) {
    var eq = parts[i].indexOf("=")
    if (eq === -1) continue
    var key = parts[i].slice(0, eq).toUpperCase()
    var raw = parts[i].slice(eq + 1)
    if (key === "FREQ") out.freq = raw.toUpperCase()
    else if (key === "INTERVAL") out.interval = Math.max(1, Math.round(Util.clampNumber(raw, 1, 1000, 1)))
    else if (key === "COUNT") out.count = Math.max(0, Math.round(Util.clampNumber(raw, 0, 100000, 0)))
    else if (key === "UNTIL") {
      out.until = raw
      var w = icsWallOf(raw, {})
      out.untilWall = w ? w.wall : null
    } else if (key === "WKST") {
      var start = ICS_WEEKDAYS[raw.toUpperCase()]
      if (start !== undefined) out.wkst = start
    } else if (key === "BYDAY") {
      var days = raw.toUpperCase().split(",")
      for (var d = 0; d < days.length; d++) {
        var m = /^([+-]?\d{1,2})?(SU|MO|TU|WE|TH|FR|SA)$/.exec(days[d])
        if (!m) continue
        out.byday.push({ nth: m[1] ? Number(m[1]) : 0, weekday: ICS_WEEKDAYS[m[2]] })
      }
    } else if (key === "BYMONTHDAY" || key === "BYMONTH") {
      var nums = raw.split(",")
      for (var n = 0; n < nums.length; n++) {
        var value2 = Number(nums[n])
        if (!isFinite(value2) || value2 === 0) continue
        if (key === "BYMONTH") { if (value2 >= 1 && value2 <= 12) out.bymonth.push(value2) }
        else if (value2 >= -31 && value2 <= 31) out.bymonthday.push(value2)
      }
    }
  }
  return out
}

function daysInIcsMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

// Every wall clock a series lands on inside [fromWall, toWall].
//
// All of it happens in the wall-clock domain, so a weekly 09:00 stays 09:00
// across a daylight-saving boundary instead of drifting to 08:00 the way
// adding seven times 86400000 to an instant would.
//
// Bounded three ways -- the window, `limit` occurrences, and a hard iteration
// guard -- because this parses a document from the network and a series with
// no COUNT and no UNTIL is a perfectly ordinary thing to write.
function expandWalls(startWall, rule, fromWall, toWall, limit) {
  var out = []
  var cap = limit > 0 ? limit : 200
  if (!rule || !rule.freq) {
    if (startWall >= fromWall && startWall <= toWall) out.push(startWall)
    return out
  }

  var start = new Date(startWall)
  var hours = start.getUTCHours(), minutes = start.getUTCMinutes(), seconds = start.getUTCSeconds()
  var interval = rule.interval > 0 ? rule.interval : 1
  // UNTIL is an instant and this loop is wall clock, so the two are at most a
  // day apart. The slack is spent on stopping late rather than early; the
  // caller filters the tail off precisely, once the offsets are known.
  var untilWall = rule.untilWall === null ? null : rule.untilWall + Util.DAY_MS
  var emitted = 0
  var guard = 0

  function take(when) {
    if (when < startWall) return true
    if (rule.count > 0 && emitted >= rule.count) return false
    if (untilWall !== null && when > untilWall) return false
    emitted++
    if (when >= fromWall && when <= toWall) out.push(when)
    return true
  }

  if (rule.freq === "DAILY") {
    var step = interval * Util.DAY_MS
    var cur = startWall
    // A daily series that began years ago would otherwise be walked one day
    // at a time to get to this week. The skipped occurrences still have to be
    // counted, because COUNT is measured from the first one.
    if (cur < fromWall) {
      var skip = Math.floor((fromWall - cur) / step)
      if (skip > 0) { cur += skip * step; emitted += skip }
    }
    while (guard++ < 4000 && out.length < cap && cur <= toWall) {
      if (!take(cur)) break
      cur += step
    }
    return out
  }

  if (rule.freq === "WEEKLY") {
    var weekdays = []
    if (rule.byday.length) {
      for (var b = 0; b < rule.byday.length; b++) weekdays.push(rule.byday[b].weekday)
    } else weekdays.push(start.getUTCDay())
    weekdays.sort(function (a, b) {
      return ((a - rule.wkst) + 7) % 7 - ((b - rule.wkst) + 7) % 7
    })
    var weekStart = startWall - ((start.getUTCDay() - rule.wkst) + 7) % 7 * Util.DAY_MS
    var week = 0
    while (guard++ < 4000 && out.length < cap) {
      var base = weekStart + week * interval * 7 * Util.DAY_MS
      var stopped = false
      for (var w = 0; w < weekdays.length; w++) {
        if (!take(base + ((weekdays[w] - rule.wkst) + 7) % 7 * Util.DAY_MS)) { stopped = true; break }
      }
      if (stopped || base > toWall) break
      week++
    }
    return out
  }

  if (rule.freq === "MONTHLY") {
    var y0 = start.getUTCFullYear(), m0 = start.getUTCMonth(), dom = start.getUTCDate()
    var k = 0
    while (guard++ < 2000 && out.length < cap) {
      var index = m0 + k * interval
      var year = y0 + Math.floor(index / 12)
      var month = ((index % 12) + 12) % 12 + 1
      var days = monthDaysFor(rule, year, month, [dom])
      var halted = false
      for (var i = 0; i < days.length; i++) {
        if (!take(Date.UTC(year, month - 1, days[i], hours, minutes, seconds))) { halted = true; break }
      }
      if (halted || Date.UTC(year, month - 1, 1) > toWall) break
      k++
    }
    return out
  }

  if (rule.freq === "YEARLY") {
    var baseYear = start.getUTCFullYear()
    var months = rule.bymonth.length ? rule.bymonth : [start.getUTCMonth() + 1]
    var j = 0
    while (guard++ < 400 && out.length < cap) {
      var yr = baseYear + j * interval
      var done = false
      for (var mi = 0; mi < months.length && !done; mi++) {
        var list = monthDaysFor(rule, yr, months[mi], [start.getUTCDate()])
        for (var li = 0; li < list.length; li++) {
          if (!take(Date.UTC(yr, months[mi] - 1, list[li], hours, minutes, seconds))) { done = true; break }
        }
      }
      if (done || Date.UTC(yr, 0, 1) > toWall) break
      j++
    }
    return out
  }

  // A frequency nobody writes -- SECONDLY, MINUTELY, HOURLY. Drawn as the one
  // occurrence it definitely has rather than expanded into a wall of them.
  if (startWall >= fromWall && startWall <= toWall) out.push(startWall)
  return out
}

// Which days of a given month a monthly or yearly rule lands on, in order.
// `fallback` is the day the series started on, which is what the rule means
// when it says nothing else.
function monthDaysFor(rule, year, month, fallback) {
  var last = daysInIcsMonth(year, month)
  var days = []
  var i
  if (rule.byday.length) {
    for (i = 0; i < rule.byday.length; i++) {
      var spec = rule.byday[i]
      var day = spec.nth === 0
        ? nthWeekdayOfMonth(year, month, spec.weekday, 1)
        : nthWeekdayOfMonth(year, month, spec.weekday, spec.nth)
      if (day >= 1 && day <= last) days.push(day)
    }
  } else if (rule.bymonthday.length) {
    for (i = 0; i < rule.bymonthday.length; i++) {
      var md = rule.bymonthday[i]
      var real = md > 0 ? md : last + md + 1
      if (real >= 1 && real <= last) days.push(real)
    }
  } else {
    for (i = 0; i < fallback.length; i++) {
      // A series on the 31st simply has no occurrence in a 30-day month,
      // which is what the spec says and what every calendar app does.
      if (fallback[i] >= 1 && fallback[i] <= last) days.push(fallback[i])
    }
  }
  days.sort(function (a, b) { return a - b })
  return days
}

//
// The file carries its own timezone definitions, which is the only reason
// this can be right without asking the system anything: each VTIMEZONE gives
// the offsets and the rule that switches between them, so "14:00 in
// Europe/London" can be resolved from the document itself rather than from a
// zoneinfo lookup the shell would have to run a subprocess for.

function parseIcsTimezones(lines) {
  var zones = {}
  var tzid = ""
  var inZone = false
  var comp = null
  for (var i = 0; i < lines.length; i++) {
    var p = parseIcsLine(lines[i])
    if (!p) continue
    var kind = String(p.value || "").toUpperCase()
    if (p.name === "BEGIN") {
      if (kind === "VTIMEZONE") { inZone = true; tzid = ""; comp = null }
      else if (inZone && (kind === "STANDARD" || kind === "DAYLIGHT")) {
        comp = { offset: null, month: 0, monthday: 0, weekday: -1, nth: 0, hour: 0, minute: 0 }
      }
      continue
    }
    if (p.name === "END") {
      if (kind === "VTIMEZONE") { inZone = false; tzid = ""; comp = null }
      else if (inZone && comp) {
        if (tzid && comp.offset !== null) {
          if (!zones[tzid]) zones[tzid] = []
          zones[tzid].push(comp)
        }
        comp = null
      }
      continue
    }
    if (!inZone) continue
    if (p.name === "TZID" && !comp) { tzid = Util.clampString(p.value); continue }
    if (!comp) continue
    if (p.name === "TZOFFSETTO") comp.offset = parseUtcOffset(p.value)
    else if (p.name === "DTSTART") {
      var w = icsWallOf(p.value, p.params)
      if (w) {
        var d = new Date(w.wall)
        comp.month = d.getUTCMonth() + 1
        comp.monthday = d.getUTCDate()
        comp.hour = d.getUTCHours()
        comp.minute = d.getUTCMinutes()
      }
    } else if (p.name === "RRULE") {
      var rule = parseRrule(p.value)
      if (rule.bymonth.length) comp.month = rule.bymonth[0]
      if (rule.byday.length) {
        comp.weekday = rule.byday[0].weekday
        comp.nth = rule.byday[0].nth || 1
      }
      if (rule.bymonthday.length) comp.monthday = rule.bymonthday[0]
    }
  }
  return zones
}

// When a zone's rule fires in a given year, as a wall clock.
function icsTransitionWall(comp, year) {
  if (!comp || !comp.month) return null
  var day = comp.weekday >= 0 && comp.nth !== 0
    ? nthWeekdayOfMonth(year, comp.month, comp.weekday, comp.nth)
    : comp.monthday
  if (!day) return null
  return Date.UTC(year, comp.month - 1, day, comp.hour, comp.minute, 0)
}

// The offset in force in `tzid` at a given wall clock, or null when the file
// said nothing about that zone.
//
// The comparison is made in wall clock rather than in UTC, which is exact
// everywhere except inside the hour a zone is actually changing over. An
// event scheduled inside its own DST transition is ambiguous by definition;
// every calendar has to pick one, and picking the later offset is what
// Google's own expansion does.
function tzOffsetAt(zones, tzid, year, month, day, hour, minute) {
  var comps = zones ? zones[tzid] : null
  if (!comps || comps.length === 0) return null
  if (comps.length === 1) return comps[0].offset
  var target = Date.UTC(year, month - 1, day, hour, minute, 0)
  var best = null
  var bestAt = null
  for (var i = 0; i < comps.length; i++) {
    // This year and last: the rule in force in January fired the previous
    // autumn, so a year on its own would leave the start of every year with
    // nothing to match.
    for (var back = 0; back <= 1; back++) {
      var at = icsTransitionWall(comps[i], year - back)
      if (at === null || at > target) continue
      if (bestAt === null || at > bestAt) { bestAt = at; best = comps[i] }
    }
  }
  return best ? best.offset : comps[0].offset
}


// Every VEVENT in the file, as the handful of fields a card can show.
// VTIMEZONE has its own DTSTART and its own RRULE, so it is stepped over
// rather than read -- picking those up would put a timezone rule on the
// wallpaper as if it were a meeting.
function collectVevents(lines) {
  var out = []
  var cur = null
  var inZone = false
  for (var i = 0; i < lines.length; i++) {
    var p = parseIcsLine(lines[i])
    if (!p) continue
    var kind = String(p.value || "").toUpperCase()
    if (p.name === "BEGIN") {
      if (kind === "VTIMEZONE") inZone = true
      else if (kind === "VEVENT" && !inZone) cur = { uid: "", summary: "", location: "", status: "", exdates: [] }
      continue
    }
    if (p.name === "END") {
      if (kind === "VTIMEZONE") inZone = false
      else if (kind === "VEVENT" && cur) { out.push(cur); cur = null }
      continue
    }
    if (inZone || !cur) continue
    if (p.name === "UID") cur.uid = Util.clampString(p.value)
    else if (p.name === "SUMMARY") cur.summary = unescapeIcsText(p.value)
    else if (p.name === "LOCATION") cur.location = unescapeIcsText(p.value)
    else if (p.name === "STATUS") cur.status = String(p.value || "").toUpperCase()
    else if (p.name === "DTSTART") cur.dtstart = { value: p.value, params: p.params }
    else if (p.name === "DTEND") cur.dtend = { value: p.value, params: p.params }
    else if (p.name === "DURATION") cur.duration = p.value
    else if (p.name === "RRULE") cur.rrule = p.value
    else if (p.name === "RECURRENCE-ID") cur.recurrenceId = { value: p.value, params: p.params }
    else if (p.name === "EXDATE") cur.exdates.push({ value: p.value, params: p.params })
  }
  return out
}

// How long an event lasts, from whichever of DTEND and DURATION it carries.
// An all-day event with neither is one day; a timed one is a moment, which is
// what a reminder with no end actually is.
function icsEventDuration(record, start) {
  if (record.dtend) {
    var end = icsWallOf(record.dtend.value, record.dtend.params)
    if (end && end.wall > start.wall) return end.wall - start.wall
  }
  if (record.duration) {
    var ms = parseIcsDuration(record.duration)
    if (ms > 0) return ms
  }
  return start.allDay ? Util.DAY_MS : 0
}

// The instants an event's EXDATE lines take out of its series.
function icsExceptions(record, zones) {
  var out = {}
  var list = record && Array.isArray(record.exdates) ? record.exdates : []
  for (var i = 0; i < list.length; i++) {
    var values = String(list[i].value || "").split(",")
    for (var v = 0; v < values.length; v++) {
      var w = icsWallOf(values[v], list[i].params)
      if (w) out[wallToEpoch(w.wall, w.kind, w.tzid, zones)] = true
    }
  }
  return out
}

// An iCalendar document into the occurrences that fall inside a window,
// earliest first. Returns null for anything that is not one, so a failed
// fetch or an error page leaves whatever is already on the card.
//
// `limit` is a ceiling on the whole document, not per series: this is a file
// from the network being turned into objects inside the process that draws
// the desktop, and a calendar with a thousand daily standups in it should
// cost the same as a calendar with ten.
function parseCalendar(raw, windowStartMs, windowEndMs, limit) {
  var text = String(raw || "")
  if (text.indexOf("BEGIN:VCALENDAR") === -1) return null
  var lines = unfoldIcs(text)
  var zones = parseIcsTimezones(lines)
  var records = collectVevents(lines)
  var cap = limit > 0 ? limit : 300
  var from = Number(windowStartMs)
  var to = Number(windowEndMs)
  if (!isFinite(from) || !isFinite(to) || to <= from) return null

  // A day either side, because the loop works in wall clock and the window is
  // in instants; the exact filter happens once each occurrence has an offset.
  var fromWall = from - Util.DAY_MS
  var toWall = to + Util.DAY_MS

  // An instance edited out of a series carries a RECURRENCE-ID naming the
  // occurrence it replaces. Collected first so the series can skip it,
  // whether the edit moved the meeting or cancelled it outright.
  var overridden = {}
  var i
  for (i = 0; i < records.length; i++) {
    var edit = records[i]
    if (!edit.recurrenceId) continue
    var rw = icsWallOf(edit.recurrenceId.value, edit.recurrenceId.params)
    if (rw) overridden[edit.uid + "@" + wallToEpoch(rw.wall, rw.kind, rw.tzid, zones)] = true
  }

  var out = []
  for (i = 0; i < records.length && out.length < cap; i++) {
    var rec = records[i]
    if (!rec.dtstart || rec.status === "CANCELLED") continue
    var start = icsWallOf(rec.dtstart.value, rec.dtstart.params)
    if (!start) continue

    var duration = icsEventDuration(rec, start)
    // An override is one occurrence in its own right; only the master of a
    // series recurs, and reading its RRULE too would draw the series twice.
    var rule = rec.recurrenceId ? null : (rec.rrule ? parseRrule(rec.rrule) : null)
    var untilMs = null
    if (rule && rule.untilWall !== null) {
      var uw = icsWallOf(rule.until, {})
      if (uw) untilMs = wallToEpoch(uw.wall, uw.kind === "floating" ? start.kind : uw.kind, start.tzid, zones)
    }
    var skip = icsExceptions(rec, zones)
    var walls = expandWalls(start.wall, rule, fromWall, toWall, cap)

    for (var w = 0; w < walls.length && out.length < cap; w++) {
      var ms = wallToEpoch(walls[w], start.kind, start.tzid, zones)
      if (ms < from || ms > to) continue
      if (untilMs !== null && ms > untilMs) continue
      if (skip[ms]) continue
      if (rule && overridden[rec.uid + "@" + ms]) continue
      out.push({
        start: ms,
        end: ms + duration,
        allDay: start.allDay,
        summary: rec.summary,
        location: rec.location
      })
    }
  }

  // Earliest first, all-day events ahead of the timed ones they overlap:
  // "today" comes before "today at nine".
  out.sort(function (a, b) {
    if (a.start !== b.start) return a.start - b.start
    if (a.allDay !== b.allDay) return a.allDay ? -1 : 1
    return a.summary < b.summary ? -1 : (a.summary > b.summary ? 1 : 0)
  })
  return { events: out }
}
