.pragma library

.import "Util.js" as Util

// What the photo card needs: file selection and rotation.

// The photo card is handed one path and works the rest out. A path naming an
// image file is that photograph; anything else is taken for a directory and
// shown one picture at a time. Deciding it by asking the filesystem would
// mean the card could draw nothing until a process came back, so it is
// decided by the name -- and when the guess is wrong the folder listing
// simply comes back empty, which is the same thing an empty folder does.

var PHOTO_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "gif", "bmp"]

// Ceiling on one folder's listing. Pointing this at a directory of ten
// thousand photographs is an ordinary thing to do; holding all ten thousand
// paths in the shell to show one of them at a time is not.
var MAX_PHOTOS = 400

// An absolute path from what the user typed or the chooser handed back.
// Relative to home, "~" expanded, and any path walking upwards refused
// outright -- the same shape `todoPath` uses, for the same reason: this
// string becomes an argument to a process.
function photoPath(setting, home) {
  var base = String(home || "").replace(/\/+$/, "")
  var raw = Util.clampPath(setting).replace(/^\s+|\s+$/g, "")
  if (raw === "") return ""
  if (raw.indexOf("~/") === 0) raw = base + raw.slice(1)
  else if (raw.charAt(0) !== "/") raw = base ? base + "/" + raw : ""
  if (raw === "" || raw.charAt(0) !== "/") return ""
  var parts = raw.split("/")
  for (var i = 0; i < parts.length; i++) if (parts[i] === "..") return ""
  return raw.replace(/\/+$/, "") || "/"
}

// The extension, lowercased and without the dot, or "" for a path that has
// none in its last segment. A dot in a directory name is not an extension.
function pathExtension(path) {
  var p = String(path || "")
  var name = p.slice(p.lastIndexOf("/") + 1)
  var dot = name.lastIndexOf(".")
  if (dot <= 0) return ""
  return name.slice(dot + 1).toLowerCase()
}

function isPhotoFile(path) {
  return PHOTO_EXTENSIONS.indexOf(pathExtension(path)) !== -1
}

// What a photo card's `path` setting points at: one picture, a folder of
// them, or nothing yet. One answer, asked for by the card, by the folder
// scanner and by the editor, so none of them can disagree about which of the
// two a path is.
function photoTarget(setting, home) {
  var path = photoPath(setting, home)
  if (!path) return { path: "", kind: "none" }
  return { path: path, kind: isPhotoFile(path) ? "image" : "folder" }
}

// Every directory a photo card is pointed at, once each. What the service
// scans; a card pointed at a single file asks for nothing.
function photoFoldersInUse(config, home) {
  var list = config && Array.isArray(config.widgets) ? config.widgets : []
  var seen = {}
  var out = []
  for (var i = 0; i < list.length; i++) {
    if (list[i].type !== "photo") continue
    var target = photoTarget(list[i].settings ? list[i].settings.path : "", home)
    if (target.kind !== "folder" || seen[target.path]) continue
    seen[target.path] = true
    out.push(target.path)
  }
  return out
}

// One path per line, as `find` prints them. Sorted so the order a slideshow
// walks is the order the folder reads in a file manager, rather than whatever
// order the directory happens to be stored in -- a slideshow that reshuffles
// itself every rescan is one you cannot ever leave on a picture.
function parsePhotoList(raw) {
  var text = typeof raw === "string" ? raw : ""
  var lines = text.split("\n")
  var out = []
  for (var i = 0; i < lines.length && out.length < MAX_PHOTOS; i++) {
    var line = lines[i].replace(/\s+$/, "")
    if (line.charAt(0) !== "/") continue
    if (!isPhotoFile(line)) continue
    out.push(line)
  }
  out.sort()
  return out
}

// Which picture comes next. `roll` is a number in [0, 1) -- the caller's
// random -- so the shuffle is a decision this can be tested on rather than
// one buried in a timer.
//
// Shuffle never lands on the picture already up, because a slideshow that
// sometimes does nothing when it changes reads as broken. With one picture
// there is nowhere else to go and it stays.
function nextPhotoIndex(count, index, shuffle, roll) {
  var n = Math.round(Number(count) || 0)
  if (n <= 1) return 0
  var current = Math.round(Number(index) || 0)
  if (current < 0 || current >= n) current = 0
  if (shuffle !== true) return (current + 1) % n
  var r = Number(roll)
  if (!isFinite(r) || r < 0 || r >= 1) r = 0
  // Drawn from the n-1 pictures that are not the one on screen, so every
  // change is a change.
  var pick = Math.floor(r * (n - 1))
  if (pick >= n - 1) pick = n - 2
  return pick >= current ? pick + 1 : pick
}

// How long a picture stays up, in milliseconds. "0" is the setting's way of
// saying never, and answers 0 -- the caller runs no timer at all rather than
// one that fires immediately.
function photoIntervalMs(setting) {
  var seconds = Math.round(Number(setting))
  if (!isFinite(seconds) || seconds <= 0) return 0
  return Math.max(5, Math.min(86400, seconds)) * 1000
}

// The picture at an index, clamped rather than wrapped: a list that shrank
// under a card mid-slideshow should show its last picture, not jump to the
// front.
function photoAt(files, index) {
  if (!Array.isArray(files) || files.length === 0) return ""
  var i = Math.round(Number(index) || 0)
  if (i < 0) i = 0
  if (i >= files.length) i = files.length - 1
  return String(files[i])
}

// The file's own name, without the directory or the extension. Only ever
// shown when the user has asked for a caption and given none of their own.
function photoName(path) {
  var p = String(path || "")
  var name = p.slice(p.lastIndexOf("/") + 1)
  var dot = name.lastIndexOf(".")
  return dot > 0 ? name.slice(0, dot) : name
}
