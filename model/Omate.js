.pragma library

.import "Util.js" as Util

// What the Omate card needs: plugin file URLs and chase labels.

// The pet lives in another plugin, so everything here is about talking to a
// stranger: a path it hands back, a number it may not have written yet, a
// cadence it holds in seconds. All of it is logic with a right answer, so it
// is here rather than in the card.

// A local filesystem path as a URL a Loader can take. The omate service hands
// paths back already percent-decoded, so they are encoded again -- a plugin
// installed under a directory with a space in it is otherwise a URL that
// silently resolves to nothing. A value that is already a URL is passed
// through; anything that is neither is refused rather than guessed at, and the
// caller falls back to not drawing.
function pluginFileUrl(path) {
  var p = String(path === undefined || path === null ? "" : path)
  if (p.length === 0) return ""
  if (p.indexOf("://") !== -1) return p
  if (p.charAt(0) !== "/") return ""
  return "file://" + encodeURI(p).replace(/#/g, "%23").replace(/\?/g, "%3F")
}

// The chase cadences omate's own panel offers, in its own words. Seconds are
// the unit omate stores, so they are the key here too.
var CHASE_LABELS = {
  10: "Playful",
  60: "Now and then",
  300: "Occasional",
  1800: "Rare"
}

// What the chase row says it is doing. A cooldown set over the IPC is a
// legitimate value with no chip of its own, so it is spelled out rather than
// leaving the row looking unset.
function chaseLabel(enabled, seconds) {
  if (enabled !== true) return "Off"
  var n = Number(seconds)
  if (!isFinite(n)) return "Off"
  var rounded = Math.round(n)
  return CHASE_LABELS[rounded] ? CHASE_LABELS[rounded] : "Every " + rounded + "s"
}

// A number read out of another plugin's settings, clamped into the range the
// control offers. A key that plugin has not written yet arrives as undefined,
// and Math.round(undefined) is NaN -- which reaches an `int` property as a
// type error and a zero. The fallback is the same default omate itself uses.
function settingNumber(value, fallback, min, max) {
  var n = Util.numberOrNaN(value)
  if (!isFinite(n)) n = Util.numberOrNaN(fallback)
  if (!isFinite(n)) n = min
  return Math.max(min, Math.min(max, Math.round(n)))
}
