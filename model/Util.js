.pragma library

// Limits and small helpers the rest of the model builds on. Depends on nothing.

var SCHEMA_VERSION = 2

// Ceilings on anything that arrives as a document rather than as a click. The
// config is a file a person edits by hand, so it is parsed, cloned and drawn;
// an unbounded one would exhaust the shell long before anyone could read it.
var MAX_WIDGETS = 64
var MAX_STRING = 256
// Paths get their own ceiling. 256 characters is generous for a label and
// mean for a file somebody actually has: a photograph three directories deep
// with the camera's own name on it clears it easily, and a truncated path is
// a setting that silently points at nothing.
var MAX_PATH = 1024
var MAX_COLUMNS = 6
var MAX_ROWS = 24
var MAX_MARGIN = 4000
// Bounds of the global scale. `cellSize` stays base px at scale 1, so the
// two read cleanly: a 200px cell at 1.5 is 300px.
//
// The floor is deliberately not 0. At zero every cell is 0x0: the grid draws
// nothing and `cellFromPoint` answers null everywhere, so the widgets are
// gone *and* unclickable, and the only way back is the editor's own chrome.
// A quarter-size card is still small enough to mean "as small as it goes"
// without the knob having a setting that throws the grid away.
var MIN_SCALE = 0.25
var MAX_SCALE = 2

// The opacity every card starts at; a widget can override it on its own.
var DEFAULT_OPACITY = 0.72

// Corner roundness in pixels, per card. Any value from 0 (square) to 60 is
// offered; -1 means "follow the shell theme's own corner radius". Past 60 the
// rounding would crowd out the card's own face, so the knob stops there.
var MIN_RADIUS = 0
var MAX_RADIUS = 60
// How far an embedded plugin panel may be held off each edge of its card.
var MAX_PADDING = 80
var PADDING_SIDES = ["top", "right", "bottom", "left"]
// Where an embedded plugin panel sits in a card taller than it is.
var ALIGNS = ["top", "center", "bottom"]
// Bounds of a plugin panel's size inside its card, as a factor.
var MIN_CONTENT_SCALE = 0.25
var MAX_CONTENT_SCALE = 2
// The radius every card comes up as; a widget can override it on its own. This
// is 20 because that is the size a card first looks "deliberately round"
// without lousing up the corner art — 40 is an important-looking bulge.
var DEFAULT_RADIUS = 20

// Which edge of the screen the grid hugs.
var SIDES = ["left", "right"]
var ANIM_STYLES = ["slide", "fade", "scale", "none"]


function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value)
}

function clampString(value) {
  if (typeof value !== "string") return ""
  return value.length > MAX_STRING ? value.slice(0, MAX_STRING) : value
}

// A path as a setting can hold it. Longer than a string, and with the two
// characters that would make it ambiguous taken out rather than escaped: a
// newline in a path is what turns one line of `find` output into two, and a
// null byte never reaches anything that would keep it. A file named with
// either is a file this cannot address, which is a better answer than a
// listing that quietly means something else.
function clampPath(value) {
  if (typeof value !== "string") return ""
  var out = value.replace(/[\r\n\0]/g, "")
  return out.length > MAX_PATH ? out.slice(0, MAX_PATH) : out
}

function clampNumber(value, min, max, fallback) {
  var n = Number(value)
  if (!isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

// A day, in milliseconds. Used as a step and as the length of an all-day
// event, both of which are calendar days rather than physical ones; the
// arithmetic that has to survive a DST boundary is done in the wall-clock
// domain below, where a day really is 24 hours.
var DAY_MS = 86400000

function padTwo(n) { return n < 10 ? "0" + n : String(n) }

// Number(null) and Number("") are both 0, which is a real value in every range
// this card offers -- a nap cadence omate has not written yet would arrive as
// "never nap" rather than as missing. Absence is checked before conversion.
function numberOrNaN(value) {
  if (value === undefined || value === null || value === "") return NaN
  return Number(value)
}
