.pragma library

.import "Catalogue.js" as Catalogue
.import "Config.js" as Config
.import "Layout.js" as Layout
.import "Packing.js" as Packing
.import "Util.js" as Util

// Every change to a config. Each function returns a new, normalized config and
// leaves its argument alone. Also the drag-and-drop target and the rule that
// every catalogue type is offered.

// Where a card held with its top-left corner at (cardX, cardY) would land,
// and whether it may. The probe is the middle of the block's *first* cell
// rather than the pointer: what should decide the drop is the corner of the
// card you are holding, not the point of the finger holding it.
//
// This lives here rather than in the editor because it is the whole of the
// drag that can be wrong — the pixels-to-cells conversion and the legality of
// the result. Left in a QML delegate it would be reachable only by an actual
// pointer; here it is reachable by a test.
//
// `fit`, when given, is { screenName, heights, maxBottom }: the cards' content
// heights (see Layout.flowRects) and the lowest y a card may reach. A drop
// that would push any card further past that than it already is -- the one in
// hand included -- is refused, so nothing is put where it cannot be seen. The
// flowed rects of the preview come back as `rects`, so the editor draws the
// grid the drop would leave without working it out a second time.
function dropTarget(config, id, cardX, cardY, screenWidth, fit) {
  var target = Packing.findInstance(config, id)
  if (!target) return { cell: null, valid: false, preview: null }
  var layout = config.layout
  var cell = Layout.cellFromPoint(layout, screenWidth,
    cardX + Layout.scaledCell(layout) / 2, cardY + Layout.scaledCell(layout) / 2)
  if (!cell) return { cell: null, valid: false, preview: null }

  // The preview *is* the drop, computed early. The editor lays the grid out
  // from it while the pointer is down and commits the same cell on release,
  // so what you are shown and what you get cannot come apart.
  var preview = placeDisplacing(config, id, cell.col, cell.row, cell.side)
  if (!preview || !fit) return { cell: cell, valid: preview !== null, preview: preview, rects: null }

  var before = Layout.flowRects(layout, widgetsForScreen(config, fit.screenName), screenWidth, fit.heights)
  var after = Layout.flowRects(preview.layout, widgetsForScreen(preview, fit.screenName), screenWidth, fit.heights)
  var limit = Number(fit.maxBottom)
  var valid = true
  if (isFinite(limit)) {
    for (var key in after) {
      var bottom = after[key].y + after[key].height
      var was = before[key] ? before[key].y + before[key].height : -Infinity
      if (bottom > limit && bottom > was) { valid = false; break }
    }
  }
  return { cell: cell, valid: valid, preview: valid ? preview : null, rects: after }
}

//
// The config has always held any number of instances -- every widget carries
// its own id and its own settings, and the grid never cared how many there
// were. What was missing was a way to make one without opening the file, which
// meant three timezones was a feature only the people who read the JSON knew
// they had.

function allowsMultiple(type) {
  var entry = Catalogue.catalogEntry(type)
  return !!(entry && entry.multiple === true)
}

// How many of a type are configured, on the grid or in the tray.
function countOfType(config, type) {
  var list = config && Array.isArray(config.widgets) ? config.widgets : []
  var key = String(type || "")
  var n = 0
  for (var i = 0; i < list.length; i++) if (list[i].type === key) n++
  return n
}

// The next free id for a type: "clock", then "clock-2", "clock-3". Numbered
// rather than random because it is a name a person types at a command line and
// writes in a config file, and because the first one keeps the bare type name
// it has always had -- an update that renamed everyone's "clock" to "clock-1"
// would break every config that mentions it.
function nextInstanceId(config, type) {
  var key = String(type || "")
  if (!Packing.findInstance(config, key)) return key
  for (var n = 2; n <= Util.MAX_WIDGETS + 1; n++) {
    var candidate = key + "-" + n
    if (!Packing.findInstance(config, candidate)) return candidate
  }
  return key + "-" + Date.now()
}

// Somewhere to put a new widget: the first free cell on the side it belongs
// to, or the row below everything if that side is packed. Never nowhere -- a
// widget you asked for and cannot find is worse than one in an awkward cell.
function landingCell(config, cols, rows, side) {
  var where = Util.SIDES.indexOf(String(side)) === -1 ? config.layout.side : String(side)
  var others = Packing.occupants(config)
  for (var row = 0; row < Util.MAX_ROWS; row++) {
    for (var col = 0; col + cols <= config.layout.columns; col++) {
      var block = { col: col, row: row, cols: cols, rows: rows, side: where }
      if (Packing.fitsAmong(config.layout, block, others)) return { col: col, row: row, side: where }
    }
  }
  return { col: 0, row: Math.min(Util.MAX_ROWS - rows, Packing.usedRows(config)), side: where }
}

// Add another of a type, at its defaults.
function addWidget(config, type, side) {
  var next = Config.normalizeConfig(config)
  var entry = Catalogue.catalogEntry(type)
  if (!entry) return next
  if (next.widgets.length >= Util.MAX_WIDGETS) return next
  // The first of a type is always allowed -- that is what puts a type on the
  // list at all. Only the second and beyond ask whether it makes sense.
  if (countOfType(next, entry.type) > 0 && !allowsMultiple(entry.type)) return next

  var instance = Config.defaultInstance(entry.type, nextInstanceId(next, entry.type))
  instance.enabled = true
  var cell = landingCell(next, instance.cols, instance.rows, side)
  instance.col = cell.col
  instance.row = cell.row
  instance.side = cell.side
  next.widgets.push(instance)
  return next
}

// Copy one, settings and shape and all, and put it beside the original.
//
// The useful shape of "another one of these": a second repository card is a
// first one with the name changed, not something you configure from nothing.
function duplicateWidget(config, id) {
  var next = Config.normalizeConfig(config)
  var source = Packing.findInstance(next, id)
  if (!source) return next
  if (next.widgets.length >= Util.MAX_WIDGETS) return next
  if (!allowsMultiple(source.type)) return next

  var copy = Config.defaultInstance(source.type, nextInstanceId(next, source.type))
  copy.enabled = true
  copy.monitor = source.monitor
  copy.cols = source.cols
  copy.rows = source.rows
  copy.opacity = source.opacity
  copy.radius = source.radius
  // Through the same gate a config file goes through, so a copy can never hold
  // a value the original was only getting away with.
  copy.settings = Config.normalizeSettings(Catalogue.catalogEntry(source.type), source.settings)

  var cell = landingCell(next, copy.cols, copy.rows, source.side)
  copy.col = cell.col
  copy.row = cell.row
  copy.side = cell.side
  next.widgets.push(copy)
  return next
}

// Whether a widget can be deleted outright, as opposed to switched off.
//
// The last of a type cannot: every type in the catalogue has a row in the bar
// popup, and that row is an instance. Deleting it would only mean the next
// config read put a fresh one back, switched off -- which looks exactly like
// the delete failing. Switching it off is the operation that was wanted.
function canRemove(config, id) {
  var target = Packing.findInstance(config, id)
  return !!target && countOfType(config, target.type) > 1
}

function removeWidget(config, id) {
  var next = Config.normalizeConfig(config)
  if (!canRemove(next, id)) return next
  var key = String(id)
  var kept = []
  for (var i = 0; i < next.widgets.length; i++) {
    if (next.widgets[i].id !== key) kept.push(next.widgets[i])
  }
  next.widgets = kept
  return next
}

// A config a widget type added later has never been in. It arrives switched
// off, so an update never puts something on the desktop unasked.
function ensureCatalogCoverage(config) {
  var next = Config.normalizeConfig(config)
  var present = {}
  for (var i = 0; i < next.widgets.length; i++) present[next.widgets[i].type] = true

  var types = Catalogue.catalogTypes()
  for (var t = 0; t < types.length; t++) {
    if (present[types[t]]) continue
    if (next.widgets.length >= Util.MAX_WIDGETS) break
    var added = Config.defaultInstance(types[t], types[t])
    added.enabled = false
    next.widgets.push(added)
  }
  return next
}

//
// Every one of these takes a config and returns a new normalized one, so a
// caller can never half-apply a change or leave the grid in a state the
// drawing code has to defend against.

function setEnabled(config, id, enabled) {
  var next = Config.normalizeConfig(config)
  var target = Packing.findInstance(next, id)
  if (!target) return next
  var wasEnabled = target.enabled
  target.enabled = enabled === true
  // Coming back on, its old cell may have been taken while it was away.
  if (target.enabled && !wasEnabled
    && !Packing.canPlace(next, id, target.col, target.row, target.cols, target.rows)) Packing.relocate(next, id)
  return next
}

function toggleEnabled(config, id) {
  var current = Packing.findInstance(config, id)
  return setEnabled(config, id, !(current && current.enabled))
}

// Move a widget to a cell. A drop that does not fit is refused rather than
// nudged: the editor shows whether the cell under the pointer is legal, so a
// refusal is something the user already saw coming.
// Drop a widget on a cell, moving whatever was there out of the way.
//
// This is the whole of what a drop means, and it is here rather than in the
// editor because the editor needs to answer it twice: once every time the
// pointer moves, to show what *would* happen, and once on release to make it
// happen. Two implementations of that would be two chances to disagree, and
// the disagreement would be a card landing somewhere the preview did not say.
//
// Occupied is not the same as illegal. A cell with something in it is the
// most natural place to aim for -- it is where you can see a widget already
// fits -- so the thing already there moves rather than the drop being
// refused. Two rules, in this order:
//
//   - **Swap**, when exactly one widget is in the way and it has the same
//     footprint. It takes the cell the dragged one just left, which is the
//     shortest distance anything has to travel and the only outcome that
//     leaves the grid as full as it found it.
//   - **Push down**, otherwise. Everything in the way is relocated to the
//     first free cell at or below the drop, in reading order, so the widgets
//     you displaced end up under the one you moved rather than scattered
//     into whatever gaps existed above it.
//
// Returns null when the drop cannot happen at all: off the grid, wider than
// the grid, or a grid so full there is nowhere for a displaced widget to go.
// Null means "the highlight should say no"; anything else is the new config.
function placeDisplacing(config, id, col, row, side) {
  var next = Config.normalizeConfig(config)
  var target = Packing.findInstance(next, id)
  if (!target) return null

  var c = Math.round(Number(col))
  var r = Math.round(Number(row))
  if (!isFinite(c) || !isFinite(r)) return null
  if (c < 0 || r < 0) return null
  if (c + target.cols > next.layout.columns) return null
  if (r + target.rows > Util.MAX_ROWS) return null

  // Which grid it is being dropped on. Omitted means "the one it is already
  // on", so every caller that predates two grids still means what it said.
  var toSide = Util.SIDES.indexOf(String(side)) === -1
    ? Layout.sideOf(target, next.layout) : String(side)

  // Where it came from, before anything moves. A widget coming in from the
  // tray has no cell to give back, which is what rules the swap out for it.
  var wasEnabled = target.enabled === true
  var fromCol = target.col
  var fromRow = target.row
  var fromSide = Layout.sideOf(target, next.layout)

  target.enabled = true
  target.col = c
  target.row = r
  target.side = toSide

  var block = { col: c, row: r, cols: target.cols, rows: target.rows, side: toSide }
  var others = Packing.occupants(next, id)
  var displaced = []
  var settled = [target]
  var i
  for (i = 0; i < others.length; i++) {
    if (Packing.rectsOverlap(block, others[i])) displaced.push(others[i])
    else settled.push(others[i])
  }

  if (displaced.length === 0) return next

  // The swap. Only for a widget that had a cell to swap into, and only when
  // the footprints match -- a 2x1 cannot take a 1x1's cell, and pretending
  // otherwise would be an overlap dressed up as a swap.
  if (displaced.length === 1 && wasEnabled
    && displaced[0].cols === target.cols && displaced[0].rows === target.rows) {
    displaced[0].col = fromCol
    displaced[0].row = fromRow
    // Across the screen as well as across the grid: dropping a left-hand card
    // onto a right-hand one trades their places, which is what "swap" means
    // when the two are not on the same board.
    displaced[0].side = fromSide
    return next
  }

  // The push. Nearest first, so the widget closest to the top of the drop is
  // the one that gets the cell closest under it.
  displaced.sort(function (a, b) { return a.row - b.row || a.col - b.col })
  for (i = 0; i < displaced.length; i++) {
    var cell = Packing.firstFreeCellFrom(next.layout,
      displaced[i].cols, displaced[i].rows, settled, r, toSide)
    // Nowhere at all to put it. Refuse the whole drop rather than leave a
    // widget stacked on another one: a half-applied move is worse than none.
    if (!cell) return null
    displaced[i].col = cell.col
    displaced[i].row = cell.row
    settled.push(displaced[i])
  }
  return next
}

// Move a widget already on the grid. A cell with something in it is not a
// refusal any more -- the occupant moves. See placeDisplacing.
function moveWidget(config, id, col, row, side) {
  var target = Packing.findInstance(config, id)
  // Still a no-op for something in the tray: "move" is about rearranging what
  // is on the desktop, and `place` is the one that puts a widget there.
  if (!target || !target.enabled) return Config.normalizeConfig(config)
  var next = placeDisplacing(config, id, col, row, side)
  return next === null ? Config.normalizeConfig(config) : next
}

// Drop a widget onto a cell, switching it on if it was in the tray. Enabling
// and moving are one step on purpose: a widget that arrived on the grid but
// landed nowhere legal, or moved but stayed off, are both states the editor
// would then have to explain.
function placeWidget(config, id, col, row, side) {
  var next = placeDisplacing(config, id, col, row, side)
  return next === null ? Config.normalizeConfig(config) : next
}

// Change one setting on one widget. The value goes through exactly the same
// coercion a value read from the config file does, so nothing the editor can
// send differs from something the file could have said.
function setSetting(config, id, key, value) {
  var next = Config.normalizeConfig(config)
  var target = Packing.findInstance(next, id)
  if (!target) return next
  var spec = Catalogue.settingSpec(target.type, key)
  if (!spec) return next
  target.settings[spec.key] = Config.coerceSetting(spec, value)
  return next
}

// Resize to one of the footprints the type offers. If the new one does not fit
// where the widget is standing, it is moved rather than refused — the size is
// what was asked for, the cell was not.
function resizeWidget(config, id, cols, rows) {
  var next = Config.normalizeConfig(config)
  var target = Packing.findInstance(next, id)
  if (!target) return next
  var c = Math.round(Number(cols))
  var r = Math.round(Number(rows))
  if (!Catalogue.isAllowedSize(target.type, c, r)) return next
  target.cols = c
  target.rows = r
  if (target.col + c > next.layout.columns) target.col = Math.max(0, next.layout.columns - c)
  if (!Packing.canPlace(next, id, target.col, target.row, c, r)) Packing.relocate(next, id)
  return next
}

function cycleSize(config, id) {
  var current = Packing.findInstance(config, id)
  if (!current) return Config.normalizeConfig(config)
  var size = Catalogue.nextSize(current.type, current.cols, current.rows)
  return resizeWidget(config, id, size[0], size[1])
}

// Put everything on one side.
//
// `layout.side` is where a widget goes when it has not said otherwise -- which
// is every widget in every config written before sides existed. Setting it also
// moves what is already placed, because that is what the button saying "Left"
// looks like it does, and because for a desktop using one side it is exactly
// what this always did.
function setSide(config, side) {
  var next = Config.normalizeConfig(config)
  var value = Util.clampString(side)
  if (Util.SIDES.indexOf(value) === -1) return next
  next.layout.side = value
  for (var i = 0; i < next.widgets.length; i++) next.widgets[i].side = value
  return Packing.resolveOverlaps(next)
}

// Move one widget to a side, keeping its cell if that cell is free over there.
function setWidgetSide(config, id, side) {
  var next = Config.normalizeConfig(config)
  var target = Packing.findInstance(next, id)
  var value = Util.clampString(side)
  if (!target || Util.SIDES.indexOf(value) === -1) return next
  if (Layout.sideOf(target, next.layout) === value) return next
  var was = target.side
  target.side = value
  if (Packing.fitsAmong(next.layout, target, Packing.occupants(next, id))) return next
  // Taken over there. Fall back to the first free cell on that side rather
  // than refusing: the side is what was asked for, the cell was incidental.
  var cell = landingCell(next, target.cols, target.rows, value)
  if (!cell) { target.side = was; return next }
  target.col = cell.col
  target.row = cell.row
  return next
}

// Which sides actually have something on them. The editor draws both grids
// regardless -- that is how you discover you can use the other one -- but the
// empty one is drawn as an invitation rather than as a peer.
function sidesInUse(config) {
  var list = Packing.occupants(config)
  var layout = config && config.layout ? config.layout : Layout.normalizeLayout(null)
  var out = {}
  for (var i = 0; i < Util.SIDES.length; i++) out[Util.SIDES[i]] = false
  for (var w = 0; w < list.length; w++) out[Layout.sideOf(list[w], layout)] = true
  return out
}

function setColumns(config, columns) {
  var next = Config.normalizeConfig(config)
  var n = Math.round(Util.clampNumber(columns, 1, Util.MAX_COLUMNS, next.layout.columns))
  next.layout.columns = n
  // Narrowing the grid can strand a widget off its right edge, or leave one
  // wider than the grid itself. Shrink what no longer fits, then repack.
  for (var i = 0; i < next.widgets.length; i++) {
    var w = next.widgets[i]
    if (w.cols > n) {
      var fitted = Catalogue.fitSize(w.type, n)
      w.cols = fitted[0]
      w.rows = fitted[1]
    }
    if (w.col + w.cols > n) w.col = Math.max(0, n - w.cols)
  }
  return Packing.resolveOverlaps(next)
}

// The layout's global scale: one knob for every card. Scale is global only, so
// the grid is the whole story — a card is exactly as big as its cell.
function setScale(config, scale) {
  var n = Number(scale)
  if (!isFinite(n)) return Config.normalizeConfig(config)
  var next = Config.normalizeConfig(config)
  next.layout.scale = Math.round(Util.clampNumber(n, Util.MIN_SCALE, Util.MAX_SCALE, Layout.DEFAULT_LAYOUT.scale) * 100) / 100
  return next
}

// The layout's global opacity, the same deal as `setScale`: moving it writes
// over any per-card opacity so the whole grid matches again. Opaque is 1, and
// an invalid value falls back to the default opacity.
// Whether the grid gets out of the way while a window is in front of it.
// Stored on the layout rather than per card, because a grid half of which
// leaves the screen reads as a fault rather than as a choice.
function setHideWhenWindows(config, on) {
  var next = Config.normalizeConfig(config)
  next.layout.hideWhenWindows = on === true
  return next
}

function setAnimStyle(config, style) {
  var next = Config.normalizeConfig(config)
  next.layout.animStyle = Util.ANIM_STYLES.indexOf(String(style)) === -1
    ? Layout.DEFAULT_LAYOUT.animStyle : String(style)
  return next
}

function setAnimDuration(config, ms) {
  var next = Config.normalizeConfig(config)
  next.layout.animDuration = Math.round(Util.clampNumber(Number(ms), 0, 2000, Layout.DEFAULT_LAYOUT.animDuration))
  return next
}

// One side of the padding around an embedded plugin panel. An unknown side
// changes nothing.
function setPadding(config, side, px) {
  var next = Config.normalizeConfig(config)
  if (Util.PADDING_SIDES.indexOf(String(side)) === -1) return next
  next.layout.padding[side] = Math.round(Util.clampNumber(Number(px), 0, Util.MAX_PADDING,
    Layout.DEFAULT_LAYOUT.padding[side]))
  return next
}

function setPaddingTheme(config, on) {
  var next = Config.normalizeConfig(config)
  next.layout.paddingTheme = on === true
  return next
}

// One side of this card's own padding. A card following the layout starts
// from the layout's four values, so the other three do not jump.
function setCardPadding(config, id, side, px) {
  var next = Config.normalizeConfig(config)
  var target = Packing.findInstance(next, id)
  if (!target || Util.PADDING_SIDES.indexOf(String(side)) === -1) return next
  var own = Layout.normalizePadding(target.padding || next.layout.padding)
  own[side] = Math.round(Util.clampNumber(Number(px), 0, Util.MAX_PADDING, own[side]))
  target.padding = own
  return next
}

// Give a card back to the layout's padding.
function clearCardPadding(config, id) {
  var next = Config.normalizeConfig(config)
  var target = Packing.findInstance(next, id)
  if (target) target.padding = null
  return next
}

function setMaxRows(config, id, rows) {
  var next = Config.normalizeConfig(config)
  var target = Packing.findInstance(next, id)
  if (target) target.maxRows = Math.round(Util.clampNumber(Number(rows), 0, Util.MAX_ROWS, 0))
  return next
}

function setAlign(config, id, align) {
  var next = Config.normalizeConfig(config)
  var target = Packing.findInstance(next, id)
  if (target) target.align = Util.ALIGNS.indexOf(String(align)) === -1 ? "top" : String(align)
  return next
}

function setContentScale(config, id, scale) {
  var next = Config.normalizeConfig(config)
  var target = Packing.findInstance(next, id)
  if (target) target.contentScale = Math.round(Util.clampNumber(Number(scale),
    Util.MIN_CONTENT_SCALE, Util.MAX_CONTENT_SCALE, 1) * 100) / 100
  return next
}

// The padding a card is drawn with: its own, else the layout's. `theme` true
// means the theme's popup padding, which only QML can read, so the numbers
// are then the layout's and are to be ignored.
function effectivePadding(config, instance) {
  if (instance && Util.isPlainObject(instance.padding)) {
    var own = Layout.normalizePadding(instance.padding)
    own.theme = false
    return own
  }
  var layout = config && config.layout ? config.layout : Layout.DEFAULT_LAYOUT
  var out = Layout.normalizePadding(layout.padding)
  out.theme = layout.paddingTheme === true
  return out
}

function setLayoutOpacity(config, opacity) {
  var n = Number(opacity)
  if (!isFinite(n)) return Config.normalizeConfig(config)
  var next = Config.normalizeConfig(config)
  next.layout.opacity = Math.round(Util.clampNumber(n, 0, 1, Layout.DEFAULT_LAYOUT.opacity) * 100) / 100
  dropOpacityOverrides(next)
  return next
}

// With the global opacity changed, a card that had its own keeps it no longer:
// the point of touching the global is the whole grid moving together.
function dropOpacityOverrides(config) {
  for (var i = 0; i < config.widgets.length; i++) config.widgets[i].opacity = null
}

// The layout's global corner radius, same outline as `setLayoutOpacity`: it
// writes over any per-card radius so the whole grid rounds together again.
function setLayoutRadius(config, radius) {
  var n = Number(radius)
  if (!isFinite(n)) return Config.normalizeConfig(config)
  var next = Config.normalizeConfig(config)
  next.layout.radius = Math.round(Util.clampNumber(n, Util.MIN_RADIUS, Util.MAX_RADIUS, Layout.DEFAULT_LAYOUT.radius))
  dropRadiusOverrides(next)
  return next
}

// With the global radius changed, a card that had its own keeps it no longer,
// for the same reason the opacity overrides go.
function dropRadiusOverrides(config) {
  for (var i = 0; i < config.widgets.length; i++) config.widgets[i].radius = null
}

// Back to what the plugin ships with: the grid's default scale, opacity and
// corner radius, with no card keeping its own of either. What was edited is
// lost — this is the "I moved too many knobs" button.
function resetAppearance(config) {
  var next = Config.normalizeConfig(config)
  next.layout.scale = Layout.DEFAULT_LAYOUT.scale
  next.layout.opacity = Layout.DEFAULT_LAYOUT.opacity
  dropOpacityOverrides(next)
  next.layout.radius = Layout.DEFAULT_LAYOUT.radius
  dropRadiusOverrides(next)
  return next
}

// One widget's opacity on its own, so a card can sit over the wallpaper in a
// way the rest of the grid does not need to follow.
function setOpacity(config, id, opacity) {
  var n = Number(opacity)
  if (!isFinite(n)) return Config.normalizeConfig(config)
  var next = Config.normalizeConfig(config)
  var target = Packing.findInstance(next, id)
  if (!target) return next
  target.opacity = Math.round(Util.clampNumber(n, 0, 1, Util.DEFAULT_OPACITY) * 100) / 100
  return next
}

// Give a card back to the layout's opacity after it had its own.
function clearOpacity(config, id) {
  var next = Config.normalizeConfig(config)
  var target = Packing.findInstance(next, id)
  if (!target) return next
  target.opacity = null
  return next
}

// What the card actually renders: its own override when it set one, otherwise
// the layout's global opacity.
function effectiveOpacity(config, instance) {
  if (instance && typeof instance.opacity === "number") return instance.opacity
  var global = config && config.layout ? config.layout.opacity : undefined
  return typeof global === "number" ? global : Layout.DEFAULT_LAYOUT.opacity
}

// What the card actually rounds: its own override when it set one, otherwise
// the layout's global radius, else the built-in default.
function effectiveRadius(config, instance) {
  if (instance && typeof instance.radius === "number") return instance.radius
  var global = config && config.layout ? config.layout.radius : undefined
  return typeof global === "number" ? global : Layout.DEFAULT_LAYOUT.radius
}

// Instances that should be drawn on the output named `screenName`. An empty
// `monitor` means every output, which is what a desktop widget usually wants.
function widgetsForScreen(config, screenName) {
  var list = Packing.occupants(config)
  var name = String(screenName || "")
  var out = []
  for (var i = 0; i < list.length; i++) {
    if (list[i].monitor && list[i].monitor !== name) continue
    out.push(list[i])
  }
  return out
}

// Does this type ask to be clickable? Only a type that says so, and only
// over its own rectangle -- everything else stays click-through.
// Plugin-backed types are always interactive: they host full panels with
// buttons, sliders, and scrollable lists that need mouse input.
function isInteractiveType(type) {
  if (Catalogue.isPluginType(type)) return true
  var entry = Catalogue.catalogEntry(type)
  return !!(entry && entry.interactive === true)
}

// The widgets on a screen that want input. The desktop surface turns exactly
// these rectangles back into an input region and leaves the rest alone.
function interactiveWidgetsForScreen(config, screenName) {
  var list = widgetsForScreen(config, screenName)
  var out = []
  for (var i = 0; i < list.length; i++) {
    if (isInteractiveType(list[i].type)) out.push(list[i])
  }
  return out
}

// Everything switched off, in catalogue order. This is the editor's tray.
function offWidgets(config) {
  var list = config && Array.isArray(config.widgets) ? config.widgets : []
  var out = []
  for (var i = 0; i < list.length; i++) if (!list[i].enabled) out.push(list[i])
  return out
}
