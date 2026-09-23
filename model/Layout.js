.pragma library

.import "Catalogue.js" as Catalogue
.import "Util.js" as Util

// The grid: layout normalization, cell and block geometry, widget rectangles
// and the side a widget sits on.

// Widgets sit in a grid of square cells, the way the phone home screens this
// borrows from lay theirs out. A widget occupies a whole number of cells in
// each direction, so two of them can never half-overlap, and a drag has a
// finite set of places it can land — which is what makes dropping one
// predictable rather than a game of pixels.
//
// `cellSize` is the side of one cell in px at scale 1. `columns` is how many
// cells wide the whole grid is, so widening the grid adds room rather than
// shrinking what is already in it. `scale` multiplies cell and gap together,
// so one knob resizes every widget at once.

var DEFAULT_LAYOUT = {
  side: "right",
  columns: 2,
  cellSize: 200,
  gap: 16,
  marginX: 40,
  marginY: 40,
  scale: 1,
  opacity: Util.DEFAULT_OPACITY,
  radius: Util.DEFAULT_RADIUS,
  // Whether the grid leaves the screen while there is a window in front of it.
  // On by default: these are wallpaper decorations, and a wallpaper decoration
  // showing through the gaps around a window is clutter rather than
  // information. Surface.qml animates them out and back.
  hideWhenWindows: true,
  // How the grid leaves and returns, and how long it takes in milliseconds.
  // The defaults are what was hard-coded before these were settings.
  animStyle: "slide",
  animDuration: 220,
  // How far an embedded plugin panel is held off each edge of its card. The
  // default is the padding the panel's own popup window would have given it.
  padding: { top: 10, right: 10, bottom: 10, left: 10 },
  // When true the theme's popup padding is used on every side and `padding`
  // is kept but ignored. Off by default, which is what the padding was before
  // this was a choice.
  paddingTheme: false
}

function normalizePadding(raw) {
  var source = Util.isPlainObject(raw) ? raw : {}
  var out = {}
  for (var i = 0; i < Util.PADDING_SIDES.length; i++) {
    var side = Util.PADDING_SIDES[i]
    out[side] = Math.round(Util.clampNumber(source[side], 0, Util.MAX_PADDING, DEFAULT_LAYOUT.padding[side]))
  }
  return out
}


function normalizeLayout(raw) {
  var source = Util.isPlainObject(raw) ? raw : {}
  var side = Util.clampString(source.side)
  return {
    side: Util.SIDES.indexOf(side) === -1 ? DEFAULT_LAYOUT.side : side,
    columns: Math.round(Util.clampNumber(source.columns, 1, Util.MAX_COLUMNS, DEFAULT_LAYOUT.columns)),
    cellSize: Math.round(Util.clampNumber(source.cellSize, 60, 600, DEFAULT_LAYOUT.cellSize)),
    gap: Math.round(Util.clampNumber(source.gap, 0, 120, DEFAULT_LAYOUT.gap)),
    marginX: Math.round(Util.clampNumber(source.marginX, 0, Util.MAX_MARGIN, DEFAULT_LAYOUT.marginX)),
    marginY: Math.round(Util.clampNumber(source.marginY, 0, Util.MAX_MARGIN, DEFAULT_LAYOUT.marginY)),
    scale: Math.round(Util.clampNumber(source.scale, Util.MIN_SCALE, Util.MAX_SCALE, DEFAULT_LAYOUT.scale) * 100) / 100,
    opacity: Math.round(Util.clampNumber(source.opacity, 0, 1, DEFAULT_LAYOUT.opacity) * 100) / 100,
    radius: Math.round(Util.clampNumber(source.radius, Util.MIN_RADIUS, Util.MAX_RADIUS, DEFAULT_LAYOUT.radius)),
    // Only an explicit `false` turns this off. Every other value -- absent,
    // null, a string somebody typed -- means the default, which is the same
    // rule every other field here follows and is what keeps a config written
    // before this field existed meaning what it meant then.
    hideWhenWindows: source.hideWhenWindows !== false,
    animStyle: Util.ANIM_STYLES.indexOf(Util.clampString(source.animStyle)) === -1
      ? DEFAULT_LAYOUT.animStyle : Util.clampString(source.animStyle),
    animDuration: Math.round(Util.clampNumber(source.animDuration, 0, 2000, DEFAULT_LAYOUT.animDuration)),
    padding: normalizePadding(source.padding),
    paddingTheme: source.paddingTheme === true
  }
}

// The cell and the gap at the layout's current scale. Everything that measures
// the grid — width, rects, hit testing, the drop probe — reads these, so a
// scale change takes effect everywhere at once.
function scaledCell(layout) {
  return layout.cellSize * layout.scale
}

function scaledGap(layout) {
  return layout.gap * layout.scale
}

// Pixel size of an `n`-block run at the layout's own scale, gaps included.
// Widths and heights both read this, so a scale change takes effect
// everywhere at once.
function blockRunAt(layout, n) {
  return n * layout.cellSize * layout.scale + (n - 1) * layout.gap * layout.scale
}

function blockWidth(layout, cols) {
  return blockRunAt(layout, Math.max(1, Math.round(cols)))
}

function blockHeight(layout, rows) {
  return blockRunAt(layout, Math.max(1, Math.round(rows)))
}

function gridWidth(layout) {
  return blockWidth(layout, layout.columns)
}

// Left edge of the grid inside a `screenWidth`-wide usable area.
// Left edge of a grid inside a `screenWidth`-wide usable area. `side` names
// which of the two; omitting it asks for the layout's own, which is what every
// caller that predates two grids wants.
function gridOriginX(layout, screenWidth, side) {
  var where = Util.SIDES.indexOf(String(side)) === -1 ? layout.side : String(side)
  if (where === "left") return layout.marginX
  return Math.round(screenWidth - layout.marginX - gridWidth(layout))
}

// The widest grid that still fits on a `screenWidth` screen, given the cell
// size and the margin it is held off its edge by. Offering a column count
// that runs off the screen would be offering a widget you cannot see, so the
// editor asks this before it offers anything.
// The widest grid that still fits, given the cell size and the margin it is
// held off the edge by.
//
// Both grids have to fit, not just one, and that is deliberate even for a
// desktop using a single side: the other side is always one drag away, and a
// column count that only works while you have not used it yet is a trap rather
// than a setting. `columnOptions` still offers whatever a config already holds,
// so nobody's grid narrows underneath them.
function maxColumnsFor(layout, screenWidth) {
  var w = Number(screenWidth)
  if (!isFinite(w) || w <= 0) return Util.MAX_COLUMNS
  for (var n = Util.MAX_COLUMNS; n > 1; n--) {
    if (2 * (layout.marginX + blockWidth(layout, n)) <= w) return n
  }
  return 1
}

// Column counts the editor should offer: every one that fits, always
// including the one already in use so a grid configured wider than the screen
// can still be seen and narrowed rather than silently re-labelled.
function columnOptions(layout, screenWidth) {
  var max = Math.max(maxColumnsFor(layout, screenWidth), layout.columns)
  var out = []
  for (var n = 1; n <= max; n++) out.push(n)
  return out
}

// Screen rectangle of a cell block at the layout's scale. The grid's own
// origin is folded in, so this is what both the drawing and the hit testing
// use — they cannot drift.
function cellRect(layout, screenWidth, col, row, cols, rows, side) {
  var step = scaledCell(layout) + scaledGap(layout)
  return {
    x: Math.round(gridOriginX(layout, screenWidth, side) + col * step),
    y: Math.round(layout.marginY + row * step),
    width: blockWidth(layout, cols),
    height: blockHeight(layout, rows)
  }
}

// Screen rectangle of one widget, which is always the cell it occupies: scale
// is the grid's alone, so there is nothing but the grid to measure.
function widgetRect(layout, instance, screenWidth) {
  return cellRect(layout, screenWidth, instance.col, instance.row,
    instance.cols, instance.rows, sideOf(instance, layout))
}

// Every widget's rectangle once content taller than its cells has had its say.
// `heights` maps an id to the height its content asks for; a card never gets
// shorter than its cells, only taller, and a card that grows pushes down
// whatever sits below it in the columns it covers -- by only as much as the
// empty rows in between cannot absorb. Keyed by id.
function flowRects(layout, instances, screenWidth, heights) {
  var list = Array.isArray(instances) ? instances.slice() : []
  var asked = heights || {}
  var gap = Math.round(scaledGap(layout))
  var out = {}
  var done = []
  list.sort(function(a, b) { return a.row - b.row || a.col - b.col })
  for (var i = 0; i < list.length; i++) {
    var base = widgetRect(layout, list[i], screenWidth)
    var r = { x: base.x, y: base.y, width: base.width,
      height: Math.max(base.height, Math.ceil(Number(asked[list[i].id]) || 0)) }
    for (var j = 0; j < done.length; j++) {
      var p = done[j]
      if (p.baseY < base.y && p.rect.x < r.x + r.width && r.x < p.rect.x + p.rect.width)
        r.y = Math.max(r.y, p.rect.y + p.rect.height + gap)
    }
    done.push({ baseY: base.y, rect: r })
    out[list[i].id] = r
  }
  return out
}

// How many rows fit on a `screenHeight`-tall screen, with the vertical margin
// held off both the top and the bottom. At least one, so a tiny screen still
// has somewhere to drop, and never more than the grid allows. The editor draws
// no more rows than this: a grid that runs off the bottom of the monitor is a
// place you can see cells and cannot reach them.
function rowsThatFit(layout, screenHeight) {
  var step = scaledCell(layout) + scaledGap(layout)
  var room = Number(screenHeight) - 2 * layout.marginY + scaledGap(layout)
  if (!(step > 0) || !isFinite(room)) return 1
  return Math.max(1, Math.min(Util.MAX_ROWS, Math.floor(room / step)))
}

// Which cell of which grid a screen point falls in. Both are tried, and the
// answer carries the side it came from, so a drag across the screen changes
// which grid a widget belongs to without the caller having to ask.
//
// Returns null outside either grid's columns or above its top, so a drag that
// wanders into the gap between them does not silently snap to one.
function cellFromPoint(layout, screenWidth, x, y) {
  var step = scaledCell(layout) + scaledGap(layout)
  if (step <= 0) return null
  var localY = y - layout.marginY
  if (localY < 0) return null
  var row = Math.floor(localY / step)
  if (row < 0 || row >= Util.MAX_ROWS) return null

  for (var i = 0; i < Util.SIDES.length; i++) {
    var localX = x - gridOriginX(layout, screenWidth, Util.SIDES[i])
    if (localX < 0) continue
    var col = Math.floor(localX / step)
    if (col < 0 || col >= layout.columns) continue
    return { col: col, row: row, side: Util.SIDES[i] }
  }
  return null
}

// What names an instance apart from its siblings, or "" when nothing does.
//
// By convention a setting called `label` or `title` is the user's own name for
// the thing on the card, so it is also the best name for it in a list of them.
// Read by name rather than by type: a widget that offers one gets this for
// free, and nothing here has to learn what a clock is.
//
// Deliberately only those two keys. The obvious generalisation -- "the first
// non-empty text setting" -- would put a calendar's secret address in the
// editor's tray.
function instanceLabel(instance) {
  var settings = instance && Util.isPlainObject(instance.settings) ? instance.settings : {}
  return Util.clampString(settings.label || settings.title || "").replace(/^\s+|\s+$/g, "")
}

// The name to put on a widget in the popup and in the editor's tray. The
// type's name is enough until there is more than one of that type, at which
// point every row would read the same and something has to tell them apart:
// the name you gave it if you gave it one, and its id if you did not.
//
// The id is worth knowing about -- it is yours, it is what the command line
// takes, and editing it in the config file renames the widget everywhere.
function displayName(config, instance) {
  if (!instance) return ""
  var entry = Catalogue.catalogEntry(instance.type)
  var typeName = entry ? entry.name : String(instance.type)
  var list = config && Array.isArray(config.widgets) ? config.widgets : []
  var sameType = 0
  for (var i = 0; i < list.length; i++) if (list[i].type === instance.type) sameType++
  if (sameType <= 1) return typeName
  return typeName + " · " + (instanceLabel(instance) || instance.id)
}

// The side a widget or a block belongs to. Absent means the layout's own side,
// which is what every config written before widgets had sides means -- and why
// one of those still draws exactly where it always did.
function sideOf(block, layout) {
  var value = block ? Util.clampString(block.side) : ""
  // Called with a null block to mean "whatever the layout calls home", which
  // is what an unset side resolves to.
  if (Util.SIDES.indexOf(value) !== -1) return value
  return layout && Util.SIDES.indexOf(Util.clampString(layout.side)) !== -1
    ? Util.clampString(layout.side) : DEFAULT_LAYOUT.side
}
