.pragma library

.import "Util.js" as Util

// What the repo and contribution cards need: repo names, pull counts,
// contribution graphs.

// The public REST API, unauthenticated: sixty requests an hour per address,
// which two repositories refreshed every half hour is comfortably inside.

// "owner/name", to GitHub's own rules for both halves. This becomes two path
// segments, so it is checked rather than trusted.
function isSafeRepo(value) {
  if (typeof value !== "string") return false
  var parts = value.split("/")
  if (parts.length !== 2) return false
  if (!isSafeLogin(parts[0])) return false
  var name = parts[1]
  if (name.length === 0 || name.length > 100) return false
  return /^[A-Za-z0-9._-]+$/.test(name) && name !== "." && name !== ".."
}

function reposInUse(config) {
  var list = config && Array.isArray(config.widgets) ? config.widgets : []
  var seen = {}
  var out = []
  for (var i = 0; i < list.length; i++) {
    if (list[i].type !== "repo-pulse") continue
    var repo = list[i].settings ? Util.clampString(list[i].settings.repo) : ""
    if (!repo || seen[repo] || !isSafeRepo(repo)) continue
    seen[repo] = true
    out.push(repo)
  }
  return out
}

function parseRepo(raw) {
  var data = raw
  if (typeof raw === "string") {
    try { data = JSON.parse(raw) } catch (e) { return null }
  }
  if (!Util.isPlainObject(data)) return null
  if (typeof data.full_name !== "string" || data.full_name === "") return null
  return {
    fullName: Util.clampString(data.full_name),
    description: Util.clampString(typeof data.description === "string" ? data.description : ""),
    stars: Math.max(0, Math.round(Util.clampNumber(data.stargazers_count, 0, 1e9, 0))),
    forks: Math.max(0, Math.round(Util.clampNumber(data.forks_count, 0, 1e9, 0))),
    issues: Math.max(0, Math.round(Util.clampNumber(data.open_issues_count, 0, 1e9, 0))),
    pushedAt: Util.clampString(typeof data.pushed_at === "string" ? data.pushed_at : "")
  }
}

// GitHub's `open_issues_count` counts pull requests as issues, which is a
// long-standing quirk of the API and not what anybody means by "issues". The
// search endpoint gives the pull request count on its own, so the two can be
// told apart and shown as the two different things they are.
function parsePullCount(raw) {
  var data = raw
  if (typeof raw === "string") {
    try { data = JSON.parse(raw) } catch (e) { return null }
  }
  if (!Util.isPlainObject(data)) return null
  var n = Number(data.total_count)
  if (!isFinite(n) || n < 0) return null
  return Math.round(n)
}

// The four numbers the card shows. `issues` is what is left once the pull
// requests are taken back out of GitHub's combined count; until that count
// has arrived the combined figure is shown rather than a wrong smaller one.
function repoStats(info, pulls) {
  if (!Util.isPlainObject(info)) return null
  // Checked for absence before coercion: Number(null) is 0, which is a
  // perfectly finite number and would report "no open pull requests" for a
  // repository whose count has simply not arrived yet.
  var known = pulls !== null && pulls !== undefined && isFinite(Number(pulls)) && Number(pulls) >= 0
  var prs = known ? Number(pulls) : 0
  return {
    stars: info.stars,
    forks: info.forks,
    issues: known ? Math.max(0, info.issues - Math.round(prs)) : info.issues,
    pulls: known ? Math.round(prs) : null
  }
}

// Where the name on the card points. GitHub's own `full_name` is preferred
// over whatever was typed into the config: it is canonical, so a repository
// that has since been renamed resolves to where it actually lives rather than
// to a redirect. Either way it is checked again before becoming a URL — this
// one arrives over the network.
function repoUrl(info, configured) {
  var candidates = []
  if (Util.isPlainObject(info) && typeof info.fullName === "string") candidates.push(info.fullName)
  if (typeof configured === "string") candidates.push(configured)
  for (var i = 0; i < candidates.length; i++) {
    if (isSafeRepo(candidates[i])) return "https://github.com/" + candidates[i]
  }
  return ""
}

// 46148 -> "46.1k". Counts on this card are for scale, not for arithmetic.
function compactCount(value) {
  var n = Number(value)
  if (!isFinite(n) || n < 0) return "0"
  if (n < 1000) return String(Math.round(n))
  if (n < 1000000) {
    var k = n / 1000
    return (k < 10 ? k.toFixed(1).replace(/\.0$/, "") : String(Math.round(k))) + "k"
  }
  var m = n / 1000000
  return (m < 10 ? m.toFixed(1).replace(/\.0$/, "") : String(Math.round(m))) + "M"
}

// "2026-09-04T16:07:18Z" against now, as the coarsest true thing: "3h",
// "2d", "5w". A repository's last push does not want a clock.
function sinceLabel(iso, nowMs) {
  var then = Date.parse(String(iso || ""))
  if (!isFinite(then)) return ""
  var now = Number(nowMs)
  if (!isFinite(now)) return ""
  var seconds = Math.floor((now - then) / 1000)
  if (seconds < 0) return "now"
  if (seconds < 3600) return Math.max(1, Math.floor(seconds / 60)) + "m"
  if (seconds < 86400) return Math.floor(seconds / 3600) + "h"
  if (seconds < 604800) return Math.floor(seconds / 86400) + "d"
  if (seconds < 2592000) return Math.floor(seconds / 604800) + "w"
  if (seconds < 31536000) return Math.floor(seconds / 2592000) + "mo"
  return Math.floor(seconds / 31536000) + "y"
}

//
// GitHub does not publish the contribution calendar through its REST API,
// but the page that draws it is served on its own at
// /users/<login>/contributions and needs no token. That is the whole source:
// github.com directly, no third party standing between the desktop and it.

// A login is a path segment, so it is checked against GitHub's own rule
// before it can become one: alphanumerics and single hyphens, not starting
// or ending with one, 39 characters at most.
function isSafeLogin(login) {
  // The type is checked, not just coerced. A GitHub login may be all digits,
  // so unlike a timezone — whose pattern has to start with a letter and
  // rejects a stray number on the way past — the pattern here would happily
  // accept one. Anything that is not a string got here by mistake.
  if (typeof login !== "string") return false
  var value = login
  if (value.length === 0 || value.length > 39) return false
  return /^[A-Za-z0-9](?:[A-Za-z0-9]|-(?=[A-Za-z0-9])){0,38}$/.test(value)
}

// Every distinct login the config names, enabled or not, so switching a
// widget on does not have to wait for a request.
function loginsInUse(config) {
  var list = config && Array.isArray(config.widgets) ? config.widgets : []
  var seen = {}
  var out = []
  for (var i = 0; i < list.length; i++) {
    if (list[i].type !== "github") continue
    var login = list[i].settings ? Util.clampString(list[i].settings.login) : ""
    if (!login || seen[login] || !isSafeLogin(login)) continue
    seen[login] = true
    out.push(login)
  }
  return out
}

var MAX_CONTRIBUTION_BYTES = 4194304

// Pull the calendar out of the page. Every day is a `<td>` carrying both a
// date and a level; the legend swatches carry a level and no date, which is
// why the date is what the pattern leads with — matching on level alone
// picks up five squares that are not days.
function parseContributions(raw) {
  var html = String(raw || "")
  if (html.length === 0 || html.length > MAX_CONTRIBUTION_BYTES) return null

  var pattern = /data-date="(\d{4}-\d{2}-\d{2})"[^>]*?data-level="(\d)"/g
  var days = []
  var match
  while ((match = pattern.exec(html)) !== null) {
    days.push({ date: match[1], level: parseInt(match[2], 10) })
  }
  if (days.length === 0) return null

  // The page lays the calendar out a row at a time — every seventh day, not
  // every day — so what arrives is in reading order for a grid, not in date
  // order. Sort before anything downstream assumes otherwise.
  days.sort(function(a, b) { return a.date < b.date ? -1 : (a.date > b.date ? 1 : 0) })

  var total = ""
  var totalMatch = html.match(/([\d,]+)\s+contributions?\s+in\s+the\s+last\s+year/i)
  if (totalMatch) total = totalMatch[1]

  return { total: total, days: days, at: Date.now() }
}

function dayOfWeekUTC(date) {
  var parts = String(date || "").split("-")
  if (parts.length !== 3) return -1
  var d = new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])))
  return isFinite(d.getTime()) ? d.getUTCDay() : -1
}

function dateMs(date) {
  var parts = String(date || "").split("-")
  if (parts.length !== 3) return NaN
  return Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]))
}

// The most recent `weeks` columns, as flat cells the drawing can place
// without doing any date arithmetic of its own. Columns are weeks, rows are
// days of the week, Sunday first, which is the shape GitHub's own grid has.
function contributionGrid(contributions, weeks) {
  var days = contributions && Array.isArray(contributions.days) ? contributions.days : []
  var wanted = Math.max(1, Math.round(Number(weeks) || 1))
  if (days.length === 0) return { columns: 0, cells: [], from: "", to: "", shown: 0 }

  // Weeks are counted from the Sunday on or before the first day, so a run
  // that starts mid-week still lands in the right row.
  var firstMs = dateMs(days[0].date)
  var firstDow = dayOfWeekUTC(days[0].date)
  if (!isFinite(firstMs) || firstDow < 0) return { columns: 0, cells: [], from: "", to: "", shown: 0 }
  var originMs = firstMs - firstDow * Util.DAY_MS

  var placed = []
  var lastColumn = 0
  for (var i = 0; i < days.length; i++) {
    var ms = dateMs(days[i].date)
    var dow = dayOfWeekUTC(days[i].date)
    if (!isFinite(ms) || dow < 0) continue
    var column = Math.floor((ms - originMs) / (7 * Util.DAY_MS))
    if (column > lastColumn) lastColumn = column
    placed.push({ column: column, row: dow, level: days[i].level, date: days[i].date })
  }
  if (placed.length === 0) return { columns: 0, cells: [], from: "", to: "", shown: 0 }

  var firstWanted = Math.max(0, lastColumn - wanted + 1)
  var cells = []
  var from = ""
  var to = ""
  for (var c = 0; c < placed.length; c++) {
    if (placed[c].column < firstWanted) continue
    cells.push({
      col: placed[c].column - firstWanted,
      row: placed[c].row,
      level: placed[c].level,
      date: placed[c].date
    })
    if (from === "" || placed[c].date < from) from = placed[c].date
    if (to === "" || placed[c].date > to) to = placed[c].date
  }

  return {
    columns: lastColumn - firstWanted + 1,
    cells: cells,
    from: from,
    to: to,
    shown: cells.length
  }
}

// How many week columns fit in `width` at a given cell and gap. At least one,
// so a card too narrow to hold anything still draws a column rather than
// dividing by nothing.
function weeksThatFit(width, cell, gap) {
  var step = Number(cell) + Number(gap)
  if (!isFinite(step) || step <= 0) return 1
  return Math.max(1, Math.floor((Number(width) + Number(gap)) / step))
}

// "23 weeks", and the singular when it is one.
function weeksLabel(columns) {
  var n = Math.max(0, Math.round(Number(columns) || 0))
  return n === 1 ? "1 week" : n + " weeks"
}
