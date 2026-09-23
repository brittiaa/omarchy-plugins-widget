.pragma library

.import "Clock.js" as Clock
.import "Util.js" as Util

// Calendar cards: which feeds are in use, and what a card says about the
// events in them.

// Google Calendar publishes every calendar as an iCalendar file at a secret
// address: Settings -> Integrate calendar -> "Secret address in iCal format".
// That address *is* the connection. There is no OAuth client to register, no
// refresh token for a wallpaper decoration to hold, and no third party in the
// middle -- one GET to Google's own host, on the same schedule as the weather.
//
// The cost of that is a URL in the config file that is worth as much as a
// read-only copy of your calendar, which is said plainly in the README.
//
// Everything below is the part of the widget that can be wrong -- unfolding,
// the date grammar, the VTIMEZONE rules and the slice of RRULE a calendar of
// meetings actually uses -- so it lives here, where a test can reach it.

var CALENDAR_HOST = "calendar.google.com"

// The secret address, to Google's own shape. This becomes a URL handed to
// curl, so it is matched against a pattern rather than escaped -- an
// allowlist, the way `isSafeZone` is, not an attempt to sanitise whatever
// arrived. Anything that is not one of these is not a calendar address.
function isSafeIcsUrl(value) {
  if (typeof value !== "string") return false
  if (value.length === 0 || value.length > Util.MAX_STRING) return false
  return /^https:\/\/calendar\.google\.com\/calendar\/ical\/[A-Za-z0-9%@._~+-]{1,200}\/(?:public|private(?:-[A-Za-z0-9]{1,64})?)\/basic\.ics$/.test(value)
}

// Every distinct calendar the config asks for, so one fetch serves however
// many cards are pointed at it.
function calendarsInUse(config) {
  var list = config && Array.isArray(config.widgets) ? config.widgets : []
  var seen = {}
  var out = []
  for (var i = 0; i < list.length; i++) {
    if (list[i].type !== "calendar") continue
    var url = list[i].settings ? Util.clampString(list[i].settings.icsUrl) : ""
    if (!url || seen[url] || !isSafeIcsUrl(url)) continue
    seen[url] = true
    out.push(url)
  }
  return out
}


// Everything that has not finished yet, earliest first. An event already
// running is still the one you want on the card -- a meeting you are in the
// middle of is not over -- so this filters on the end, not on the start.
function upcomingEvents(events, nowMs, limit, includeAllDay) {
  var list = Array.isArray(events) ? events : []
  var now = Number(nowMs)
  var max = limit > 0 ? limit : 8
  var out = []
  if (!isFinite(now)) return out
  for (var i = 0; i < list.length && out.length < max; i++) {
    var ev = list[i]
    if (!ev) continue
    if (ev.allDay && includeAllDay === false) continue
    var end = ev.end > ev.start ? ev.end : ev.start + 60000
    if (end <= now) continue
    out.push(ev)
  }
  return out
}

// Everything that still has to end today, earliest first. The card used to
// be an agenda for the whole week; a day's limit is not a filter bolted on
// to that, because the shape is different -- an event that began yesterday
// and is running now is still today's business, and an event that starts at
// 1am is not. So the test is the day an event falls in, not the amount of
// day left in it.
function todayEvents(events, nowMs, limit, includeAllDay) {
  var list = Array.isArray(events) ? events : []
  var now = Number(nowMs)
  var max = limit > 0 ? limit : 8
  var out = []
  if (!isFinite(now)) return out
  var today = startOfDay(now)
  for (var i = 0; i < list.length && out.length < max; i++) {
    var ev = list[i]
    if (!ev) continue
    if (ev.allDay && includeAllDay === false) continue
    var end = ev.end > ev.start ? ev.end : ev.start + 60000
    if (end <= now) continue
    if (startOfDay(ev.start) !== today && !(ev.start <= now && end > now)) continue
    out.push(ev)
  }
  return out
}

// The earliest thing on a day that is not this one, for the small line the
// card keeps under today's list. One event only: the rest of tomorrow can
// wait until it is today.
function nextDayEvent(events, nowMs, daysAhead, includeAllDay) {
  var list = Array.isArray(events) ? events : []
  var now = Number(nowMs)
  if (!isFinite(now)) return null
  for (var i = 0; i < list.length; i++) {
    var ev = list[i]
    if (!ev) continue
    if (ev.allDay && includeAllDay === false) continue
    if (daysApart(ev.start, now) === daysAhead) return ev
  }
  return null
}

// The time column on a row: the clock, or the word for an event that has no
// clock to give.
function eventTimeLabel(event, twelveHour) {
  if (!event) return ""
  if (event.allDay) return "all day"
  return Clock.clockLabel(event.start, twelveHour)
}

// How far off it is, as the coarsest true thing. Nobody needs "in 1 hour and
// 47 minutes" from across a desk; they need to know whether to get up.
function untilLabel(startMs, endMs, nowMs) {
  var start = Number(startMs)
  var now = Number(nowMs)
  if (!isFinite(start) || !isFinite(now)) return ""
  var end = Number(endMs)
  if (isFinite(end) && start <= now && end > now) return "now"
  var seconds = Math.round((start - now) / 1000)
  if (seconds <= 60) return "now"
  if (seconds < 3600) return "in " + Math.round(seconds / 60) + "m"
  if (seconds < 86400) {
    var hours = Math.floor(seconds / 3600)
    var mins = Math.round((seconds % 3600) / 60)
    return mins > 0 && hours < 6 ? "in " + hours + "h " + mins + "m" : "in " + hours + "h"
  }
  var days = Math.round(seconds / 86400)
  if (days <= 1) return "tomorrow"
  if (days < 7) return "in " + days + " days"
  return "in " + Math.round(days / 7) + "w"
}

// What the card puts beside an event. An all-day event has no countdown to
// give -- "in 12h" for something that is simply tomorrow is arithmetic where
// a word belongs -- so it says which day it is on instead.
function eventUntilLabel(event, nowMs) {
  if (!event) return ""
  if (!event.allDay) return untilLabel(event.start, event.end, nowMs)
  var end = event.end > event.start ? event.end : event.start + Util.DAY_MS
  if (event.start <= nowMs && end > nowMs) return "Today"
  return dayHeading(event.start, nowMs)
}

// Local midnight of whatever day an instant falls in, which is what makes
// "same day" a question about the calendar rather than about 24 hours.
function startOfDay(ms) {
  var d = new Date(Number(ms))
  if (isNaN(d.getTime())) return 0
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

function daysApart(ms, nowMs) {
  return Math.round((startOfDay(ms) - startOfDay(nowMs)) / Util.DAY_MS)
}

var ICS_DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
var ICS_MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

// The heading a group of events sits under. Named days for the two that have
// names, and a date for everything else -- "Thu 18 Sep" tells you more than
// "in 13 days" once it is past the end of the week.
function dayHeading(ms, nowMs) {
  var delta = daysApart(ms, nowMs)
  if (delta === 0) return "Today"
  if (delta === 1) return "Tomorrow"
  var d = new Date(Number(ms))
  if (isNaN(d.getTime())) return ""
  if (delta > 1 && delta < 7) return ICS_DAY_NAMES[d.getDay()]
  return ICS_DAY_NAMES[d.getDay()] + " " + d.getDate() + " " + ICS_MONTH_NAMES[d.getMonth()]
}

// The line the card wears when nobody has written a label: what day it is.
function todayHeading(nowMs) {
  var d = new Date(Number(nowMs))
  if (isNaN(d.getTime())) return ""
  return ICS_DAY_NAMES[d.getDay()] + " " + d.getDate() + " " + ICS_MONTH_NAMES[d.getMonth()]
}

// Events grouped into days, in order, with the heading each day wears. This
// is what the tall card draws: a list with a rule across it whenever the day
// changes, rather than a run of times you have to date yourself.
function groupEventsByDay(events, nowMs) {
  var list = Array.isArray(events) ? events : []
  var out = []
  var currentKey = null
  for (var i = 0; i < list.length; i++) {
    var key = startOfDay(list[i].start)
    if (key !== currentKey) {
      currentKey = key
      out.push({ day: key, heading: dayHeading(key, nowMs), events: [] })
    }
    out[out.length - 1].events.push(list[i])
  }
  return out
}
