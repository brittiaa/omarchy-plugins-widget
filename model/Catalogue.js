.pragma library

.import "Util.js" as Util

// The widget catalogue: the built-in types, the plugin entries discovered at
// runtime, and the lookups over both (sizes, settings schema, icons).
//
// Module-level state: `_catalogExtension` is written only by
// setCatalogExtension.

// Third-party Omarchy plugins discovered at runtime are inserted here.
// Service.qml calls setCatalogExtension() once it has scanned the plugin dirs;
// catalog() prepends them so they are found before the built-in types, which
// means a plugin that uses the same type string as a built-in (very unlikely,
// but possible) wins the lookup — the plugin's own entry is what the user
// installed.
//
// The extension is a plain module-level variable, not a class, because the
// model must not require any Qt or Quickshell imports. QML binds to a .js import as
// a value, not as an object with properties, so a module-level mutation is the
// only way to pass state in.
var _catalogExtension = []

// Replace the full extension list. Called by Service.qml after scanning.
function setCatalogExtension(list) {
  _catalogExtension = Array.isArray(list) ? list : []
}

// Is this type backed by a discovered plugin rather than a built-in widget?
function isPluginType(type) {
  var key = String(type || "")
  for (var i = 0; i < _catalogExtension.length; i++)
    if (_catalogExtension[i].type === key) return true
  return false
}

//
// Adding a widget type is: drop a QML file in widgets/, add an entry here.
// Everything else — the bar popup, the editor, the config file, the layout on
// screen — is driven off this list, so nothing else has to learn the new name.
//
// `icon` is one glyph, from the theme's own Nerd Font, and it is what makes a
// list of these scannable once there are more than a handful: the bar popup
// and the editor's tray both lead with it, and a row you find by its shape is
// found faster than one you have to read. One glyph, no colour of its own.
//
// `sizes` is every footprint the type is allowed to take, as [cols, rows] in
// cells, first one being its default. The editor offers exactly these, which
// is how a type says "I read well wide" without anything else having to know
// why. A size wider than the grid the user has is dropped rather than
// offered, so a type may list one without every grid having to be that wide.
//
// `settings` is the type's whole tunable surface, and it is a schema rather
// than a bag of defaults: each entry carries the key, how to edit it, and
// what it starts as. The editor builds its controls straight off this list,
// so a new widget gets a working settings panel by describing itself — and a
// key that is not in the list is a key the config cannot set.
//
// `multiple: true` says the type is worth having more than one of, and is
// what puts a "Duplicate" button on it in the editor and a "+" beside it in
// the bar popup. It is opt-in rather than the default because for some types
// a second copy is the same card twice: the weather reads one location and
// the music card follows one player, so duplicating either would produce a
// widget that can never say anything different from the one beside it.
//
// Supported setting types: "text", "boolean", "choice" (needs `options`),
// "timezone" (an IANA zone name, offered as a searchable list), and "path"
// (a file or a directory, chosen through the desktop's own file chooser --
// `pathKinds` lists which of "file", "image" and "folder" it may be, and
// `extensions` is the space-separated list the chooser filters on).

function catalog() {
  // Extensions first: a plugin-provided entry wins over a built-in with the
  // same type string. In practice type strings are namespaced plugin IDs like
  // "quickshell.spotify", so collisions with built-in names are impossible.
  return _catalogExtension.concat([
    {
      type: "clock",
      icon: "\uf017",
      name: "Clock",
      description: "The time, in any timezone, and how far that is from your own.",
      source: "widgets/Clock.qml",
      // Several is the point: the widget exists to show a zone that is not
      // yours, and one of those is rarely the only one you care about.
      multiple: true,
      sizes: [[1, 1], [2, 1]],
      settings: [
        {
          key: "timezone",
          type: "timezone",
          label: "Timezone",
          help: "Leave empty for your own clock",
          defaultValue: ""
        },
        {
          key: "label",
          type: "text",
          label: "Label",
          help: "Empty follows the timezone",
          defaultValue: ""
        },
        {
          key: "format",
          type: "choice",
          label: "Format",
          defaultValue: "HH:mm",
          options: [
            { value: "HH:mm", label: "13:15" },
            { value: "hh:mm AP", label: "1:15 PM" },
            { value: "HH:mm:ss", label: "13:15:42" },
            { value: "HH mm", label: "13 15" }
          ]
        },
        {
          key: "ticks",
          type: "boolean",
          label: "Tick ring",
          defaultValue: true
        }
      ]
    },
    {
      type: "weather",
      icon: "\uf0c2",
      name: "Weather",
      description: "Now, and today's range, for wherever Omarchy points.",
      source: "widgets/Weather.qml",
      sizes: [[1, 1], [2, 1]],
      // The one widget here that talks to the network. It uses wttr.in,
      // which is what the rest of Omarchy already uses for weather, and it
      // takes its location from the same file `omarchy-weather-location`
      // writes -- so there is one place to set it, and no second service
      // learning where you live.
      network: "wttr.in",
      settings: [
        {
          key: "units",
          type: "choice",
          label: "Units",
          defaultValue: "celsius",
          options: [
            { value: "celsius", label: "°C" },
            { value: "fahrenheit", label: "°F" }
          ]
        },
        {
          key: "label",
          type: "text",
          label: "Label",
          help: "Empty follows the location",
          defaultValue: ""
        },
        {
          key: "showRange",
          type: "boolean",
          label: "High and low",
          defaultValue: true
        }
      ]
    },
    {
      type: "github",
      icon: "\uf09b",
      name: "GitHub",
      description: "A year of contributions, as many weeks as the card can hold.",
      source: "widgets/Github.qml",
      // Wide first: seven rows of squares want length, and a square card can
      // only hold a couple of months of them.
      // One per person whose year you want on the wall.
      multiple: true,
      sizes: [[2, 1], [1, 1]],
      network: "github.com",
      settings: [
        {
          key: "login",
          type: "text",
          label: "Username",
          help: "GitHub username",
          defaultValue: ""
        },
        {
          key: "showLegend",
          type: "boolean",
          label: "Legend",
          defaultValue: true
        }
      ]
    },
    {
      type: "repo-pulse",
      icon: "\uf005",
      name: "Repo pulse",
      description: "Stars, forks, issues and open pull requests for a repository.",
      source: "widgets/RepoPulse.qml",
      sizes: [[1, 1], [2, 1]],
      // One per repository. Nobody watches exactly one.
      multiple: true,
      network: "api.github.com",
      // The name opens the repository. Same exception the music card takes,
      // and the same justification: the action is about the thing on the
      // card, and there is exactly one of it.
      interactive: true,
      settings: [
        {
          key: "repo",
          type: "text",
          label: "Repository",
          help: "owner/name",
          defaultValue: ""
        },
        {
          key: "showStats",
          type: "boolean",
          label: "Stars and issues",
          defaultValue: true
        }
      ]
    },
    {
      type: "crypto",
      icon: "\uf0d6",
      name: "Crypto",
      description: "What a wallet holds and what it is worth, or just the coin's price.",
      source: "widgets/Crypto.qml",
      sizes: [[1, 1], [2, 1]],
      // One per holding. A person with one coin is not who this is for.
      multiple: true,
      // Two things are fetched and they go to different places: the price to
      // CoinGecko, which answers for every coin at once, and the balance to
      // the chain itself. An address is only ever sent to its own chain's
      // node, and never to the price host.
      network: ["api.coingecko.com", "mempool.space", "litecoinspace.org",
        "ethereum-rpc.publicnode.com", "api.mainnet-beta.solana.com"],
      settings: [
        {
          key: "chain",
          type: "choice",
          label: "Chain",
          defaultValue: "bitcoin",
          options: [
            { value: "bitcoin", label: "Bitcoin" },
            { value: "ethereum", label: "Ethereum" },
            { value: "solana", label: "Solana" },
            { value: "litecoin", label: "Litecoin" }
          ]
        },
        {
          key: "address",
          type: "text",
          label: "Address",
          help: "Empty shows the price alone",
          defaultValue: ""
        },
        {
          key: "label",
          type: "text",
          label: "Label",
          help: "Empty follows the coin",
          defaultValue: ""
        },
        {
          key: "currency",
          type: "choice",
          label: "Currency",
          defaultValue: "usd",
          options: [
            { value: "usd", label: "USD" },
            { value: "eur", label: "EUR" },
            { value: "gbp", label: "GBP" },
            { value: "inr", label: "INR" },
            { value: "jpy", label: "JPY" },
            { value: "aud", label: "AUD" },
            { value: "cad", label: "CAD" }
          ]
        },
        {
          // The one dial that matters on a wallpaper somebody else can see.
          // Off leaves the holding and hides what it is worth.
          key: "showFiat",
          type: "boolean",
          label: "Value in money",
          defaultValue: true
        }
      ]
    },
    {
      type: "calendar",
      icon: "\uf073",
      name: "Calendar",
      description: "What is next, from your Google Calendar's secret iCal address.",
      source: "widgets/Calendar.qml",
      // Wide first: an event is a time and a sentence, and a square card can
      // hold one of them at a time. Each size is a layer on the last -- the
      // wide one adds the day as a bar, the tall one adds the rest of today
      // and what tomorrow opens with.
      sizes: [[2, 1], [1, 1], [2, 2]],
      // Google publishes every calendar as an iCalendar file at a private
      // address, which is the one way to read a calendar without a wallpaper
      // decoration holding an OAuth token. One GET to Google's own host, no
      // third party, nothing sent but the address itself.
      // One per calendar: work and personal are two addresses, not one.
      multiple: true,
      network: "calendar.google.com",
      settings: [
        {
          key: "icsUrl",
          type: "text",
          label: "Secret iCal address",
          help: "calendar.google.com/calendar/ical/\u2026/basic.ics",
          defaultValue: ""
        },
        {
          key: "label",
          type: "text",
          label: "Label",
          help: "Empty says today's date",
          defaultValue: ""
        },
        {
          key: "format",
          type: "choice",
          label: "Clock",
          defaultValue: "24h",
          options: [
            { value: "24h", label: "14:30" },
            { value: "12h", label: "2:30 PM" }
          ]
        },
        {
          key: "showAllDay",
          type: "boolean",
          label: "All-day events",
          defaultValue: true
        },
        {
          key: "showLocation",
          type: "boolean",
          label: "Location",
          defaultValue: false
        }
      ]
    },
    {
      type: "todos",
      icon: "\uf046",
      name: "Todos",
      description: "Today's list, from a text file. Tick things off; the title opens it.",
      source: "widgets/Todos.qml",
      sizes: [[2, 1], [1, 1], [2, 2]],
      // The third type that takes clicks, and the one that stretches the rule
      // furthest: a tick per row, plus a title that opens the file, plus a
      // list that scrolls. The justification is that all of it is about the
      // thing already on the card, and a list is the one subject on a
      // wallpaper that genuinely has more content than a card can hold. See
      // One per list. A file each is how people keep lists apart.
      multiple: true,
      // DESIGN.md, which records this as an exception rather than a licence.
      interactive: true,
      settings: [
        {
          // A path rather than free text, so it comes with the chooser. The
          // value is the same string it always was and an old config still
          // reads: only the control changed.
          key: "file",
          type: "path",
          pathKinds: ["file"],
          label: "List file",
          help: "~/.config/omarchy/todos.txt",
          defaultValue: ""
        },
        {
          key: "title",
          type: "text",
          label: "Title",
          help: "Empty uses the file's first heading",
          defaultValue: ""
        },
        {
          key: "showDone",
          type: "boolean",
          label: "Finished items",
          defaultValue: true
        },
        {
          key: "showProgress",
          type: "boolean",
          label: "Progress",
          defaultValue: true
        },
        {
          key: "canTick",
          type: "boolean",
          label: "Tick items off",
          defaultValue: true
        }
      ]
    },
    {
      type: "music",
      icon: "\uf001",
      name: "Music",
      description: "What is playing, how far in, and the transport for it.",
      source: "widgets/Music.qml",
      sizes: [[2, 1], [1, 1]],
      // The one widget in the set that takes a click. Everything else is
      // read, and the desktop surface has no input region at all; this opts
      // its own rectangle back in so play/pause can be pressed. See
      // DESIGN.md -- it is an exception with a reason, not the new default.
      interactive: true,
      settings: [
        {
          key: "showArt",
          type: "boolean",
          label: "Album art",
          defaultValue: true
        },
        {
          key: "showProgress",
          type: "boolean",
          label: "Progress",
          defaultValue: true
        },
        {
          key: "showSkip",
          type: "boolean",
          label: "Skip tracks",
          defaultValue: true
        },
        {
          // Empty follows whatever is playing, which is what most desktops
          // want. Naming one is for the desktop that always has two: a
          // browser tab open beside the player it actually means.
          key: "player",
          type: "text",
          label: "Player",
          help: "Spotify, Firefox, mpv - blank follows whatever is playing",
          defaultValue: ""
        }
      ]
    },
    {
      type: "omate",
      icon: "\uf1b0",
      name: "Omate",
      description: "The desktop pet: show and hide it, pick its skin, size it, set how fast it chases the cursor.",
      source: "widgets/Omate.qml",
      sizes: [[2, 2]],
      // Every control on the card writes through to the omate plugin's own
      // settings, which are global -- two cards would fight each other's
      // slider mid-drag. One card, speaking for the one pet.
      multiple: false,
      // The widest interactivity in the set: a power switch, a selectable
      // skin row, and two sliders, all about the pet the card exists to
      // show. See DESIGN.md, which records this as an exception.
      interactive: true,
      settings: [
        {
          // The owner's name, not the pet's -- the pet already has one in
          // its pack. Pushed through to omate's own userName, so the pet's
          // speech uses whatever is written here no matter which side it
          // was edited from.
          key: "label",
          type: "text",
          label: "Owner name",
          help: "What the pet calls you",
          defaultValue: ""
        }
      ]
    },
    {
      type: "photo",
      name: "Photos",
      description: "A picture of your own, or a folder of them, one at a time.",
      icon: "\uf03e",
      source: "widgets/Photo.qml",
      // The one type in the set where a bigger card is a different picture
      // rather than the same one stretched: a photograph is a crop, and every
      // footprint crops it differently. So it offers more sizes than anything
      // else here, and the editor answers that with a list rather than a
      // button you press until the right one comes round.
      sizes: [[2, 2], [1, 1], [2, 1], [1, 2], [3, 2], [2, 3], [3, 3]],
      // One per picture. Two photographs on a wall is the obvious thing to
      // want, and each is a different file.
      multiple: true,
      settings: [
        {
          // One path, meaning two things, decided by what it points at: a
          // file is that photograph, a directory is everything in it, shown
          // one at a time. That is the same choice the chooser already asks
          // ("pick a file" or "pick a folder"), so making it a second setting
          // would be asking twice.
          key: "path",
          type: "path",
          label: "Picture",
          help: "An image, or a folder of them",
          pathKinds: ["image", "folder"],
          extensions: "jpg jpeg png webp gif bmp",
          defaultValue: ""
        },
        {
          // Seconds, as a choice rather than a number, because the useful
          // ones are decades apart and nobody wants to type 1800. Only read
          // when the path is a folder; a single picture has nothing to
          // change to.
          key: "interval",
          type: "choice",
          label: "Change every",
          defaultValue: "300",
          options: [
            { value: "0", label: "Never" },
            { value: "30", label: "30 seconds" },
            { value: "300", label: "5 minutes" },
            { value: "1800", label: "30 minutes" },
            { value: "3600", label: "An hour" }
          ]
        },
        {
          key: "shuffle",
          type: "boolean",
          label: "Shuffle",
          defaultValue: false
        },
        {
          key: "fit",
          type: "choice",
          label: "Fit",
          defaultValue: "fill",
          options: [
            { value: "fill", label: "Fill the card" },
            { value: "contain", label: "Whole picture" }
          ]
        },
        {
          // Doubles as the name the popup and the tray use to tell two of
          // these apart, which is the `label` convention every type shares.
          key: "label",
          type: "text",
          label: "Caption",
          help: "Empty shows none",
          defaultValue: ""
        }
      ]
    }
  ])
}

// Bridge one entry of a plugin manifest's `barWidget.schema` to the settings
// shape the inspector draws. A manifest describes its settings in the vocabulary
// the bar uses -- "enum", "integer", "string" -- and the inspector's fields are
// named for what they are on a card: "choice", "number", "text". Anything this
// does not recognise becomes a text field, which is the one control that can
// hold any value a manifest might have meant.
//
// `fallback` is the value from `barWidget.defaults`, which is where a manifest
// puts the default when the schema entry does not carry one of its own.
function bridgePluginSetting(spec, fallback) {
  if (!Util.isPlainObject(spec) || !spec.key) return null

  var bridged = { key: String(spec.key), label: String(spec.label || spec.key) }

  bridged.defaultValue = spec.defaultValue !== undefined ? spec.defaultValue
    : (fallback !== undefined ? fallback : "")

  var t = String(spec.type || "text")
  if (t === "enum" || t === "choice") {
    bridged.type = "choice"
    var opts = Array.isArray(spec.options) ? spec.options : []
    bridged.options = []
    for (var i = 0; i < opts.length; i++) {
      var o = opts[i]
      bridged.options.push(Util.isPlainObject(o) ? o : { value: String(o), label: String(o) })
    }
    // A choice with no options is a text field wearing a picker's clothes: the
    // picker would open onto nothing and the value could never be set.
    if (bridged.options.length === 0) bridged.type = "text"
  } else if (t === "integer" || t === "number") {
    bridged.type = "number"
    if (typeof spec.min === "number") bridged.min = spec.min
    if (typeof spec.max === "number") bridged.max = spec.max
    if (typeof spec.step === "number") bridged.step = spec.step
    if (typeof bridged.defaultValue !== "number")
      bridged.defaultValue = Number(bridged.defaultValue) || 0
  } else if (t === "boolean") {
    bridged.type = "boolean"
    bridged.defaultValue = bridged.defaultValue === true
  } else {
    bridged.type = "text"
    bridged.defaultValue = bridged.defaultValue === undefined ? "" : String(bridged.defaultValue)
  }

  if (spec.description) bridged.help = String(spec.description).slice(0, Util.MAX_STRING)
  return bridged
}

// The settings for a plugin that declares `barWidget.defaults` but no schema at
// all -- which is a real shape: a plugin with nothing worth configuring in the
// bar still ships defaults its QML reads through `bar.setting(name, fallback)`.
// Without this they would arrive with no settings at all and every `setting()`
// call would fall through to its own fallback, which is not the same value.
//
// The type is taken from the default itself, which is the only description of
// the setting there is.
function pluginSettingsFromDefaults(defaults) {
  var out = []
  if (!Util.isPlainObject(defaults)) return out
  for (var key in defaults) {
    if (!Object.prototype.hasOwnProperty.call(defaults, key)) continue
    var value = defaults[key]
    var type = typeof value === "boolean" ? "boolean"
      : (typeof value === "number" ? "number" : "string")
    var bridged = bridgePluginSetting({ key: key, label: key, type: type }, value)
    if (bridged) out.push(bridged)
  }
  return out
}

// Convert an Omarchy plugin manifest (the parsed JSON from manifest.json) into a
// catalogue entry in the same shape as a built-in one, so that every consumer --
// the chooser, the editor, the inspector, normalization -- treats a discovered
// plugin exactly the way it treats a widget shipped in this repo.
//
// entryKind is which entry point was chosen; today always "barWidget", because
// that is the only kind whose QML is an embeddable Item. See Service.qml.
// sourceUrl is the absolute file:// URL to the QML file to load.
function buildPluginCatalogEntry(manifest, entryKind, sourceUrl) {
  if (!Util.isPlainObject(manifest) || !manifest.id) return null

  var bw = Util.isPlainObject(manifest.barWidget) ? manifest.barWidget : {}
  var defaults = Util.isPlainObject(bw.defaults) ? bw.defaults : {}
  var schema = Array.isArray(bw.schema) ? bw.schema : []

  var settings = []
  for (var i = 0; i < schema.length; i++) {
    var key = Util.isPlainObject(schema[i]) ? String(schema[i].key) : ""
    var bridged = bridgePluginSetting(schema[i], defaults[key])
    if (bridged) settings.push(bridged)
  }
  // A manifest with defaults and no schema describes its settings only by their
  // values. One with both has already been covered by the loop above.
  if (settings.length === 0) settings = pluginSettingsFromDefaults(defaults)

  return {
    type: String(manifest.id),
    icon: String(bw.icon || ""),   // default: cube glyph
    name: String(bw.displayName || manifest.name || manifest.id),
    description: String(bw.description || manifest.description || ""),
    // A plugin widget is drawn from QML written for the bar, where everything
    // is clickable. Nothing in a manifest says whether it would still make
    // sense with its input taken away, so the card keeps its own rectangle as
    // an input region. Every other widget on the desktop stays click-through:
    // see the mask in Surface.qml.
    interactive: true,
    multiple: bw.allowMultiple === true,
    // A plugin manifest describes a place in the bar, not a footprint on a
    // wallpaper, so there is nothing to read here. These are offered instead
    // and the editor can resize between them. The first is what a plugin is
    // added as; the larger ones are for a panel with a lot in it, which is
    // scaled to fit its card rather than cut off.
    sizes: [[2, 2], [3, 3], [3, 2], [2, 3], [2, 1], [1, 1]],
    settings: settings,
    // Plugin-specific metadata, not part of the built-in catalogue shape.
    // Consumers check _isPlugin to distinguish these from built-in entries.
    _isPlugin: true,
    _pluginId: String(manifest.id),
    _pluginAuthor: String(manifest.author || ""),
    _pluginVersion: String(manifest.version || ""),
    _entryKind: String(entryKind || "barWidget"),
    // Absolute file:// URL resolved by Service.qml before calling this.
    sourceUrl: String(sourceUrl || "")
  }
}

// The settings schema for a type, always an array.
function settingsSchema(type) {
  var entry = catalogEntry(type)
  return entry && Array.isArray(entry.settings) ? entry.settings : []
}

function settingSpec(type, key) {
  var schema = settingsSchema(type)
  for (var i = 0; i < schema.length; i++) if (schema[i].key === String(key)) return schema[i]
  return null
}

// The starting value of every setting a type has, derived from the schema so
// there is one place a default can live.
function defaultsFor(type) {
  var schema = settingsSchema(type)
  var out = {}
  for (var i = 0; i < schema.length; i++) out[schema[i].key] = schema[i].defaultValue
  return out
}

// The name a zone wears when the user has not written one: the last part of
// the path, which is the city. "America/New_York" -> "New York".
function zoneLabel(zone) {
  var z = String(zone || "")
  if (!z) return ""
  var parts = z.split("/")
  return parts[parts.length - 1].replace(/_/g, " ")
}

function catalogEntry(type) {
  var list = catalog()
  var key = String(type || "")
  for (var i = 0; i < list.length; i++) if (list[i].type === key) return list[i]
  return null
}

function catalogTypes() {
  var list = catalog()
  var out = []
  for (var i = 0; i < list.length; i++) out.push(list[i].type)
  return out
}

// Footprints a type allows, always at least one and always sane.
function sizesFor(type) {
  var entry = catalogEntry(type)
  if (!entry || !Array.isArray(entry.sizes) || entry.sizes.length === 0) return [[1, 1]]
  var out = []
  for (var i = 0; i < entry.sizes.length; i++) {
    var s = entry.sizes[i]
    if (!Array.isArray(s) || s.length < 2) continue
    var cols = Math.round(Util.clampNumber(s[0], 1, Util.MAX_COLUMNS, 1))
    var rows = Math.round(Util.clampNumber(s[1], 1, Util.MAX_ROWS, 1))
    out.push([cols, rows])
  }
  return out.length ? out : [[1, 1]]
}

function defaultSize(type) {
  return sizesFor(type)[0]
}

function isAllowedSize(type, cols, rows) {
  // An unknown type does not offer sizes; `sizesFor` only falls back to 1x1 so
  // that drawing code always has something to work with.
  if (!catalogEntry(type)) return false
  var sizes = sizesFor(type)
  for (var i = 0; i < sizes.length; i++) {
    if (sizes[i][0] === cols && sizes[i][1] === rows) return true
  }
  return false
}

// The glyph a type wears in a list. Always a string -- empty when a type has
// not chosen one -- so a caller can draw it without first asking whether it
// is there.
function iconFor(type) {
  var entry = catalogEntry(type)
  return entry && typeof entry.icon === "string" ? entry.icon : ""
}

// A footprint written the way the editor says it: "2 × 1".
function sizeLabel(cols, rows) {
  return String(Math.round(Number(cols) || 1)) + " \u00d7 " + String(Math.round(Number(rows) || 1))
}

// The footprints a type offers that a grid this wide can actually hold.
//
// The catalogue is free to list a size wider than anybody's grid -- the photo
// card lists three of them -- because the alternative is a type whose widest
// composition nobody with a six-column grid can ever reach. This is the one
// place that is narrowed down, so the editor offers only sizes that will fit
// and nothing downstream has to ask again.
//
// A type none of whose sizes fit still answers with its narrowest, because
// every answer here has to be a size the type declared: a footprint invented
// by clamping is one `isAllowedSize` would refuse a moment later.
function sizesWithin(type, maxCols) {
  var limit = Math.round(Util.clampNumber(maxCols, 1, Util.MAX_COLUMNS, Util.MAX_COLUMNS))
  var sizes = sizesFor(type)
  var out = []
  var narrowest = sizes[0]
  for (var i = 0; i < sizes.length; i++) {
    if (sizes[i][0] <= limit) out.push(sizes[i])
    if (sizes[i][0] < narrowest[0]) narrowest = sizes[i]
  }
  return out.length ? out : [narrowest]
}

// The largest footprint a type offers that fits a grid this wide. Used when a
// grid narrows under a widget, and when a config asks for a size the grid
// cannot hold -- both cases want the widget to end up at a size the type
// actually declared rather than at a clamped one.
function fitSize(type, maxCols) {
  var fits = sizesWithin(type, maxCols)
  var best = fits[0]
  for (var i = 1; i < fits.length; i++) {
    if (fits[i][0] > best[0] || (fits[i][0] === best[0] && fits[i][1] > best[1])) best = fits[i]
  }
  return best
}

// The next footprint in the type's list, wrapping. This is what the editor's
// size control steps through.
function nextSize(type, cols, rows) {
  var sizes = sizesFor(type)
  for (var i = 0; i < sizes.length; i++) {
    if (sizes[i][0] === cols && sizes[i][1] === rows) return sizes[(i + 1) % sizes.length]
  }
  return sizes[0]
}
