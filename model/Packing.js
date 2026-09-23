.pragma library

.import "Layout.js" as Layout
.import "Util.js" as Util

// Placement on the grid: overlap, free cells, relocation and collision
// resolution.

// Do two blocks collide? Sides first: the left grid and the right grid are two
// separate boards, and a cell on one has nothing to do with the same cell on
// the other.
//
// Folding the side in here rather than filtering by it at each call site is
// what lets the whole placement system -- fitting, packing, displacing,
// resolving -- stay exactly as it was. Nothing above this line had to learn
// that there are two grids.
function rectsOverlap(a, b) {
  if (Layout.sideOf(a) !== Layout.sideOf(b)) return false
  return a.col < b.col + b.cols && b.col < a.col + a.cols
    && a.row < b.row + b.rows && b.row < a.row + a.rows
}

// Only enabled widgets take up room. One that is switched off keeps its cell
// recorded so turning it back on puts it where it was, but it does not stop
// anything else moving in meanwhile.
function occupants(config, exceptId) {
  var list = config && Array.isArray(config.widgets) ? config.widgets : []
  var out = []
  for (var i = 0; i < list.length; i++) {
    if (!list[i].enabled) continue
    if (exceptId !== undefined && list[i].id === exceptId) continue
    out.push(list[i])
  }
  return out
}

// Does a block sit inside the grid and clear of everything in `others`? The
// list is passed in rather than read off the config so the caller decides who
// has to give way — which is the whole difference between "this widget is in
// conflict" and "this widget arrived later".
function fitsAmong(layout, block, others) {
  if (block.col < 0 || block.row < 0) return false
  if (block.col + block.cols > layout.columns) return false
  if (block.row + block.rows > Util.MAX_ROWS) return false
  for (var i = 0; i < others.length; i++) {
    if (rectsOverlap(block, others[i])) return false
  }
  return true
}

// First cell a block fits in, scanning left to right then down — the reading
// order, so a widget dropped into a full grid lands where the eye expects the
// next one to go.
function firstFreeCellAmong(layout, cols, rows, others, side) {
  var where = Util.SIDES.indexOf(String(side)) === -1 ? layout.side : String(side)
  for (var row = 0; row < Util.MAX_ROWS; row++) {
    for (var col = 0; col + cols <= layout.columns; col++) {
      var block = { col: col, row: row, cols: cols, rows: rows, side: where }
      if (fitsAmong(layout, block, others)) return { col: col, row: row, side: where }
    }
  }
  return null
}

// Can a `cols` x `rows` block sit at (col, row) without leaving the grid or
// landing on any other live widget?
function canPlace(config, id, col, row, cols, rows, side) {
  var target = findInstance(config, id)
  var where = Util.SIDES.indexOf(String(side)) === -1
    ? Layout.sideOf(target, config.layout) : String(side)
  return fitsAmong(config.layout,
    { col: col, row: row, cols: cols, rows: rows, side: where },
    occupants(config, id))
}

// The first free cell at or below `startRow`, then wrapping to the top. Where
// something pushed out of the way should land: a widget displaced by a drop
// belongs under the thing that displaced it, not back at the top of the grid
// in a cell that happened to be empty.
function firstFreeCellFrom(layout, cols, rows, others, startRow, side) {
  var where = Util.SIDES.indexOf(String(side)) === -1 ? layout.side : String(side)
  var begin = Math.max(0, Math.round(Number(startRow) || 0))
  var offset, row, col
  for (offset = 0; offset < Util.MAX_ROWS; offset++) {
    // Below first, then round the top for the rows already passed.
    row = begin + offset
    if (row >= Util.MAX_ROWS) row = row - Util.MAX_ROWS
    for (col = 0; col + cols <= layout.columns; col++) {
      var block = { col: col, row: row, cols: cols, rows: rows, side: where }
      if (fitsAmong(layout, block, others)) return { col: col, row: row, side: where }
    }
  }
  return null
}

function firstFreeCell(config, id, cols, rows, side) {
  return firstFreeCellAmong(config.layout, cols, rows, occupants(config, id), side)
}

// Put a widget somewhere legal, wherever that turns out to be.
function relocate(config, id) {
  var target = findInstance(config, id)
  if (!target) return false
  var cell = firstFreeCell(config, id, target.cols, target.rows,
    Layout.sideOf(target, config.layout))
  if (!cell) return false
  target.col = cell.col
  target.row = cell.row
  return true
}

// A hand-edited file can put two widgets on the same cell. Settle them in the
// order they appear, each one only having to clear the widgets already
// settled: that way the first entry keeps the cell it asked for and the later
// duplicate is the one that moves. Checking against the whole config instead
// would find the first widget "in conflict" too, and move it out from under
// itself.
function resolveOverlaps(config) {
  var list = config.widgets
  var settled = []
  for (var i = 0; i < list.length; i++) {
    var w = list[i]
    if (!w.enabled) continue
    if (!fitsAmong(config.layout, w, settled)) {
      var cell = firstFreeCellAmong(config.layout, w.cols, w.rows, settled,
        Layout.sideOf(w, config.layout))
      if (cell) { w.col = cell.col; w.row = cell.row }
    }
    settled.push(w)
  }
  return config
}

// How many rows the grid actually uses, for drawing an editor that is as tall
// as the content plus one empty row to drop into.
// The lowest row anything reaches, on either side. The editor draws one row
// past this so there is always somewhere new to drop, and both grids are drawn
// to the same depth so they read as one surface rather than two lists.
function usedRows(config) {
  var list = occupants(config)
  var max = 0
  for (var i = 0; i < list.length; i++) max = Math.max(max, list[i].row + list[i].rows)
  return max
}

function findInstance(config, id) {
  var list = config && Array.isArray(config.widgets) ? config.widgets : []
  var key = String(id || "")
  for (var i = 0; i < list.length; i++) if (list[i].id === key) return list[i]
  return null
}
