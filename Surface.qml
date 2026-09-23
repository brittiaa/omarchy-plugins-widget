import QtQuick
import Quickshell
import Quickshell.Wayland
import Quickshell.Hyprland
import qs.Commons
import "ui"
import "Model.js" as Model

// The desktop itself: one layer-shell surface per output, holding whichever
// widgets the config says belong on it, laid out on the grid.
//
// The surface sits on the Bottom layer, above the wallpaper and beneath every
// window, which is where a desktop widget belongs — it should be something
// you see when you clear the screen, not something you have to move around.
//
// It reserves no space and takes no input: `exclusiveZone: 0` asks the
// compositor to keep the surface inside the area the bar has already claimed,
// so the grid's top row lines up under the bar rather than behind it, and an
// empty `mask` means every click lands on whatever is underneath. That
// combination is deliberate: widgets here are read, not operated, and one
// that swallowed clicks on the desktop would be a bug the user could not see
// the cause of. Arranging them is the editor's job, on its own surface.
Item {
  id: root

  // Injected by the shell when the plugin loads.
  property var shell: null
  property var service: null
  property var manifest: null
  property string omarchyPath: ""

  readonly property string pluginId: manifest && manifest.id
    ? String(manifest.id) : "brittiaa.widgets"

  // The shell assigns `service` once, as the panel loads. If the service
  // singleton was not built yet at that moment the assignment lands as null
  // and never corrects itself, so fall back to asking the shell — that lookup
  // reads a property the shell reassigns when a service appears, which makes
  // this binding re-evaluate rather than stay stuck on the miss.
  readonly property var svc: service
    ? service
    : (shell && typeof shell.serviceFor === "function" ? shell.serviceFor(pluginId) : null)

  readonly property var config: svc ? svc.config : null
  readonly property var layout: config ? config.layout : Model.normalizeLayout(null)
  readonly property bool editing: svc ? svc.editing === true : false

  // Bumped by the service every time it finishes scanning for plugins. Read by
  // `sourceFor` so that a binding calling it is re-evaluated when the catalogue
  // changes: the catalogue lives in Model's shared scope, and assigning to a
  // JavaScript variable invalidates no QML binding on its own.
  readonly property int catalogRevision: svc ? svc.catalogRevision : 0

  function sourceFor(type) {
    var revision = root.catalogRevision   // a dependency, not a value
    var entry = Model.catalogEntry(type)
    if (!entry) return ""
    // A discovered plugin carries the absolute file:// URL the scan resolved
    // against its own directory; a built-in carries a path relative to this
    // file, which is where Qt.resolvedUrl looks.
    if (entry.sourceUrl) return entry.sourceUrl
    return entry.source ? Qt.resolvedUrl(entry.source) : ""
  }

  // ------------------------------------------------- shell summon interface
  //
  // `omarchy-shell shell toggle <id>` has two paths, and a plugin that is
  // both a panel and a bar widget takes the panel one — shell.qml hands the
  // call to whatever the panel loader mounted, which is this file. But the
  // thing worth summoning is the bar popup, not the desktop surface, which is
  // always up and takes no input. So the contract is implemented here and
  // forwarded to the widget in the bar, which is the same place a click on
  // the bar button lands.
  //
  // `open` takes the payload shell.qml delivers and ignores it: there is
  // nothing to configure about showing a list of switches.
  readonly property var barHost: shell && shell.bar ? shell.bar : null
  readonly property bool opened: barHost && typeof barHost.isBarWidgetOpen === "function"
    ? barHost.isBarWidgetOpen(pluginId) : false

  function open(payloadJson) {
    if (barHost && typeof barHost.summonBarWidget === "function") barHost.summonBarWidget(pluginId)
  }

  function close() {
    if (barHost && typeof barHost.hideBarWidget === "function") barHost.hideBarWidget(pluginId)
  }

  function toggle() { opened ? close() : open("") }

  // ---------------------------------------------- knowing about the windows
  //
  // Hyprland's state is populated on demand and starts out empty, so something
  // has to ask for it. Left to chance this works anyway -- the bar's own
  // workspace widget asks, and there is one set of objects for the whole shell
  // -- but a desktop that only knows about windows because something else in
  // the bar happened to want the same thing is a coincidence, not a design.
  //
  // All three, because the question being asked spans all three: which monitor
  // is this, what is on it, and how many windows are on that. Refreshing only
  // the monitors leaves every `activeWorkspace` null, which reads as an empty
  // desktop on a screen full of windows -- widgets that never get out of the
  // way, and nothing in the log to say why.
  // Workspaces before monitors, deliberately. A monitor's reply names its active
  // workspace, and the name is linked to a workspace object that has to already
  // exist for the link to resolve -- ask for monitors first and `activeWorkspace`
  // comes back null and stays null.
  function refreshWindowState() {
    Hyprland.refreshWorkspaces()
    Hyprland.refreshToplevels()
    Hyprland.refreshMonitors()
  }

  // Each of those is a request, not an answer: the reply arrives over a socket,
  // and until it does the objects exist but say nothing -- workspaces with an id
  // of -1 and no monitor, and a monitor list that is simply empty. Asking once
  // on startup loses that race, and losing it leaves every screen looking
  // unoccupied for as long as the shell runs.
  //
  // So ask again until the answer arrives, and take `activeWorkspace` as the
  // signal that it has: it is the last thing to resolve, because it needs two
  // replies to have landed in the right order. After that Hyprland's event
  // socket keeps all of it current and there is nothing left to poll for.
  //
  // `attempts` is a ceiling rather than a schedule -- on a machine where this
  // never resolves it gives up instead of asking twice a second forever.
  readonly property bool windowStateKnown: {
    if (!Hyprland.monitors) return false
    var monitors = Hyprland.monitors.values
    if (monitors.length === 0) return false
    for (var i = 0; i < monitors.length; i++)
      if (monitors[i].activeWorkspace) return true
    return false
  }

  property int windowStateAttempts: 0

  Timer {
    interval: 500
    repeat: true
    running: !root.windowStateKnown && root.windowStateAttempts < 30
    triggeredOnStart: true
    onTriggered: {
      root.windowStateAttempts++
      root.refreshWindowState()
    }
  }

  // A monitor plugged in after start brings a workspace this has never seen,
  // and the probe above has long since stopped.
  Connections {
    target: Quickshell
    function onScreensChanged() {
      root.windowStateAttempts = 0
      root.refreshWindowState()
    }
  }

  // ------------------------------------------------------------- the layout

  Variants {
    model: Quickshell.screens

    delegate: Component {
      PanelWindow {
        id: surface
        required property var modelData

        readonly property string screenName: modelData && modelData.name ? String(modelData.name) : ""
        readonly property var placed: root.config
          ? Model.widgetsForScreen(root.config, surface.screenName)
          : []

        // Height each card's content asks for, by id, reported by the cards
        // themselves. Reassigned rather than mutated, so `rects` re-reads it.
        property var naturalHeights: ({})
        function setNaturalHeight(id, h) {
          if ((surface.naturalHeights[id] || 0) === h) return
          var next = Object.assign({}, surface.naturalHeights)
          next[id] = h
          surface.naturalHeights = next
        }

        // Where every card is drawn: its cells, grown to its content, with
        // whatever sits below a grown card pushed down.
        readonly property var rects: Model.flowRects(root.layout, surface.placed,
          surface.width, surface.naturalHeights)

        screen: modelData
        // Stood down while the editor is up: the editor draws the same cards
        // in the same places on its own interactive surface, so leaving these
        // underneath would double every widget.
        //
        // `deck.opacity > 0` is what keeps the window mapped while the grid is
        // on its way off the screen. Unmapping it the instant a window opened
        // would delete the thing being animated and the exit would never be
        // seen -- the cards would simply be gone.
        visible: placed.length > 0 && !root.editing && (!surface.stowed || deck.opacity > 0)
        color: "transparent"

        anchors { top: true; bottom: true; left: true; right: true }

        WlrLayershell.namespace: "omarchy-widgets"
        WlrLayershell.layer: WlrLayer.Bottom
        WlrLayershell.keyboardFocus: WlrKeyboardFocus.None

        // Reserve nothing, but stay inside what the bar reserved.
        exclusionMode: ExclusionMode.Normal
        exclusiveZone: 0

        // ------------------------------------------------ out of the way
        //
        // A wallpaper decoration showing through the gaps around a window is
        // clutter rather than information, so the grid leaves the screen while
        // there is something in front of it and comes back when the desktop is
        // clear again.
        //
        // Measured per monitor, on that monitor's active workspace: with a
        // window on one screen and an empty desktop on the other, only the
        // screen with the window loses its widgets. `toplevels` on a workspace
        // is the same count Omarchy's own Workspaces widget uses to decide
        // whether a workspace is occupied.
        readonly property var hyprMonitor: {
          if (!Hyprland.monitors || !surface.screenName) return null
          var monitors = Hyprland.monitors.values
          for (var i = 0; i < monitors.length; i++)
            if (String(monitors[i].name) === surface.screenName) return monitors[i]
          return null
        }

        // False whenever we cannot tell, and every step of the way there is a
        // way not to be able to tell: Hyprland's state arrives over a socket
        // and is empty for the first moments of a shell's life, so a monitor,
        // its active workspace, or that workspace's toplevels can each still be
        // missing. None of those is a reason to take somebody's widgets away.
        // The wrong answer has to be the one you can see and wait out, not the
        // one that leaves the desktop bare with no way to tell why.
        readonly property bool occupied: {
          var monitor = surface.hyprMonitor
          if (!monitor) return false
          var workspace = monitor.activeWorkspace
          if (!workspace || !workspace.toplevels) return false
          return workspace.toplevels.values.length > 0
        }

        readonly property bool stowed: root.layout.hideWhenWindows === true && surface.occupied

        // Input region: empty by default, so nothing here can intercept a
        // click meant for the desktop or a window. A widget type that asks
        // for input by declaring `interactive` in the catalogue gets its own
        // rectangle back, and nothing else — a music card can be pressed
        // without the clock beside it swallowing a click on the desktop.
        //
        // Built by hand rather than declared, because the set of rectangles
        // depends on the config. Nested regions combine, which is the union
        // of the interactive widgets and exactly what is wanted.
        mask: Region { id: inputMask }

        readonly property var interactive: root.config
          ? Model.interactiveWidgetsForScreen(root.config, surface.screenName)
          : []

        function rebuildInputRegions() {
          var made = []
          // A card that has left the screen must not still be holding the
          // click that lands where it used to be. An interactive plugin card
          // off to the right of the display would otherwise keep a strip of
          // the desktop unclickable for as long as a window was open.
          var wanted = surface.stowed ? [] : surface.interactive
          for (var i = 0; i < wanted.length; i++) {
            var rect = surface.rects[wanted[i].id]
            if (!rect) continue
            var region = regionComponent.createObject(surface, {
              x: rect.x, y: rect.y, width: rect.width, height: rect.height
            })
            if (region) made.push(region)
          }
          for (var old = 0; old < surface.ownedRegions.length; old++) {
            if (surface.ownedRegions[old]) surface.ownedRegions[old].destroy()
          }
          surface.ownedRegions = made
          inputMask.regions = made
        }

        property var ownedRegions: []

        Component {
          id: regionComponent
          Region {}
        }

        onInteractiveChanged: rebuildInputRegions()
        onStowedChanged: rebuildInputRegions()
        // The grid can move without the widget list changing at all — a side
        // or column change, a new width, a card growing to its content — and
        // every one of those arrives as new rects.
        onRectsChanged: rebuildInputRegions()
        Component.onCompleted: rebuildInputRegions()

        // Each grid moves as one piece rather than card by card. Cards
        // leaving in sequence would read as a list emptying itself; a grid
        // sliding off reads as the grid getting out of the way, which is what
        // it is doing.
        //
        // The two grids are mirrors of each other: each leaves towards the
        // edge it hugs, and scales towards it, so a widget on the left never
        // crosses the desktop to get out of the way.
        Item {
          id: deck

          // Sized rather than anchored. `anchors.fill` would anchor left and
          // right, and an anchored item's x is not its own to set -- the slide
          // would be overruled by the anchor and nothing would move.
          y: 0
          width: surface.width
          height: surface.height

          readonly property int animMs: root.layout.animDuration
          readonly property string animStyle: root.layout.animStyle
          readonly property bool animated: animMs > 0 && animStyle !== "none"

          opacity: surface.stowed ? 0 : 1

          // Behaviors rather than states, because a Behavior animates from
          // wherever the property currently is. Open a window and close it
          // again before the grid is gone and it turns around from half way
          // out, instead of jumping to the edge to start coming back.
          Behavior on opacity {
            enabled: deck.animated
            NumberAnimation { duration: deck.animMs; easing.type: Easing.OutCubic }
          }

          Repeater {
            model: Model.SIDES

            delegate: Item {
              id: sideDeck
              required property string modelData
              readonly property bool leftSide: modelData === "left"

              y: 0
              width: surface.width
              height: surface.height

              x: surface.stowed && deck.animStyle === "slide"
                ? (leftSide ? -surface.width : surface.width) : 0
              scale: surface.stowed && deck.animStyle === "scale" ? 0.92 : 1
              transformOrigin: leftSide ? Item.Left : Item.Right

              Behavior on x {
                enabled: deck.animated
                NumberAnimation { duration: deck.animMs; easing.type: Easing.OutCubic }
              }
              Behavior on scale {
                enabled: deck.animated
                NumberAnimation { duration: deck.animMs; easing.type: Easing.OutCubic }
              }

              Repeater {
                model: surface.placed.filter(function(w) {
                  return Model.sideOf(w, root.layout) === sideDeck.modelData
                })

                delegate: WidgetInstance {
                  required property var modelData

                  readonly property var rect: surface.rects[modelData.id]
                    || Model.widgetRect(root.layout, modelData, surface.width)
                  onNaturalHeightChanged: surface.setNaturalHeight(modelData.id, naturalHeight)
                  x: rect.x
                  y: rect.y
                  width: rect.width
                  height: rect.height

                  // A card growing to its content, and the ones it pushes down,
                  // slide there rather than jump: a calendar that gains an event
                  // should read as making room, not as the desktop rearranging.
                  // At the layout's own speed, and not at all when it is off.
                  Behavior on y { enabled: deck.animated; NumberAnimation { duration: deck.animMs; easing.type: Easing.OutCubic } }
                  Behavior on height { enabled: deck.animated; NumberAnimation { duration: deck.animMs; easing.type: Easing.OutCubic } }

                  service: root.svc
                  shell: root.shell
                  instance: modelData
                  widgetSource: root.sourceFor(modelData.type)
                  isPlugin: Model.isPluginType(modelData.type)
                }
              }
            }
          }
        }
      }
    }
  }

  // The editor is only built while it is open. It is a separate surface
  // because it is the opposite of this one in every way that matters: on top
  // instead of underneath, and made of input instead of free of it.
  Loader {
    active: root.editing
    asynchronous: false
    source: Qt.resolvedUrl("ui/Editor.qml")
    onLoaded: {
      item.shell = root.shell
      item.service = root.svc
      item.surface = root
    }
    onStatusChanged: {
      if (status !== Loader.Error) return
      console.warn("widgets: editor failed to load:", errorString ? errorString() : "")
      if (root.svc) root.svc.editing = false
    }
  }
}
