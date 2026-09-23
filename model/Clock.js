.pragma library

.import "Util.js" as Util

// What the clock card needs: time zones, offsets and labels.

// The QML JS engine has no Intl and ignores the `timeZone` option on
// toLocaleString — it silently renders local time for every zone — so zone
// offsets are resolved outside, by `date`, and applied as arithmetic here.

// Refuse anything that isn't a plain zoneinfo name before it reaches a
// command line: no "..", no leading slash, no separators of our own.
function isSafeZone(zone) {
  var z = String(zone || "")
  if (z.length === 0 || z.length > 64) return false
  return /^[A-Za-z][A-Za-z0-9_+-]*(\/[A-Za-z0-9_+-]+)*$/.test(z)
}

// Every distinct zone the config names, enabled or not: toggling a widget on
// should not have to wait for a subprocess to answer.
function zonesInUse(config) {
  var list = config && Array.isArray(config.widgets) ? config.widgets : []
  var seen = {}
  var out = []
  for (var i = 0; i < list.length; i++) {
    var zone = list[i].settings ? Util.clampString(list[i].settings.timezone) : ""
    if (!zone || seen[zone] || !isSafeZone(zone)) continue
    seen[zone] = true
    out.push(zone)
  }
  return out
}

// "+0530" -> 330. Anything else -> null, which the caller reads as "unknown".
function parseOffsetToken(token) {
  var m = String(token || "").match(/^([+-])(\d{2})(\d{2})$/)
  if (!m) return null
  var minutes = parseInt(m[2], 10) * 60 + parseInt(m[3], 10)
  return m[1] === "-" ? -minutes : minutes
}

// One "zone<TAB>+0530" line per zone. A zone whose line carries no offset was
// not found in the zoneinfo database and is left out, so the caller can tell
// "not resolved yet" from "resolved to UTC".
function parseZoneOffsets(raw) {
  var out = {}
  var lines = String(raw || "").split("\n")
  for (var i = 0; i < lines.length; i++) {
    var parts = lines[i].split("\t")
    if (parts.length < 2) continue
    var zone = parts[0]
    var minutes = parseOffsetToken(parts[1])
    if (zone && minutes !== null) out[zone] = minutes
  }
  return out
}

// `Date.getTimezoneOffset()` is the minutes for which UTC = local + offset,
// so it reads -330 in IST. A zone offset from `date +%z` is minutes east of
// UTC, so it reads +330 for the same zone. Their sum is two things at once:
// the shift that makes `now` read as that zone's wall clock off the local
// calendar, and the difference between that zone and yours. One number, so
// the big time and the line under it can never disagree.
function zoneShiftMinutes(localOffsetMinutes, zoneOffsetMinutes) {
  var local = Number(localOffsetMinutes)
  var zone = Number(zoneOffsetMinutes)
  if (!isFinite(local) || !isFinite(zone)) return 0
  return local + zone
}

// 570 -> "+9:30". Hours are unpadded and minutes are not, which is how a
// timezone difference is written.
function offsetLabel(minutes) {
  var n = Number(minutes)
  if (!isFinite(n)) return ""
  var abs = Math.abs(Math.round(n))
  var h = Math.floor(abs / 60)
  var m = abs % 60
  return (n < 0 ? "-" : "+") + h + ":" + (m < 10 ? "0" + m : String(m))
}

// "14:30", or "2:30 PM" on a twelve-hour clock.
function clockLabel(ms, twelveHour) {
  var d = new Date(Number(ms))
  if (isNaN(d.getTime())) return ""
  var h = d.getHours()
  var m = d.getMinutes()
  if (!twelveHour) return Util.padTwo(h) + ":" + Util.padTwo(m)
  var suffix = h < 12 ? "AM" : "PM"
  var hour = h % 12
  return (hour === 0 ? 12 : hour) + ":" + Util.padTwo(m) + " " + suffix
}
