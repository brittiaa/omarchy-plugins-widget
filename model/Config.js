.pragma library

.import "Catalogue.js" as Catalogue
.import "Clock.js" as Clock
.import "Layout.js" as Layout
.import "Packing.js" as Packing
.import "Util.js" as Util

// Reading a config: instances, settings coercion and whole-config
// normalization.

function defaultInstance(type, id) {
  var entry = Catalogue.catalogEntry(type)
  if (!entry) return null
  var settings = Catalogue.defaultsFor(entry.type)
  var size = Catalogue.defaultSize(type)
  return {
    id: String(id),
    type: entry.type,
    enabled: true,
    monitor: "",
    // Overwritten with a real side the moment this goes through
    // `normalizeInstance`, which everything reaching the config does.
    side: "",
    col: 0,
    row: 0,
    cols: size[0],
    rows: size[1],
    // null means "follow the layout's global opacity"; a number overrides the
    // layout for this card alone.
    opacity: null,
    // null means "follow the layout's global radius", the same as opacity
    // above it. A number overrides the layout for this card alone, and -1
    // follows the theme's Hyprland rounding.
    //
    // Both must be null here rather than a literal, because `defaultConfig`
    // builds an instance straight from this and everything else in the
    // program goes through `normalizeInstance` -- which resolves an absent
    // radius to null. A literal here meant the same field held two different
    // shapes depending on which door the config came in by, and the editor
    // read it raw and drew a three-pixel ring around a card rounded twenty.
    // Read it through `effectiveRadius`, never off the instance.
    radius: null,
    // null follows the layout's padding; four numbers override it for this
    // card. Only an embedded plugin panel reads it, like the layout's.
    padding: null,
    // How many rows the card may grow to before its content shrinks to fit
    // instead. 0 is no limit. Never less than the card's own rows.
    maxRows: 0,
    // Where the panel sits when the card is taller than it.
    align: "top",
    // How big the panel is drawn, as a factor of its own size. Still never
    // wider than the card: past that the width wins.
    contentScale: 1,
    settings: settings
  }
}

// The first config anyone gets: an empty right-hand grid.
//
// Nothing is on. What belongs on someone's wallpaper is not something this
// plugin can guess, and it is even less guessable now that most of the
// catalogue comes from whichever Omarchy plugins the user happens to have
// installed -- a card chosen for them out of that set would be a card they did
// not ask for. `ensureCatalogCoverage` still puts every type, built-in and
// discovered, on the bar's list switched off, so a fresh install is one click
// from a widget and zero clicks from a clean desktop.
function defaultConfig() {
  return { version: Util.SCHEMA_VERSION, layout: Layout.normalizeLayout(Layout.DEFAULT_LAYOUT), widgets: [] }
}

function normalizeSettings(entry, raw) {
  var source = Util.isPlainObject(raw) ? raw : {}
  var schema = Array.isArray(entry.settings) ? entry.settings : []
  var out = {}
  // Driven by the schema, not by the file: an unknown key is dropped, and
  // every known key lands as the kind of value its type promises.
  for (var i = 0; i < schema.length; i++) {
    var spec = schema[i]
    var value = source[spec.key]
    out[spec.key] = coerceSetting(spec, value)
  }
  return out
}

function coerceSetting(spec, value) {
  var fallback = spec.defaultValue
  if (value === undefined || value === null) return fallback

  if (spec.type === "boolean") return value === true
  // "integer" is the plugin manifest alias for "number".
  if (spec.type === "number" || spec.type === "integer") return Util.clampNumber(value, -1e6, 1e6, fallback)

  // "enum" is the plugin manifest alias for "choice".
  if (spec.type === "choice" || spec.type === "enum") {
    var wanted = Util.clampString(value)
    var options = Array.isArray(spec.options) ? spec.options : []
    for (var i = 0; i < options.length; i++) {
      var candidate = Util.isPlainObject(options[i]) ? options[i].value : options[i]
      if (String(candidate) === wanted) return wanted
    }
    return fallback
  }

  if (spec.type === "path") return Util.clampPath(value)

  if (spec.type === "timezone") {
    // A zone that is not a zone would reach a command line as one. Empty is
    // always allowed and means "my own clock".
    var zone = Util.clampString(value)
    return zone === "" || Clock.isSafeZone(zone) ? zone : fallback
  }

  return Util.clampString(value)
}

function normalizeInstance(raw, index, layout) {
  if (!Util.isPlainObject(raw)) return null
  var entry = Catalogue.catalogEntry(Util.clampString(raw.type))
  if (!entry) return null

  var id = Util.clampString(raw.id) || (entry.type + "-" + (index + 1))
  var out = defaultInstance(entry.type, id)

  if (typeof raw.enabled === "boolean") out.enabled = raw.enabled
  out.monitor = Util.clampString(raw.monitor)
  // Resolved to one of the two sides here, once, rather than left as "follow
  // the layout" for everything downstream to work out.
  //
  // That matters more than it looks: `rectsOverlap` is handed bare blocks with
  // no layout in reach, so an unresolved side there has to guess -- and a
  // guess means two widgets on what it thinks are different grids, quietly
  // drawn on top of each other. Making it explicit at the door means nothing
  // below this line can get it wrong.
  //
  // A file that says nothing, or says something that is not a side, still
  // means "wherever the rest of them are", which is what every config written
  // before widgets had sides means.
  var side = Util.clampString(raw.side)
  out.side = Util.SIDES.indexOf(side) === -1 ? Layout.sideOf(null, layout) : side

  // A footprint the type does not offer is not a footprint. Falling back to
  // the default keeps a hand-edited file from producing a widget that the
  // editor cannot represent or resize back.
  //
  // This holds for a discovered plugin exactly as it does for a built-in: the
  // sizes we generate for one are a real list, and isAllowedSize is checked
  // against that same list, so there is nothing here to exempt.
  var cols = Math.round(Util.clampNumber(raw.cols, 1, Util.MAX_COLUMNS, out.cols))
  var rows = Math.round(Util.clampNumber(raw.rows, 1, Util.MAX_ROWS, out.rows))
  if (Catalogue.isAllowedSize(entry.type, cols, rows)) { out.cols = cols; out.rows = rows }

  // A size the type offers but this grid is too narrow for is not a size this
  // config can hold: left alone it would draw off the edge of the grid and no
  // free cell would ever be found for it, because there is no column it fits
  // in. Fall back to the widest footprint that does fit.
  if (out.cols > layout.columns) {
    var fitted = Catalogue.fitSize(entry.type, layout.columns)
    out.cols = fitted[0]
    out.rows = fitted[1]
  }

  // Clamped so a widget can never begin off the right of the grid; overlaps
  // are resolved later, once every widget's footprint is known.
  var maxCol = Math.max(0, layout.columns - out.cols)
  out.col = Math.round(Util.clampNumber(raw.col, 0, maxCol, 0))
  out.row = Math.round(Util.clampNumber(raw.row, 0, Util.MAX_ROWS - 1, 0))

  // Absent or null keeps "follow the layout's global opacity"; anything else
  // is a per-card override.
  out.opacity = (raw.opacity === undefined || raw.opacity === null)
    ? null
    : Math.round(Util.clampNumber(raw.opacity, 0, 1, Util.DEFAULT_OPACITY) * 100) / 100
  out.radius = (raw.radius === undefined || raw.radius === null)
    ? null
    : Math.round(Util.clampNumber(raw.radius, -1, 400, Util.DEFAULT_RADIUS))
  out.padding = Util.isPlainObject(raw.padding) ? Layout.normalizePadding(raw.padding) : null
  out.maxRows = Math.round(Util.clampNumber(raw.maxRows, 0, Util.MAX_ROWS, 0))
  out.align = Util.ALIGNS.indexOf(String(raw.align)) === -1 ? "top" : String(raw.align)
  out.contentScale = Math.round(Util.clampNumber(raw.contentScale,
    Util.MIN_CONTENT_SCALE, Util.MAX_CONTENT_SCALE, 1) * 100) / 100
  out.settings = normalizeSettings(entry, raw.settings)
  return out
}

// Configs written against the free-placement model that came before the grid
// carry an `anchor` and pixel offsets and no cell at all. Rather than drop
// them, keep everything that still means something and let the packer below
// find each widget a cell.
function isLegacyInstance(raw) {
  return Util.isPlainObject(raw) && raw.col === undefined && raw.row === undefined
    && (raw.anchor !== undefined || raw.offsetX !== undefined || raw.scale !== undefined)
}

function normalizeConfig(raw) {
  var source = Util.isPlainObject(raw) ? raw : {}
  var layout = Layout.normalizeLayout(source.layout)
  var list = Array.isArray(source.widgets) ? source.widgets : []

  var widgets = []
  var seen = {}
  var unplaced = []
  for (var i = 0; i < list.length && widgets.length < Util.MAX_WIDGETS; i++) {
    var legacy = isLegacyInstance(list[i])
    var inst = normalizeInstance(list[i], widgets.length, layout)
    if (!inst || seen[inst.id]) continue
    seen[inst.id] = true
    widgets.push(inst)
    if (legacy) unplaced.push(inst.id)
  }

  var config = { version: Util.SCHEMA_VERSION, layout: layout, widgets: widgets }

  // Anything migrated in has no opinion about where it goes, so it is packed
  // rather than trusted. Everything else keeps the cell it was given unless it
  // collides with something already placed.
  for (var u = 0; u < unplaced.length; u++) Packing.relocate(config, unplaced[u])
  Packing.resolveOverlaps(config)
  return config
}
