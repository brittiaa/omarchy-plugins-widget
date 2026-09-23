# CLAUDE.md

Desktop widgets for Omarchy, and a host for the Omarchy plugins you have
installed. One layer-shell surface per monitor on the `Bottom` layer, above the
wallpaper and beneath every window, holding cards laid out on a grid.

[DESIGN.md](DESIGN.md) and [CONTRIBUTING.md](CONTRIBUTING.md) are the long form
and remain the authority. This file is the short list of things that are not
visible in the code you are about to change.

## Commands

```sh
npm test          # node --test tests/*.test.js
npm run lint      # manifest validation + qmllint over every tracked .qml
npm run check     # both, which is what CI runs

omarchy plugin validate .    # the real thing; npm run lint:manifest only mirrors it
dev/preview                  # run it without touching your installed copy
omarchy-restart-shell        # what makes an edit visible in the real shell
```

**A change you cannot see is probably not a change you have not made.** The
manifest sets `keepLoaded`, so a panel the shell has mounted outlives the file
it came from: an edit lands on disk and the screen does not move.
`omarchy-restart-shell` is what shows you your own work, and forgetting it is
the single most common way to spend an hour debugging something that was already
fixed. (`omarchy-shell` is a different thing entirely — it is the IPC caller,
`omarchy-shell widgets list` and friends.)

## Where things live

```
manifest.json          entry points: Surface.qml, BarWidget.qml, Service.qml
Surface.qml            the desktop surface, one per monitor
Service.qml            config, plugin scan, IPC
BarWidget.qml          the bar entry
Model.js               the one import QML uses; re-exports model/
model/                 the logic, one file per concern, no Qt
ui/                    the editor, inspector and card chrome
widgets/               one QML file per built-in widget
tests/  scripts/  dev/
```

`model/` goes from the bottom up: `Util` (limits, helpers) → `Catalogue` →
`Layout` → `Packing` → `Config` → `Mutations`, with one file per widget's own
logic beside them (`Clock`, `Calendar`, `Ics`, `Crypto`, ...). A file imports
only from files earlier in that list, and a cycle is a load error, so a
function goes in the lowest file that can hold it.

## The model is JavaScript, and shared

Anything with a right answer goes in `model/` with a test. It is plain
JavaScript with **no Qt and no Quickshell imports**, which is what lets
[tests/model.test.js](tests/model.test.js) load it under node.

QML never imports `model/` directly. [Model.js](Model.js) re-exports every
public name (`var clampNumber = Util.clampNumber`), so a QML file has one
import and one name, `Model.clampNumber`. **A new function needs its line in
Model.js**, or QML sees `undefined` and the tests, which read the same door,
fail. A name starting with `_` is private to its file and is not re-exported.

Every file opens with `.pragma library`. That means one instance per QML
engine rather than a private copy per importing file, which is what lets the
service discover plugins at runtime and have the inspector, the cards and the
bar list all see the same catalogue. Two consequences worth holding on to:

- Module-level state is **global to the shell**. `setCatalogExtension` is the
  only writer; treat everything else there as read-only.
- `.pragma` and `.import` are not JavaScript, so `require()` cannot parse the
  files. The tests carry a small loader that does what the QML engine does,
  and evaluates each file with `new Function` — in the current realm, not a
  `vm` context, or every `assert.deepEqual` on an array would fail on a
  prototype mismatch instead of on its contents. See `loadModule()` at the top
  of the test file.
- Between files, a reference is qualified: `Util.clampNumber(...)`. There is
  no bundler, and a bare name from another file is a `ReferenceError` at call
  time, not at load.
- Changing the catalogue invalidates no QML binding on its own. That is what
  `service.catalogRevision` is for: a binding that reads the catalogue has to
  read the revision too, or it will never re-evaluate.

## The surface takes no input

The desktop surface has an **empty input mask**: clicks pass through to whatever
is underneath. A type that declares `interactive: true` gets its own rectangle
back, and nothing else.

Every discovered plugin is interactive, because its QML was written for the bar
where everything is clickable and no manifest says whether it would still make
sense without input. That is a deliberate exception, not the rule, and it is why
the input regions are rebuilt when the grid animates off screen — a card that
has left still owns the clicks where it used to be, otherwise.

## Writing a widget's QML

- Colours from `Color.*`, sizes from `Style.*`. Never a literal.
- No background, no border: [WidgetCard.qml](ui/WidgetCard.qml) draws those.
- No `MouseArea` unless the type is interactive.
- Glyphs as `\uXXXX` escapes, never literal private-use characters — a test
  enforces this, because a pasted glyph survives only as long as every tool that
  touches the file preserves it, and it fails as an empty string with no error.
- A property implicitly declares `<name>Changed`; declaring that signal by hand
  as well makes the whole plugin silently not load. Also tested.

## Things that break somebody's existing config

- `type` strings and `settings` keys are permanent promises. Renaming one
  orphans every config that mentions it.
- A new `layout` field gets a default in `normalizeLayout` and does **not** bump
  `SCHEMA_VERSION`: every field there already treats absent as "the default",
  which is what makes an older config keep meaning what it meant.
- `defaultConfig()` has no widgets in it. Nothing is chosen for anybody; the bar
  list comes from `ensureCatalogCoverage`, which offers every type switched off.

## Hosting installed plugins

The catalogue is mostly not in this repo. [Service.qml](Service.qml) scans
`~/.config/omarchy/plugins`, and `Model.buildPluginCatalogEntry` turns each
manifest into an entry in the same shape as a built-in one, so everything
downstream treats the two alike.

- Only `entryPoints.barWidget` is ever mounted, and `kinds` is not consulted.
  A bar widget extends `qs.Ui.BarWidget`, a plain `Item`, which is the one thing
  a card can hold; a panel extends `qs.Ui.Panel` and is a floating surface that
  does not embed. The entry point's **filename says nothing** about its kind —
  `robzolkos.github` points `entryPoints.barWidget` at `Panel.qml`.
- The `bar` object a plugin expects is a real `qs.Ui.PluginBarApi`, filled in by
  [WidgetInstance.qml](ui/WidgetInstance.qml). Use the shell's own type rather than
  a hand-written stand-in, so the facade cannot drift from the contract. The
  authority is `/usr/share/omarchy/shell/Ui/PluginBarApi.qml`; do not guess at
  it.
- Hyprland state arrives over a socket and is empty for the first moments of a
  shell's life. Every read of it needs a fallback, and the fallback is always
  the one the user can see and wait out.

<!-- graft:start -->
<!-- graft:end -->
