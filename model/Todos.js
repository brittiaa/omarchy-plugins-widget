.pragma library

.import "Util.js" as Util

// What the todo card needs: file paths and todo.txt line parsing.

// The list is a text file, and that is the whole design. There is no todo
// service worth making a wallpaper depend on, and the one thing every editor,
// every dotfiles repo and every sync tool already handles is a file with a
// line in it per thing to do:
//
//   # Friday
//   - [ ] ship the calendar widget
//   - [x] reply to the issue
//   ! call the bank
//   buy milk
//
// So the widget reads, and the file is the interface. Ticking something off
// is a keystroke in the editor that is already open, rather than a control on
// a card that sits underneath your windows.
//
// The grammar is deliberately forgiving: markdown checkboxes because that is
// what people already type, todo.txt's leading "x" because that is the other
// thing people already type, a bare line because that is what you write when
// you are in a hurry.

var TODO_MAX_ITEMS = 200
var DEFAULT_TODO_FILE = ".config/omarchy/todos.txt"

// Where a widget's list actually lives. Empty means the default, "~/" and a
// bare name are both resolved against home, and a path that tries to climb
// out with ".." is refused rather than cleaned up -- the same allowlist
// habit the rest of this file has, applied to the one setting here that
// names something on disk.
function todoPath(setting, home) {
  var base = String(home || "").replace(/\/+$/, "")
  var raw = Util.clampPath(setting).replace(/^\s+|\s+$/g, "")
  if (raw === "") return base ? base + "/" + DEFAULT_TODO_FILE : ""
  if (raw.indexOf("~/") === 0) raw = base + raw.slice(1)
  else if (raw.charAt(0) !== "/") raw = base + "/" + raw
  var parts = raw.split("/")
  for (var i = 0; i < parts.length; i++) if (parts[i] === "..") return ""
  return raw
}

// Every distinct file the config asks for, so two cards on the same list are
// one watch rather than two.
function todoPathsInUse(config, home) {
  var list = config && Array.isArray(config.widgets) ? config.widgets : []
  var seen = {}
  var out = []
  for (var i = 0; i < list.length; i++) {
    if (list[i].type !== "todos") continue
    var path = todoPath(list[i].settings ? list[i].settings.file : "", home)
    if (!path || seen[path]) continue
    seen[path] = true
    out.push(path)
  }
  return out
}

// A file into a list. Blank lines and headings are structure rather than
// items; everything else is something to do.
function parseTodos(raw) {
  // Only a string is a file. Anything else is a failed read, not a list with
  // one line in it.
  var lines = (typeof raw === "string" ? raw : "").split("\n")
  var items = []
  var title = ""
  var done = 0
  for (var i = 0; i < lines.length && items.length < TODO_MAX_ITEMS; i++) {
    var line = lines[i].replace(/^\s+|\s+$/g, "")
    if (line === "") continue
    if (line.charAt(0) === "#") {
      // The first heading names the list, which is how a file that already
      // starts with "# Friday" gets a title without a second place to set it.
      if (title === "") title = Util.clampString(line.replace(/^#+\s*/, ""))
      continue
    }
    var item = parseTodoLine(line)
    if (!item) continue
    // The line it came from, so a tick on the card knows which line of the
    // file to rewrite. Everything else about an item is derived; this is the
    // one thing that ties it back to what the user actually typed.
    item.line = i
    if (item.done) done++
    items.push(item)
  }
  return {
    title: title,
    items: items,
    total: items.length,
    done: done,
    remaining: items.length - done
  }
}

// One line. A bullet is optional, a checkbox is optional, todo.txt's leading
// "x " counts as done, and a leading "!" is the one thing on the list that
// gets to stand out.
function parseTodoLine(line) {
  var rest = String(line || "")
  var done = false

  // todo.txt marks a finished task with a lone "x" at the start of the line,
  // and often a completion date after it that is bookkeeping rather than
  // something to read on a wallpaper.
  var todoTxt = /^x\s+(?:\d{4}-\d{2}-\d{2}\s+)?(.*)$/.exec(rest)
  if (todoTxt) { done = true; rest = todoTxt[1] }

  rest = rest.replace(/^[-*+\u2022]\s+/, "")

  var box = /^\[([ xX\u00d7~-])\]\s*(.*)$/.exec(rest)
  if (box) {
    var mark = box[1]
    if (mark !== " ") done = true
    rest = box[2]
  }

  var important = false
  var bang = /^!+\s*(.*)$/.exec(rest)
  if (bang) { important = true; rest = bang[1] }

  rest = rest.replace(/^\s+|\s+$/g, "")
  if (rest === "") return null
  // A rule drawn across the page -- "---", "***", "===" -- is somebody
  // dividing their file up, and a bare "-" is a bullet with nothing after it.
  // Neither is something to do.
  if (/^[-*+_=~]+$/.test(rest)) return null
  return { text: Util.clampString(rest), done: done, important: important, line: -1 }
}

// One line of the file, ticked or unticked, with everything else about it
// left exactly as it was.
//
// This is a *rewrite*, not a re-serialisation: the file is something a person
// types by hand, and a card that reformatted the whole list every time you
// ticked something off would be a card that fights its own editor. So the
// indentation, the bullet, the wording and every other line are untouched,
// and only the mark itself moves.
//
// Returns null when nothing should change -- an index off the end, a heading,
// a blank line, a divider -- so the caller can tell "no" from "no difference"
// and never writes a file it did not mean to.
function setTodoDone(text, lineIndex, done) {
  if (typeof text !== "string") return null
  var lines = text.split("\n")
  var index = Math.round(Number(lineIndex))
  if (!isFinite(index) || index < 0 || index >= lines.length) return null

  var raw = lines[index]
  var indent = /^[ \t]*/.exec(raw)[0]
  var body = raw.slice(indent.length)
  // Only a line that is an item may be ticked. A heading is not a task.
  if (body === "" || body.charAt(0) === "#") return null
  if (!parseTodoLine(body)) return null

  var wanted = done === true
  var next = rewriteTodoMark(body, wanted)
  if (next === null || next === body) return null
  lines[index] = indent + next
  return lines.join("\n")
}

// The mark on one line's worth of text, moved to `done`. Split out from
// setTodoDone because the three ways a list says "finished" each need undoing
// differently, and that is the part worth reading on its own.
function rewriteTodoMark(body, done) {
  // A markdown checkbox: flip the character between the brackets and touch
  // nothing else. This is the common case and the cheapest edit there is.
  var box = /^(\s*(?:[-*+\u2022]\s+)?)\[([ xX\u00d7~-])\]/.exec(body)
  if (box) {
    if ((box[2] !== " ") === done) return body
    return box[1] + "[" + (done ? "x" : " ") + "]" + body.slice(box[0].length)
  }

  // todo.txt's leading "x", optionally followed by a completion date. Undoing
  // drops the date with it: a date on something unfinished is a date that is
  // no longer true.
  var todoTxt = /^x\s+(?:\d{4}-\d{2}-\d{2}\s+)?/.exec(body)
  if (todoTxt) return done ? body : body.slice(todoTxt[0].length)

  // A line with no mark at all. Ticking it gives it a checkbox, after its
  // bullet if it has one, so unticking later leaves a checkbox rather than
  // trying to guess its way back to a bare line.
  if (!done) return body
  var bullet = /^(\s*[-*+\u2022]\s+)/.exec(body)
  return bullet ? bullet[1] + "[x] " + body.slice(bullet[1].length) : "[x] " + body
}

// What the card should draw, in the order it should draw it: anything marked
// "!" first, then what is left, then what is finished -- and only as many as
// there is room for.
//
// The order is the point. A list drawn in file order puts three things you
// have already done at the top of a card with room for four, which is a card
// that has spent its whole surface on the past.
function visibleTodos(parsed, showDone, limit) {
  var items = parsed && Array.isArray(parsed.items) ? parsed.items : []
  var max = limit > 0 ? limit : TODO_MAX_ITEMS
  var out = []
  var pass, i
  // Three passes rather than a sort, so the file's own order survives inside
  // each band -- the list you wrote is still the list you see.
  for (pass = 0; pass < (showDone === false ? 2 : 3) && out.length < max; pass++) {
    for (i = 0; i < items.length && out.length < max; i++) {
      var done = items[i].done === true
      var urgent = items[i].important === true
      if (pass === 0 && (done || !urgent)) continue
      if (pass === 1 && (done || urgent)) continue
      if (pass === 2 && !done) continue
      out.push(items[i])
    }
  }
  return out
}

// How far through the list you are, 0 to 1. An empty list is not zero percent
// done; the card says so in words rather than drawing an empty bar.
function todoProgress(parsed) {
  if (!parsed || !parsed.total) return 0
  return Math.min(1, Math.max(0, parsed.done / parsed.total))
}

// The name on the card: what the user set, else the file's own first heading,
// else the plain word. Never the file name -- "todos.txt" on a card is the
// path telling you about itself rather than about the list.
function todoTitle(setting, parsed) {
  var chosen = Util.clampString(setting).replace(/^\s+|\s+$/g, "")
  if (chosen) return chosen
  if (parsed && parsed.title) return parsed.title
  return "Todo"
}
