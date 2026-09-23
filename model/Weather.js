.pragma library

.import "Util.js" as Util

// What the weather card needs: icons, sun times and day/night.

// wttr.in's j1 response, turned into the handful of values a card draws.
// It is the source the rest of Omarchy already uses, so the condition codes
// here are its codes (WWO's 113/116/119...), not WMO's.

// The glyphs Omarchy's own `omarchy-weather-icon` picks, so a widget and the
// bar agree about what overcast looks like. Codes not in the table fall back
// to the plain cloud rather than to nothing.
var WEATHER_ICONS = [
  { codes: [113], day: "\ue30d", night: "\ue32b" },
  { codes: [116], day: "\ue302", night: "\ue32e" },
  { codes: [119, 122], day: "\ue33d", night: "\ue33d" },
  { codes: [143, 248, 260], day: "\ue313", night: "\ue313" },
  { codes: [176, 263, 353], day: "\ue308", night: "\ue333" },
  { codes: [179, 227, 230, 323, 326, 368], day: "\ue30a", night: "\ue327" },
  { codes: [182, 185, 281, 284, 311, 314, 317, 320, 350, 362, 365, 374, 377],
    day: "\ue3ad", night: "\ue3ad" },
  { codes: [200, 386, 389, 392, 395], day: "\ue31d", night: "\ue31d" },
  { codes: [266, 293, 296, 299, 302, 305, 308, 356, 359], day: "\ue318", night: "\ue318" },
  { codes: [329, 332, 335, 338, 371], day: "\ue31a", night: "\ue31a" }
]

var WEATHER_ICON_FALLBACK = "\ue33d"

function weatherIcon(code, night) {
  var n = parseInt(code, 10)
  if (!isFinite(n)) return WEATHER_ICON_FALLBACK
  for (var i = 0; i < WEATHER_ICONS.length; i++) {
    if (WEATHER_ICONS[i].codes.indexOf(n) !== -1)
      return night ? WEATHER_ICONS[i].night : WEATHER_ICONS[i].day
  }
  return WEATHER_ICON_FALLBACK
}

// "06:18 AM" -> minutes since midnight. Anything else -> null, which the
// caller reads as "cannot tell", and a clock that cannot tell says day.
function parseClockTime(value) {
  var m = String(value || "").match(/^\s*(\d{1,2}):(\d{2})\s*(AM|PM)\s*$/i)
  if (!m) return null
  var rawHour = parseInt(m[1], 10)
  var minutes = parseInt(m[2], 10)
  // Checked before the wrap, not after: 25 % 12 is 1, which would make
  // "25:00 AM" a perfectly good one in the morning.
  if (rawHour < 1 || rawHour > 12 || minutes > 59) return null
  var hour = rawHour % 12
  if (m[3].toUpperCase() === "PM") hour += 12
  return hour * 60 + minutes
}

// Before sunrise or after sunset. Both are wall-clock times at the location,
// and `minutesNow` is too, so no timezone arithmetic is involved.
function isNight(minutesNow, sunrise, sunset) {
  var up = parseClockTime(sunrise)
  var down = parseClockTime(sunset)
  if (up === null || down === null) return false
  var now = Number(minutesNow)
  if (!isFinite(now)) return false
  // Somewhere the sun does not set on a given day, the two can invert.
  if (up >= down) return false
  return now < up || now >= down
}

function firstValue(list) {
  if (!Array.isArray(list) || list.length === 0) return ""
  var entry = list[0]
  if (Util.isPlainObject(entry) && entry.value !== undefined) return String(entry.value)
  return String(entry)
}

function roundedTemp(value) {
  var n = Number(value)
  return isFinite(n) ? String(Math.round(n)) : ""
}

// The whole card, from one response. Returns null when the payload is not a
// weather report at all, so the caller can hold the last good one rather
// than draw an empty card over it.
function parseWeather(raw) {
  var data = raw
  if (typeof raw === "string") {
    try { data = JSON.parse(raw) } catch (e) { return null }
  }
  if (!Util.isPlainObject(data)) return null

  var current = Array.isArray(data.current_condition) ? data.current_condition[0] : null
  if (!Util.isPlainObject(current)) return null

  var today = Array.isArray(data.weather) ? data.weather[0] : null
  var area = Array.isArray(data.nearest_area) ? data.nearest_area[0] : null
  var astronomy = Util.isPlainObject(today) && Array.isArray(today.astronomy) ? today.astronomy[0] : null

  var tempC = roundedTemp(current.temp_C)
  if (tempC === "") return null

  return {
    // wttr pads some descriptions with a trailing space.
    condition: Util.clampString(String(firstValue(current.weatherDesc)).replace(/^\s+|\s+$/g, "")),
    code: parseInt(current.weatherCode, 10),
    tempC: tempC,
    tempF: roundedTemp(current.temp_F),
    highC: Util.isPlainObject(today) ? roundedTemp(today.maxtempC) : "",
    highF: Util.isPlainObject(today) ? roundedTemp(today.maxtempF) : "",
    lowC: Util.isPlainObject(today) ? roundedTemp(today.mintempC) : "",
    lowF: Util.isPlainObject(today) ? roundedTemp(today.mintempF) : "",
    place: Util.clampString(Util.isPlainObject(area) ? firstValue(area.areaName) : ""),
    sunrise: Util.clampString(Util.isPlainObject(astronomy) ? String(astronomy.sunrise || "") : ""),
    sunset: Util.clampString(Util.isPlainObject(astronomy) ? String(astronomy.sunset || "") : ""),
    at: Date.now()
  }
}

function isFahrenheit(units) { return String(units) === "fahrenheit" }

// A temperature the way a weather card writes one: the number and a degree
// sign, no unit letter. The card is not a conversion table.
function tempLabel(observation, units, field) {
  if (!Util.isPlainObject(observation)) return ""
  var key = field + (isFahrenheit(units) ? "F" : "C")
  var value = observation[key]
  return value === undefined || value === "" ? "" : String(value) + "°"
}

// "H:26° L:11°", or nothing when the forecast did not carry a range.
function rangeLabel(observation, units) {
  var high = tempLabel(observation, units, "high")
  var low = tempLabel(observation, units, "low")
  if (high === "" || low === "") return ""
  return "H:" + high + "  L:" + low
}
