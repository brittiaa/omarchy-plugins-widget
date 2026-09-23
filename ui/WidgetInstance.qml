import QtQuick
import Quickshell
import qs.Commons
import qs.Ui
import "../Model.js" as Model

// One configured widget, drawn. The card chrome plus whichever QML file the
// catalogue names for its type.
//
// Both the desktop and the editor mount this, which is the point: what you
// drag around in the editor is the same component, at the same size, in the
// same colors as the thing that ends up on your wallpaper. An editor that
// drew its own approximation of a widget would drift from it.
Item {
  id: root

  property var service: null
  property var instance: null
  // The shell object, passed through so a widget can reach another plugin's
  // service (shell.serviceFor). Most widgets never need it; the ones that
  // drive a companion plugin cannot work without it.
  property var shell: null
  // Source URL for the type's QML, resolved by the caller against the plugin
  // directory — this file lives beside Surface.qml, so a relative resolve here
  // would be right by accident rather than by contract.
  property url widgetSource: ""
  // True when the loaded QML is a third-party Omarchy plugin rather than one
  // of the built-in widget files. A plugin's QML was written for the bar and
  // expects a `bar` host object; the facade below is what lets it mount on a
  // wallpaper instead.
  property bool isPlugin: false

  readonly property real cardOpacity: {
    if (service && service.config && service.config.layout)
      return Model.effectiveOpacity(service.config, instance)
    return instance && typeof instance.opacity === "number" ? instance.opacity : Model.DEFAULT_OPACITY
  }
  readonly property int radius: {
    if (service && service.config)
      return Model.effectiveRadius(service.config, instance)
    return instance && typeof instance.radius === "number"
      ? instance.radius : Model.DEFAULT_RADIUS
  }

  readonly property alias card: card

  readonly property var gridLayout: service && service.config && service.config.layout
    ? service.config.layout : Model.DEFAULT_LAYOUT

  // Space between the card's edges and an embedded panel, one value a side,
  // in px already scaled: the card's own, else the layout's, else -- when the
  // layout follows the theme -- the theme's popup padding all round.
  readonly property var padding: {
    var own = Model.effectivePadding(service ? service.config : null, instance)
    if (own.theme) {
      var p = Style.spacing.popupPadding
      return { top: p, right: p, bottom: p, left: p }
    }
    return { top: Style.space(own.top), right: Style.space(own.right),
      bottom: Style.space(own.bottom), left: Style.space(own.left) }
  }

  // The tallest this card may grow, in px: its `maxRows` worth of grid, never
  // less than its own rows. Past it the panel shrinks to fit again.
  readonly property real heightLimit: instance && instance.maxRows > 0
    ? Model.blockHeight(gridLayout, Math.max(instance.maxRows, instance.rows)) : Infinity

  // The height this card's content asks for at the card's width, or 0 when it
  // asks for nothing. Only an embedded panel asks: it is laid out for its own
  // size and grows with what it holds (a calendar day with more events), so
  // the card grows with it instead of shrinking it to fit. Read by whoever
  // places the card, through Model.flowRects.
  readonly property real naturalHeight: embedHost.visible && embedHost.height > 0
    ? Math.ceil(embedHost.height * embedHost.scale + embedHost.padTop + embedHost.padBottom) : 0

  // ------------------------------------------------------------ the bar it wants
  //
  // A plugin's widget extends qs.Ui.BarWidget, which reads everything about its
  // surroundings off a `bar` object the shell hands it. There is no bar here, so
  // this is one: a real PluginBarApi, the same type Bar.qml builds, filled in
  // for a card on a wallpaper.
  //
  // Using the shell's own type rather than a hand-written QtObject is the whole
  // point. The facade cannot drift from the contract, because it *is* the
  // contract -- a property added to PluginBarApi appears here with its default
  // instead of being missing, and a plugin reading it gets a value rather than
  // `undefined`.
  //
  // What cannot be honoured is honoured as nothing. A popout is a top-level
  // Wayland surface and a card is not one, so requesting a popout does nothing
  // at all rather than half-opening something. A tooltip is the bar's to draw.
  // A plugin that depends on either still mounts, still draws, and still works
  // for everything else it does.
  PluginBarApi {
    id: barApi

    pluginId: root.instance ? String(root.instance.type) : ""
    moduleName: root.instance ? String(root.instance.type) : ""
    shell: root.shell

    // Never vertical: a card is a rectangle on a wallpaper, and a plugin that
    // lays itself out for a side bar inside one would be laying out for a shape
    // it has not got.
    vertical: false
    position: "bottom"
    // The only honest answer to "how thick is the bar": as thick as the space
    // the plugin has, which is the card.
    barSize: Math.round(root.height)
    transparent: false

    foreground: Color.foreground
    barForeground: Color.foreground
    background: Color.background
    urgent: Color.urgent
    fontFamily: Style.font.family

    // `run` is the one function a bar widget is most likely to call, and the
    // one there is no reason to refuse: launching a command has nothing to do
    // with being in a bar. Detached, the way the shell runs it.
    _run: function(command) {
      var line = String(command || "")
      if (line) Quickshell.execDetached(["bash", "-lc", line])
    }
  }

  WidgetCard {
    id: card
    anchors.fill: parent
    backgroundAlpha: root.cardOpacity
    cardRadius: root.radius

    Loader {
      id: widgetLoader
      anchors.fill: parent
      asynchronous: true
      source: root.widgetSource

      // A property may exist and still refuse to be written: a plugin is free
      // to declare `readonly property var service` for a singleton of its own,
      // and assigning to that throws rather than failing quietly. Which
      // properties a third-party file declares, and how, is not ours to decide,
      // so every injection is attempted and a refusal is survived.
      function give(name, value) {
        if (!item || !(name in item)) return
        try {
          item[name] = value
        } catch (e) {
          // Read-only, or a type it will not take. Nothing to do about it here:
          // the widget keeps whatever it had, which is its author's intent.
        }
      }

      function inject() {
        if (!item) return

        if (root.isPlugin) {
          // What a bar hands its widgets, and nothing else. `service`,
          // `instance` and `card` are this repo's contract with its own
          // widgets; a plugin has never heard of them, and a plugin that
          // happens to have a `service` of its own means something different
          // by the word.
          give("bar", barApi)
          give("moduleName", barApi.moduleName)
          // The settings the user set, already merged with the manifest's
          // defaults by normalization, which is what `bar.setting(name,
          // fallback)` reads. Without this every setting would fall through to
          // the fallback written into the plugin's own QML, which is not the
          // same value as its declared default.
          if (root.instance) give("settings", root.instance.settings || ({}))
          return
        }

        give("service", root.service)
        give("instance", root.instance)
        give("card", card)
        give("shell", root.shell)
      }

      // A plugin whose bar widget is a qs.Ui.Panel mounts only its bar button
      // here: the content lives in a KeyboardPanel or PopupCard, a separate
      // window the card cannot show. So the panel is opened logically, its
      // content item is lifted out of that window into `embedHost`, and the
      // window and the button are hidden. The content is laid out at the
      // panel's own size, scaled to the card's width, and the card grows to
      // its height.
      //
      // Anything unexpected leaves things as they were: the card keeps the
      // button, and clicking it opens the plugin's own window. Keyboard focus
      // does not follow the content -- this surface takes no keys -- so a
      // panel's key handling never fires; pointer input does work.
      property bool embedded: false

      // The popup window, wherever the plugin keeps it: directly under its
      // root (a qs.Ui.Panel), or inside a Loader that a bar button forwards
      // to (calendar, omaplug). Recognised by what it is -- a window with an
      // anchor, a size and an open state -- rather than by its type name,
      // which a plugin is free to wrap.
      function findPopup(obj, depth) {
        if (!obj || depth > 6) return null
        if ("anchorItem" in obj && "contentWidth" in obj && "open" in obj && "contentItem" in obj)
          return obj
        var list = obj.data
        if (list) {
          for (var i = 0; i < list.length; i++) {
            var found = findPopup(list[i], depth + 1)
            if (found) return found
          }
        }
        return obj.item ? findPopup(obj.item, depth + 1) : null
      }

      function embedPanel() {
        if (!root.isPlugin || embedded || !item) return
        try {
          var wnd = findPopup(item, 0)
          if (!wnd || !wnd.contentItem || wnd.contentItem.length === 0) return
          var holder = wnd.contentItem[0].parent
          if (!holder) return

          // The panel has to believe it is open: plugins gate their refresh
          // timers on it. Its owner is the qs.Ui.Panel that drives `open`.
          if (wnd.owner && typeof wnd.owner.open === "function") wnd.owner.open()
          else wnd.open = true

          holder.anchors.fill = undefined
          holder.parent = embedHost
          holder.x = 0
          holder.y = 0
          holder.width = Qt.binding(function() { return wnd.contentWidth })
          holder.height = Qt.binding(function() { return wnd.contentHeight })
          embedHost.width = Qt.binding(function() { return wnd.contentWidth })
          embedHost.height = Qt.binding(function() { return wnd.contentHeight })
          embedHost.visible = true
          // The window sizes itself to fit the screen minus the bar it is
          // anchored to, and the "bar" here is this whole-screen surface, so
          // it would clamp to its 120 px floor. Cut loose from its anchor it
          // has no screen to clamp against and takes the height its content
          // asks for.
          wnd.anchorItem = null
          wnd.visible = false
          item.visible = false
          embedded = true
        } catch (e) {
          console.warn("widgets: " + (root.instance ? root.instance.type : "?")
            + " could not embed its panel:", e)
        }
      }

      // A plugin that loads its panel late has no window yet when the widget
      // does, so look again for a few seconds before settling for the button.
      Timer {
        id: embedRetry
        interval: 250
        repeat: true
        property int tries: 0
        onTriggered: {
          widgetLoader.embedPanel()
          if (widgetLoader.embedded || ++tries >= 16) stop()
        }
      }

      onLoaded: {
        inject()
        embedPanel()
        if (root.isPlugin && !embedded) { embedRetry.tries = 0; embedRetry.restart() }
      }
      // The delegate is rebuilt whenever the config changes, but a settings
      // edit that leaves the list identical reuses it, so re-inject rather
      // than trust the one-shot at load.
      Connections {
        target: root
        function onInstanceChanged() { widgetLoader.inject() }
      }

      onStatusChanged: {
        if (status !== Loader.Error) return
        console.warn("widgets: " + (root.instance ? root.instance.type : "?")
          + " failed to load:", String(source))
      }
    }

    // Where an embedded panel's content lives. Fitted to the card's width by
    // scale rather than by resizing, because a panel is laid out for its own
    // size; drawn at the card's content size (100% by default), never wider
    // than the card. Height is not fitted at all: a taller
    // panel makes a taller card (naturalHeight), not a smaller panel, up to
    // the card's `maxRows`. Reading
    // only the width is also what keeps this free of a binding loop, since
    // the card's height follows from it.
    //
    // Clipped, so a panel that has grown before its card has finished
    // animating to the new height does not spill out of the bottom meanwhile.
    Item {
      anchors.fill: parent
      clip: true

      Item {
        id: embedHost
        visible: false
        transformOrigin: Item.TopLeft
        // Held off the card's edges by the padding, standing in for the
        // padding the panel's own window gave it before the reparenting.
        readonly property real padTop: root.padding.top
        readonly property real padRight: root.padding.right
        readonly property real padBottom: root.padding.bottom
        readonly property real padLeft: root.padding.left
        readonly property real room: Math.max(1, card.width - padLeft - padRight)
        // The limit is known without the card's height, so it too stays out
        // of the loop.
        readonly property real roomDown: Math.max(1, root.heightLimit - padTop - padBottom)
        x: padLeft + Math.max(0, (room - width * scale) / 2)
        // Top, centre or bottom of whatever height the card has beyond the
        // panel; the card only has any when its cells are taller than it.
        y: {
          var spare = Math.max(0, card.height - padTop - padBottom - height * scale)
          var align = root.instance ? root.instance.align : "top"
          return padTop + (align === "bottom" ? spare : align === "center" ? spare / 2 : 0)
        }
        // The card's own content size, then whatever the width and the
        // height limit leave room for, whichever is smallest.
        readonly property real wanted: root.instance && root.instance.contentScale > 0
          ? root.instance.contentScale : 1
        scale: width > 0 && height > 0 ? Math.min(wanted, room / width, roomDown / height) : 1
      }
    }
  }
}
