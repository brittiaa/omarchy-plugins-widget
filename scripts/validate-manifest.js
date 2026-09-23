#!/usr/bin/env node

// What `omarchy plugin validate` checks, checked without Omarchy.
//
// The real validator ships with Omarchy and is the authority: it is what
// decides whether this plugin installs on somebody's machine at all, and
// `omarchy plugin update` rolls back an update that fails it. A CI runner has
// no Omarchy on it, so the same rules are restated here against the same
// manifest, and the pull request finds out rather than the user.
//
// Mirrored from /usr/share/omarchy/bin/omarchy-plugin-validate. Where the two
// disagree the shell script wins; the checklist in CONTRIBUTING.md still asks
// for a real `omarchy plugin validate .` before opening a pull request, because
// this file can only be as current as the day it was written.
//
// Usage: node scripts/validate-manifest.js [plugin-dir]   (default: repo root)

const fs = require("node:fs")
const path = require("node:path")

const KIND_ENTRY_POINTS = {
  "bar": "bar",
  "bar-widget": "barWidget",
  "menu": "menu",
  "overlay": "overlay",
  "panel": "panel",
  "service": "service"
}

const SECTIONS = ["left", "center", "right"]

const problems = []
function fail(message) { problems.push(message) }

const dir = path.resolve(process.argv[2] || path.join(__dirname, ".."))
const manifestPath = path.join(dir, "manifest.json")

if (!fs.existsSync(manifestPath)) {
  console.error(`no manifest.json in ${dir}`)
  process.exit(1)
}

let manifest
try {
  manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"))
} catch (e) {
  console.error(`manifest.json is not valid JSON: ${e.message}`)
  process.exit(1)
}

// schemaVersion must be exactly the JSON number 1, which is the only version
// the registry knows. A string "1" is not it.
if (manifest.schemaVersion !== 1) {
  fail(`unsupported or missing schemaVersion (expected the number 1, got ${JSON.stringify(manifest.schemaVersion)})`)
}

for (const field of ["id", "name", "version", "kinds", "entryPoints"]) {
  if (!Object.prototype.hasOwnProperty.call(manifest, field)) {
    fail(`manifest missing required field '${field}'`)
  }
}

const id = typeof manifest.id === "string" ? manifest.id : ""
if (!id) fail("manifest 'id' is empty")
else {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id)) fail(`invalid plugin id '${id}'`)
  if (id.includes("..")) fail(`invalid plugin id '${id}'`)
  if (id.startsWith("omarchy.")) fail(`plugin id '${id}' uses the reserved omarchy.* namespace`)
}

if (!Array.isArray(manifest.kinds) || manifest.kinds.length === 0) {
  fail("'kinds' must be a non-empty array")
}

const entryPoints = manifest.entryPoints
if (entryPoints === null || typeof entryPoints !== "object" || Array.isArray(entryPoints)) {
  fail("'entryPoints' must be an object")
} else {
  for (const [key, value] of Object.entries(entryPoints)) {
    if (typeof value !== "string" || !value) { fail(`entry point '${key}' path is empty`); continue }
    if (value.includes("\n")) fail(`entry point '${key}' may not contain a newline`)
    if (value.startsWith("/")) fail(`entry point must be a relative path: '${value}'`)
    if (value.includes("..")) fail(`entry point may not contain '..': '${value}'`)
    else if (!fs.existsSync(path.join(dir, value))) fail(`entry point file not found: '${value}'`)
  }
}

// A kind is a promise to supply something to load. Claiming one without its
// entry point installs and enables and then does nothing, which is the failure
// nobody reports because nothing says it happened.
if (Array.isArray(manifest.kinds) && entryPoints && typeof entryPoints === "object") {
  for (const [kind, entryPoint] of Object.entries(KIND_ENTRY_POINTS)) {
    if (manifest.kinds.indexOf(kind) === -1) continue
    if (!Object.prototype.hasOwnProperty.call(entryPoints, entryPoint)) {
      fail(`kind '${kind}' requires an 'entryPoints.${entryPoint}' to load`)
    }
  }
}

const barWidget = manifest.barWidget
if (barWidget && typeof barWidget === "object" && !Array.isArray(barWidget)) {
  if (Object.prototype.hasOwnProperty.call(barWidget, "defaultSection")
      && SECTIONS.indexOf(barWidget.defaultSection) === -1) {
    fail("'barWidget.defaultSection' must be left, center, or right")
  }
}

// A symlink could point a file inside the plugin folder at anything on the
// machine, so the whole tree is refused if one is found. `.git` is skipped:
// it is not shipped and git keeps its own files there.
function findSymlink(start) {
  const stack = [start]
  while (stack.length) {
    const current = stack.pop()
    let entries
    try { entries = fs.readdirSync(current, { withFileTypes: true }) } catch (e) { continue }
    for (const entry of entries) {
      if (entry.name === ".git" || entry.name === "node_modules") continue
      const full = path.join(current, entry.name)
      if (entry.isSymbolicLink()) return path.relative(start, full)
      if (entry.isDirectory()) stack.push(full)
    }
  }
  return null
}

const link = findSymlink(dir)
if (link) fail(`symlinks are not allowed inside a plugin folder: ${link}`)

// Not one of the shell validator's rules, but a release rule of this repo: the
// manifest's version is what `omarchy plugin update` compares and what a bug
// report quotes, so a tag that does not match it makes both of those lie.
if (typeof manifest.version === "string" && !/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(manifest.version)) {
  fail(`'version' should be semver, got '${manifest.version}'`)
}

if (problems.length) {
  console.error(`manifest.json in ${dir} is not valid:\n`)
  for (const problem of problems) console.error(`  - ${problem}`)
  console.error("")
  process.exit(1)
}

console.log(`manifest.json ok: ${id} ${manifest.version} (${(manifest.kinds || []).join(", ")})`)
