<p align="center">
  <img src="assets/logo.svg" alt="Widgets" width="132">
</p>

<h1 align="center">Widgets</h1>

<p align="center">
  <strong>Desktop widgets for Omarchy, and a host for the plugins you already have.</strong><br>
  A grid on your wallpaper, in your theme's colours, that gets out of the way of your windows.
</p>

<p align="center">
  <sub>A fork of <a href="https://github.com/anishfn/omarchy-widgets">anishfn/omarchy-widgets</a>, by Anish Gupta and contributors.</sub>
</p>

<p align="center">
  <a href="#install"><img alt="Install" src="https://img.shields.io/badge/install-omarchy%20plugin%20add-7fbbb3?style=for-the-badge"></a>
  <a href="https://github.com/brittiaa/omarchy-plugins-widget/releases"><img alt="Releases" src="https://img.shields.io/github/v/release/brittiaa/omarchy-plugins-widget?style=for-the-badge&color=e8845f&label=release"></a>
  <a href="LICENSE"><img alt="MIT" src="https://img.shields.io/badge/license-MIT-8a9a9a?style=for-the-badge"></a>
</p>

<p align="center">
  <img src="assets/desktop.jpg" alt="Widgets on the desktop: a clock, the weather, a todo list and the music card down the left, contributions and two repositories on the right, and the Omate card" width="880">
</p>

---

## What this fork adds

**Your installed plugins as cards.** Every plugin in
`~/.config/omarchy/plugins` (and every one Omarchy ships) that has an
`entryPoints.barWidget` shows up in the list next to the built-in widgets.
Switch one on and its bar widget is drawn on the wallpaper as a card: same
QML, same settings from its own manifest, nothing to change in the plugin.
Plugin cards take clicks, come in `1×1`, `2×1` and `2×2`, and the inspector
names the plugin and its author. The list rescans every time the editor opens,
or on `omarchy-shell widgets rescanPlugins`.

**Plugin card fit.** An embedded plugin panel is laid out to its content
instead of being clipped to its cells:

| Where | Control | Config key |
|---|---|---|
| Editor bar | **Padding**: *Theme* (the theme's popup padding) or *Custom* per side | `layout.paddingTheme`, `layout.padding` |
| Inspector | Padding: follow the *Grid* or the card's *Own* | `padding` |
| Inspector | **Content size (%)**, 25–200 | `contentScale` |
| Inspector | **Max height (rows)** the card may grow to, `0` = no limit; cards below are pushed down | `maxRows` |
| Inspector | **Align**: top, center, bottom, when the card is taller than its panel | `align` |

**Hide behind windows.** The grid leaves the screen while a window is in front
of it and comes back when the workspace is empty, per monitor. While it is
away, its click regions go with it. Editor bar: **Hide behind windows**
(on by default), **Animation** (*Off*, *Fade*, *Slide*, *Scale*) and
**Speed** (*Fast*, *Normal*, *Slow*). Config: `hideWhenWindows`, `animStyle`,
`animDuration` (ms, 0–2000).

**Nothing on by default.** A fresh install puts nothing on your desktop. Every
type, built-in or discovered, is offered in the list switched off.

**Under the hood.** The logic in `Model.js` is split into [`model/`](model), one
file per concern, with the QML chrome under [`ui/`](ui). `npm run check` runs
the tests, a manifest validator and `qmllint`; CI runs it on every push, and a
`v*` tag builds a release.

## Install

```bash
omarchy plugin add https://github.com/brittiaa/omarchy-plugins-widget.git
omarchy plugin enable brittiaa.widgets
```

Then click **Widgets** in the bar and switch on what you want.

`~/.config/omarchy/plugins/brittiaa.widgets/install --yes` does the same, and
also picks `add` or `update`, checks for `git`, `jq`, `curl` and
`timedatectl`, restarts the shell, and prints the line that adds
[`palccod.omate`](https://github.com/Palccod/Omate), which the Omate card
needs. It does not install other people's plugins for you.

| | |
|---|---|
| **Update** | `~/.config/omarchy/plugins/brittiaa.widgets/update`, or `omarchy plugin update brittiaa.widgets && omarchy restart shell` |
| **Disable** | `omarchy plugin disable brittiaa.widgets` (config kept) |
| **Remove** | `omarchy plugin remove brittiaa.widgets` (leaves `~/.config/omarchy/widgets.json`) |
| **Requires** | Omarchy 4 (the Quickshell shell) |

`omarchy plugin add` does not upgrade: run on an installed plugin it errors
out. Use `update`.

> **Coming from the original plugin?** This fork installs as
> `brittiaa.widgets`; upstream is `anishfn.widgets` (and, before 0.2.0,
> `io.github.anishfn.widgets`). An id is also a directory name, so the two sit
> side by side and would draw the desktop twice. Remove the old one first:
>
> ```bash
> omarchy plugin remove anishfn.widgets
> omarchy plugin add https://github.com/brittiaa/omarchy-plugins-widget.git
> omarchy plugin enable brittiaa.widgets
> ```
>
> Your desktop survives the round trip — `remove` leaves
> `~/.config/omarchy/widgets.json` where it is, and the new install reads it
> back.

## The widgets

| Widget | Shows | Source | Main settings |
|---|---|---|---|
| **Clock** | Time in any timezone, and the offset from yours | local | `timezone`, `label`, `format`, `ticks` |
| **Weather** | Now, today's range, the condition | `wttr.in` | `units`, `label`, `showRange` |
| **GitHub** | A year of contributions | `github.com` | `login`, `showLegend` |
| **Repo pulse** | Stars, forks, issues, open PRs | `api.github.com` | `repo`, `showStats` |
| **Crypto** | A wallet's balance and value, or a coin's price | four chains, `api.coingecko.com` | set in the inspector; an address only goes to its own chain's node |
| **Calendar** | What is next and where it falls in the day | `calendar.google.com` | `icsUrl` (the secret iCal address), `format` |
| **Todos** | A list from a text file, tickable | local file | `file` (default `~/.config/omarchy/todos.txt`), `canTick` |
| **Music** | What is playing, with transport | MPRIS | `player`, `showArt` |
| **Omate** | Controls for the Omate desktop pet | `palccod.omate` | — |
| **Photos** | A picture, or a folder shown in turn | local files | `path`, `interval`, `fit` |

Weather follows `omarchy-weather-location` (`--set "City"`, `--clear` for IP
detection). Clickable cards: Music, Repo pulse, Todos and every plugin card;
everything else lets clicks through to the desktop.

## Arranging

Open the editor from the bar or with `omarchy-shell widgets edit`. Drag cards
on the grid, drop them from the tray, pick a card to edit it in the inspector.
The grid is 1–6 columns, can sit on the left, the right or both, and scales
25–200%.

<p align="center">
  <img src="assets/editor.jpg" alt="The layout editor: the grid under the widgets, and the inspector, tray and layout bar in one bottom-centred column" width="880">
</p>

## Config

Everything lives in `~/.config/omarchy/widgets.json`. It is watched, so saving
it updates the desktop; a file that does not parse is left alone and logged.
Out-of-range values are clamped and unknown keys dropped.

```json
{
  "version": 2,
  "layout": {
    "side": "right", "columns": 2, "cellSize": 200, "gap": 16,
    "marginX": 40, "marginY": 40, "scale": 1, "opacity": 0.72,
    "hideWhenWindows": true, "animStyle": "slide", "animDuration": 220,
    "padding": { "top": 10, "right": 10, "bottom": 10, "left": 10 },
    "paddingTheme": false
  },
  "widgets": [
    {
      "id": "blr", "type": "clock", "enabled": true, "monitor": "",
      "col": 0, "row": 0, "cols": 1, "rows": 1,
      "settings": { "timezone": "Asia/Kolkata", "format": "HH:mm" }
    },
    {
      "id": "spotify", "type": "quickshell.spotify", "enabled": true,
      "col": 0, "row": 1, "cols": 2, "rows": 1,
      "maxRows": 3, "align": "center", "contentScale": 0.9
    }
  ]
}
```

`type` is a built-in name or the id of an installed plugin. `monitor` is an
output name from `hyprctl monitors`, or `""` for all. Per card, `opacity` and
`radius` override the layout's; omit them to follow it.

## Command line

```bash
omarchy-shell widgets list                # the grid, and where every widget sits
omarchy-shell widgets enable|disable|toggle <id>
omarchy-shell widgets place <id> <col> <row> [left|right]
omarchy-shell widgets set <id> <key> <value>
omarchy-shell widgets add <type>          # another one, at its defaults
omarchy-shell widgets duplicate|remove <id>
omarchy-shell widgets columns 4
omarchy-shell widgets edit|done           # open or close the editor
omarchy-shell widgets rescanPlugins       # look for newly installed plugins
omarchy-shell widgets reload              # re-read the config file
```

Also: `move`, `size`, `select`, `side`, `scale`, `opacityAll`, `radiusAll`,
`opacity`, `opacityClear`, `resetAppearance`, and the data dumps `json`,
`weather`, `github`, `repos`, `calendar`, `crypto`, `todos` with their
`refresh*` counterparts. The definitions are in [Service.qml](Service.qml).

## Development

```bash
npm run check                # tests, manifest and qmllint, as CI runs them
omarchy plugin validate .    # manifest against the Omarchy schema
dev/preview [--edit]         # draw the widgets without the shell
omarchy restart shell        # needed to see an edit in the real shell
```

The manifest sets `keepLoaded`, so the running shell keeps the old QML until
it restarts. [CONTRIBUTING.md](CONTRIBUTING.md) covers adding a widget,
[DESIGN.md](DESIGN.md) how it should look.

## License

MIT. See [LICENSE](LICENSE).

This is a fork of [anishfn/omarchy-widgets](https://github.com/anishfn/omarchy-widgets),
also MIT. The original copyright notice is kept in [LICENSE](LICENSE), as the
licence requires, alongside the one for the changes made here.
