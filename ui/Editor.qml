import QtQuick
import Quickshell
import Quickshell.Wayland
import qs.Commons
import qs.Ui
import "../Model.js" as Model

// The layout editor. One interactive overlay per output, drawn over the grid
// the desktop uses, showing the real widget cards in their real places.
//
// It is the desktop surface's opposite: on top instead of underneath, and
// made of input instead of free of it. What makes the two line up is that
// both use `exclusiveZone: 0`, so their coordinate origins are the same point
// below the bar, and both ask Model for cell rectangles rather than computing
// their own — the cell you drop into is the cell that gets drawn.
//
// Dragging is done by hand rather than with Drag/DropArea. A drag here starts
// on one of three surfaces (a card on the grid, a tile in the tray) and can
// end on any of them, and a manual grab is the only way to keep one gesture
// in charge across all of it while the drop target changes underneath.
Item {
  id: root

  property var shell: null
  property var service: null
  property var surface: null

  readonly property var config: service ? service.config : null
  readonly property var layout: config ? config.layout : Model.normalizeLayout(null)

  readonly property color foreground: Color.popups.text
  readonly property color accent: Color.accent
  readonly property color urgent: Color.urgent
  readonly property color dim: Qt.darker(foreground, 1.5)
  readonly property string fontFamily: Style.font.family

  // The widget the controls act on. Kept on the service so it outlives this
  // window; the editor only ever asks for it and asks to change it.
  readonly property string selectedId: service ? String(service.selectedId || "") : ""
  readonly property var selected: config ? Model.findInstance(config, selectedId) : null

  function select(id) { if (service) service.select(id) }

  // Bumped by the service after every plugin scan. Read by `sourceFor` so a
  // binding that calls it is re-evaluated when the catalogue changes: the
  // catalogue lives in Model's shared scope, and a JavaScript assignment there
  // invalidates no QML binding on its own.
  readonly property int catalogRevision: service ? service.catalogRevision : 0

  function sourceFor(type) {
    var revision = root.catalogRevision   // a dependency, not a value
    var entry = Model.catalogEntry(type)
    if (!entry) return ""
    // A discovered plugin carries the absolute file:// URL the scan resolved
    // against its own directory; a built-in carries a path relative to this
    // file, which is where Qt.resolvedUrl looks.
    if (entry.sourceUrl) return entry.sourceUrl
    return entry.source ? Qt.resolvedUrl("../" + entry.source) : ""
  }

  function nameFor(instance) { return Model.displayName(config, instance) }

  // Zones as the picker wants them: the city first, because that is what
  // anyone is scanning for, with the full name kept so the several
  // Springfields stay apart.
  readonly property var timezoneOptions: {
    var names = service && service.timezoneNames ? service.timezoneNames : []
    var out = [{ value: "", label: "Your own clock" }]
    for (var i = 0; i < names.length; i++) {
      out.push({ value: names[i], label: Model.zoneLabel(names[i]) + "  ·  " + names[i] })
    }
    return out
  }

  function close() { if (service) service.editing = false }

  Variants {
    model: Quickshell.screens

    delegate: Component {
      PanelWindow {
        id: win
        required property var modelData

        readonly property string screenName: modelData && modelData.name ? String(modelData.name) : ""
        readonly property var placed: root.config
          ? Model.widgetsForScreen(root.config, win.screenName)
          : []
        readonly property var tray: root.config ? Model.offWidgets(root.config) : []

        // Cards grown to their content, as on the desktop (see Surface.qml),
        // so what you arrange here is the size it will be there.
        property var naturalHeights: ({})
        function setNaturalHeight(id, h) {
          if ((win.naturalHeights[id] || 0) === h) return
          var next = Object.assign({}, win.naturalHeights)
          next[id] = h
          win.naturalHeights = next
        }
        readonly property var rects: Model.flowRects(root.layout, win.placed,
          win.width, win.naturalHeights)
        // The same, for the grid a drop would leave, while a drag is over one.
        property var previewRects: null

        screen: modelData
        color: "transparent"
        anchors { top: true; bottom: true; left: true; right: true }

        WlrLayershell.namespace: "omarchy-widgets-editor"
        WlrLayershell.layer: WlrLayer.Overlay

        // The same inset the desktop surface takes, so a cell drawn here is
        // the cell the widget will occupy down to the pixel.
        exclusionMode: ExclusionMode.Normal
        exclusiveZone: 0

        // Exclusive only long enough to take the keyboard, then OnDemand.
        // Held exclusively, this surface would be delivered every keystroke on
        // the system for as long as it is open. OnDemand hands the keyboard
        // back the moment another window is focused; the brief prime is what
        // still gets focus at map time, so Escape works the instant it opens
        // without a click first. Same shape the shell's own KeyboardPanel uses.
        property bool focusPrimed: false
        WlrLayershell.keyboardFocus: focusPrimed
          ? WlrKeyboardFocus.OnDemand
          : WlrKeyboardFocus.Exclusive

        Component.onCompleted: focusPrime.restart()

        Timer {
          id: focusPrime
          interval: 75
          onTriggered: win.focusPrimed = true
        }

        // ------------------------------------------------------------ drag
        //
        // State lives per window: a gesture belongs to the screen it started
        // on, and a second monitor showing the same grid should not sprout a
        // ghost because the pointer moved on this one.

        property bool dragging: false
        property string dragId: ""
        property int dragCols: 1
        property int dragRows: 1
        // Where inside the card the pointer grabbed it, so the ghost keeps
        // its grip instead of snapping its corner to the cursor.
        property real grabX: 0
        property real grabY: 0
        property real pointerX: 0
        property real pointerY: 0

        readonly property real ghostX: pointerX - grabX
        readonly property real ghostY: pointerY - grabY

        property var hoverCell: null
        property bool dropValid: false
        property bool overTray: false
        // Over the toolbar or the inspector, which are not drop targets. The
        // cell underneath them is a real cell, and a card dropped into it
        // would be left under a panel — visible only once the editor closes,
        // and unreachable until it opens again. So a drop there is refused,
        // and the card stays where it was.
        property bool overChrome: false

        // The grid as it *would* be if the pointer let go now, worked out by
        // the same function that will perform the drop. Everything the drag
        // shows is read off this, so the preview and the result cannot come
        // apart -- there is only one answer, asked once per pointer move.
        property var dropPreview: null

        // Where a widget sits while a drag is in progress. The one in hand
        // keeps its old place and fades, so the grid still shows where it came
        // from; everything else slides to wherever the drop would put it,
        // content heights and all.
        function rectFor(instance) {
          var id = instance.id
          var from = win.dropPreview && win.previewRects && id !== win.dragId
            ? win.previewRects : win.rects
          return from[id] || Model.widgetRect(root.layout, instance, win.width)
        }

        function startDrag(instance, localGrabX, localGrabY, px, py) {
          if (!instance) return
          win.dragId = String(instance.id)
          win.dragCols = instance.cols
          win.dragRows = instance.rows
          win.grabX = localGrabX
          win.grabY = localGrabY
          win.pointerX = px
          win.pointerY = py
          win.dragging = true
          root.select(win.dragId)
          win.updateTarget()
        }

        function updateTarget() {
          if (!win.dragging) return
          win.overTray = win.overItem(trayPanel, win.pointerX, win.pointerY)
          win.overChrome = !win.overTray
            && (win.overItem(toolbar, win.pointerX, win.pointerY)
              || win.overItem(inspector, win.pointerX, win.pointerY))

          if (win.overTray || win.overChrome) {
            win.hoverCell = null
            win.dropValid = false
            win.dropPreview = null
            win.previewRects = null
            return
          }

          // Both the cell and whether it is a legal one come from Model, so
          // the highlight the user sees and the drop that follows cannot
          // disagree — they are one answer, asked once.
          //
          // Measured with every card at the height its content gives it, and
          // refused if it would push a card further off the bottom of the
          // screen than it already is.
          var target = root.config
            ? Model.dropTarget(root.config, win.dragId, win.ghostX, win.ghostY, win.width, {
                screenName: win.screenName,
                heights: win.naturalHeights,
                maxBottom: win.height - root.layout.marginY
              })
            : { cell: null, valid: false, preview: null, rects: null }
          win.hoverCell = target.cell
          win.dropValid = target.valid
          win.dropPreview = target.valid ? target.preview : null
          win.previewRects = target.rects
        }

        function dragMove(px, py) {
          if (!win.dragging) return
          win.pointerX = px
          win.pointerY = py
          win.updateTarget()
        }

        function dragDrop() {
          if (!win.dragging) return
          var id = win.dragId
          if (win.overTray) {
            if (root.service) root.service.setEnabled(id, false)
          } else if (win.hoverCell && win.dropValid && root.service) {
            root.service.placeWidget(id, win.hoverCell.col, win.hoverCell.row,
              win.hoverCell.side)
          }
          win.dragCancel()
        }

        function dragCancel() {
          win.dragging = false
          win.dragId = ""
          win.hoverCell = null
          win.dropValid = false
          win.dropPreview = null
          win.previewRects = null
          win.overTray = false
          win.overChrome = false
        }

        // ----------------------------------------------------------- keys

        Item {
          id: keyCatcher
          anchors.fill: parent
          focus: true
          Keys.onEscapePressed: win.dragging ? win.dragCancel() : root.close()
          Keys.onPressed: function(event) {
            if (event.key === Qt.Key_Return || event.key === Qt.Key_Enter) {
              root.close()
              event.accepted = true
            }
          }
        }

        // Dim what is behind, so the grid reads as the thing being edited.
        // It deliberately does not close on click: a click on empty grid is
        // the end of a drag far more often than it is a request to leave.
        Rectangle {
          anchors.fill: parent
          color: Util.alpha(Color.background, 0.55)
        }

        // Catches motion and release anywhere on screen, so a drag that
        // wanders off the grid still tracks and still ends.
        MouseArea {
          id: field
          anchors.fill: parent
          hoverEnabled: true
          acceptedButtons: Qt.LeftButton
          onPositionChanged: function(mouse) { win.dragMove(mouse.x, mouse.y) }
          onReleased: win.dragDrop()
          onCanceled: win.dragCancel()
          onClicked: root.select("")
        }

        // ------------------------------------------------------- the grid

        // One row past what is used, so there is always somewhere new to drop.
        //
        // Never more rows than fit above the tray and the toolbar. A widget
        // already lower than that keeps its rows, so it is not hidden by the
        // editor.
        readonly property int gridRows: {
          var used = root.config ? Model.usedRows(root.config) : 0
          return Math.min(Model.MAX_ROWS,
            Math.max(used, Math.min(used + 1, Model.rowsThatFit(root.layout, win.height - bottomChrome))))
        }

        // What the tray and the toolbar take from the bottom of the screen.
        // Cells drawn under them can be seen and not dropped on.
        readonly property real bottomChrome: chrome.anchors.bottomMargin + toolbar.height
          + (trayPanel.visible ? trayPanel.height + chrome.spacing : 0)

        // Both grids, always. The other side is drawn even when nothing is on
        // it, because that is the only way anyone finds out it is there --
        // an empty half of the screen tells you nothing, and a second grid of
        // cells is an invitation you can drag something into.
        //
        // The unused one is drawn fainter, so at a glance the desktop still
        // reads as "my widgets are on the right" rather than as two equal
        // columns you have to choose between.
        readonly property var sideUse: root.config
          ? Model.sidesInUse(root.config) : ({ left: true, right: true })

        Repeater {
          model: win.gridRows * root.layout.columns * Model.SIDES.length

          delegate: Rectangle {
            required property int index
            readonly property int perSide: win.gridRows * root.layout.columns
            readonly property string side: Model.SIDES[Math.floor(index / perSide)]
            readonly property int cell: index % perSide
            readonly property int col: cell % root.layout.columns
            readonly property int row: Math.floor(cell / root.layout.columns)
            readonly property var rect: Model.cellRect(root.layout, win.width,
              col, row, 1, 1, side)
            // Lit while a card is being carried over this grid, so the side
            // you are heading for answers before you let go.
            readonly property bool live: win.dragging
              && win.hoverCell !== null && win.hoverCell.side === side

            x: rect.x
            y: rect.y
            width: rect.width
            height: rect.height
            radius: Style.cornerRadius > 0 ? Style.cornerRadius : 0
            color: "transparent"
            border.width: 1
            border.color: Util.alpha(root.foreground,
              win.sideUse[side] || live ? 0.18 : 0.07)
          }
        }

        // Where the card in hand would land. Accent when it fits, urgent when
        // it does not, so a refused drop is refused before it happens rather
        // than by nothing appearing to change.
        Rectangle {
          visible: win.dragging && win.hoverCell !== null
          // Where the card would really end up: pushed down and grown as the
          // drop would leave it, which is not always the cell under the ghost.
          readonly property var rect: {
            if (!win.hoverCell) return { x: 0, y: 0, width: 0, height: 0 }
            if (win.previewRects && win.previewRects[win.dragId]) return win.previewRects[win.dragId]
            return Model.cellRect(root.layout, win.width, win.hoverCell.col, win.hoverCell.row,
              win.dragCols, win.dragRows, win.hoverCell.side)
          }
          x: rect.x
          y: rect.y
          width: rect.width
          height: rect.height
          radius: Style.cornerRadius > 0 ? Style.cornerRadius : 0
          color: Util.alpha(win.dropValid ? root.accent : root.urgent, 0.18)
          border.width: 2
          border.color: Util.alpha(win.dropValid ? root.accent : root.urgent, 0.9)
        }

        // ------------------------------------------------- placed widgets

        Repeater {
          model: win.placed

          delegate: Item {
            id: slot
            required property var modelData

            // Where the drop would put it, which is its own cell whenever
            // nothing is being dragged. The Repeater's model stays the real
            // config throughout, so only x and y re-evaluate as the pointer
            // moves -- rebuilding the delegates would tear every card down
            // and build it again on every mouse move.
            readonly property var rect: win.rectFor(modelData)
            readonly property bool isDragged: win.dragging && win.dragId === modelData.id
            readonly property bool isSelected: root.selectedId === modelData.id

            x: rect.x
            y: rect.y
            width: rect.width
            height: rect.height
            // Left in place but faded while it is in hand, so the grid keeps
            // showing where it came from.
            opacity: isDragged ? 0.25 : 1

            // The one place motion earns its keep. DESIGN.md rules animation
            // out on the desktop and allows it here, and this is why: a card
            // that teleports out from under the one you are holding reads as
            // a glitch, and the same card sliding down reads as the grid
            // making room. Short enough to be over before you have let go.
            Behavior on x { enabled: !slot.isDragged; NumberAnimation { duration: 130; easing.type: Easing.OutCubic } }
            Behavior on y { enabled: !slot.isDragged; NumberAnimation { duration: 130; easing.type: Easing.OutCubic } }
            // Growing to its content follows the layout's animation setting,
            // as it does on the desktop.
            Behavior on height {
              enabled: root.layout.animStyle !== "none" && root.layout.animDuration > 0
              NumberAnimation { duration: root.layout.animDuration; easing.type: Easing.OutCubic }
            }

            WidgetInstance {
              anchors.fill: parent
              onNaturalHeightChanged: win.setNaturalHeight(slot.modelData.id, naturalHeight)
              service: root.service
              shell: root.shell
              instance: slot.modelData
              widgetSource: root.sourceFor(slot.modelData.type)
              isPlugin: Model.isPluginType(slot.modelData.type)
            }

            Rectangle {
              anchors.fill: parent
              anchors.margins: -3
              visible: slot.isSelected && !slot.isDragged
              // Resolved the way the card itself resolves it, not read off the
              // instance: a card with no radius of its own carries `null`
              // there, and `null < 0` is false, so reading it raw drew a
              // square-ish ring three pixels round a card rounded twenty.
              radius: {
                var r = Model.effectiveRadius(root.service ? root.service.config : null,
                  slot.modelData)
                return (r < 0 ? Style.cornerRadius : r) + 3
              }
              color: "transparent"
              border.width: 2
              border.color: root.accent
            }

            MouseArea {
              anchors.fill: parent
              acceptedButtons: Qt.LeftButton
              cursorShape: Qt.OpenHandCursor
              preventStealing: true

              property real pressX: 0
              property real pressY: 0
              property bool armed: false

              onPressed: function(mouse) {
                pressX = mouse.x
                pressY = mouse.y
                armed = true
                root.select(slot.modelData.id)
              }

              onPositionChanged: function(mouse) {
                var p = mapToItem(win.contentItem, mouse.x, mouse.y)
                if (win.dragging) { win.dragMove(p.x, p.y); return }
                if (!armed) return
                // A few pixels of slop so selecting a widget by clicking it
                // does not turn into a one-pixel drag.
                if (Math.abs(mouse.x - pressX) + Math.abs(mouse.y - pressY) < 6) return
                win.startDrag(slot.modelData, pressX, pressY, p.x, p.y)
              }

              onReleased: function(mouse) {
                armed = false
                if (win.dragging) win.dragDrop()
              }

              onCanceled: { armed = false; win.dragCancel() }
            }
          }
        }

        // ------------------------------------------------------- the chrome
        //
        // Three surfaces, where there used to be one. The old panel put the
        // grid's settings, the selected card's settings, the tray and the
        // hint in a single stack at the bottom of the screen, and every one
        // of them grew: a row that started as four controls became fourteen
        // the moment a card was selected, and the whole thing was also the
        // target you dropped a widget onto to take it off the desktop.
        //
        // Split by what they are about, and stacked. The bar is about the grid
        // and never changes size. The tray is about what is off, and is the
        // one thing here you can drop onto. The inspector is about the one
        // card you have selected, and is only up while one is.

        // Is a screen point inside one of the chrome surfaces? Used to keep a
        // drag from trying to drop a card into a cell that is underneath the
        // toolbar, which would leave it somewhere the pointer cannot reach it
        // again.
        function overItem(item, px, py) {
          if (!item || !item.visible) return false
          var at = item.mapToItem(win.contentItem, 0, 0)
          return px >= at.x && px <= at.x + item.width
            && py >= at.y && py <= at.y + item.height
        }

        // The three of them are one column, bottom-centred: a Column skips a
        // child that is not there, so the bar does not move when the tray
        // empties or the inspector closes.

        Column {
          id: chrome
          anchors.horizontalCenter: parent.horizontalCenter
          anchors.bottom: parent.bottom
          anchors.bottomMargin: Style.gapsOut + Style.space(12)
          spacing: Style.space(10)

          // ------------------------------------------------------- inspector
          //
          // Over the bar and the tray and the same width as them, so the whole
          // of the editor's chrome is one column down the middle of the screen
          // and none of it is somewhere you have to go looking. It appears when
          // you click a widget and goes when you click empty grid, which is why
          // it is at the top of the stack: the two panels under it never move
          // when it comes and goes.

          Inspector {
            id: inspector
            anchors.horizontalCenter: parent.horizontalCenter
            visible: root.selected !== null
            width: toolbar.width
            service: root.service
            config: root.config
            selected: root.selected
            selectedId: root.selectedId
            layout: root.layout
            timezoneOptions: root.timezoneOptions
            windowHeight: win.height
            // Whatever is left above the two panels under it. Past that the
            // settings scroll rather than the panel growing up the screen.
            maxHeight: Math.max(Style.space(160),
              win.height - toolbar.height
                - (trayPanel.visible ? trayPanel.height + chrome.spacing : 0)
                - Style.space(72))
            foreground: root.foreground
            accent: root.accent
            urgent: root.urgent
            fontFamily: root.fontFamily
          }

          // ------------------------------------------------------------ tray
          //
          // Widgets that are off live here; drag one onto the grid to put it
          // up, and drag one back to take it down. It is its own surface rather
          // than a row inside the toolbar because it is the only part of the
          // chrome a drag may end on, and a drop target has to look like one.

          BorderSurface {
            id: trayPanel
            anchors.horizontalCenter: parent.horizontalCenter
            visible: win.tray.length > 0
            width: win.width - Style.space(40)
            height: trayRow.implicitHeight + Style.space(16)
            radius: Style.cornerRadius > 0 ? Style.cornerRadius : 0
            color: Color.popups.background
            borderSpec: Border.surfaceSpec("popups", "border", Color.popups.border,
              Math.max(1, Style.space(2)))

            // While a card is over the tray, the tray says so — in the urgent
            // colour, because what happens next is the widget leaving the
            // desktop.
            Rectangle {
              anchors.fill: parent
              anchors.margins: 2
              visible: win.overTray
              radius: parent.radius
              color: Util.alpha(root.urgent, 0.16)
              border.width: 2
              border.color: Util.alpha(root.urgent, 0.8)
            }

            MouseArea {
              anchors.fill: parent
              acceptedButtons: Qt.AllButtons
              onClicked: {}
            }

            // Wraps rather than scrolls: with every installed plugin on offer
            // the tray is dozens of chips, and a single row runs off both
            // edges of the screen with the ends out of reach.
            Flow {
              id: trayRow
              anchors.centerIn: parent
              width: parent.width - Style.space(28)
              spacing: Style.space(8)

              Text {
                height: Style.space(30)
                verticalAlignment: Text.AlignVCenter
                text: "Off"
                textFormat: Text.PlainText
                color: root.dim
                font.family: root.fontFamily
                font.pixelSize: Style.font.caption
                font.bold: true
                rightPadding: Style.space(4)
              }

              Repeater {
                model: win.tray

                delegate: BorderSurface {
                  id: chip
                  required property var modelData

                  width: chipRow.implicitWidth + Style.space(20)
                  height: Style.space(30)
                  radius: Style.cornerRadius > 0 ? Style.cornerRadius : 0
                  color: Util.alpha(root.foreground, chipDrag.containsMouse ? 0.12 : 0.05)
                  borderSpec: Border.flat(Util.alpha(root.foreground, 0.3), 1)

                  Row {
                    id: chipRow
                    anchors.centerIn: parent
                    spacing: Style.space(6)

                    Text {
                      anchors.verticalCenter: parent.verticalCenter
                      text: Model.iconFor(chip.modelData.type)
                      textFormat: Text.PlainText
                      color: root.dim
                      font.family: root.fontFamily
                      font.pixelSize: Style.font.body
                      renderType: Text.NativeRendering
                    }

                    Text {
                      anchors.verticalCenter: parent.verticalCenter
                      text: root.nameFor(chip.modelData)
                      textFormat: Text.PlainText
                      color: root.foreground
                      font.family: root.fontFamily
                      font.pixelSize: Style.font.bodySmall
                    }
                  }

                  MouseArea {
                    id: chipDrag
                    anchors.fill: parent
                    hoverEnabled: true
                    acceptedButtons: Qt.LeftButton
                    cursorShape: Qt.OpenHandCursor
                    preventStealing: true

                    property real pressX: 0
                    property real pressY: 0
                    property bool armed: false

                    onPressed: function(mouse) {
                      pressX = mouse.x
                      pressY = mouse.y
                      armed = true
                    }

                    onPositionChanged: function(mouse) {
                      var p = mapToItem(win.contentItem, mouse.x, mouse.y)
                      if (win.dragging) { win.dragMove(p.x, p.y); return }
                      if (!armed) return
                      if (Math.abs(mouse.x - pressX) + Math.abs(mouse.y - pressY) < 6) return
                      // Grabbed from the middle of the block it will become,
                      // because the chip is nothing like the size of the card.
                      var blockW = Model.blockWidth(root.layout, chip.modelData.cols)
                      var blockH = Model.blockHeight(root.layout, chip.modelData.rows)
                      win.startDrag(chip.modelData, blockW / 2, blockH / 2, p.x, p.y)
                    }

                    onReleased: {
                      armed = false
                      if (win.dragging) win.dragDrop()
                    }

                    onCanceled: { armed = false; win.dragCancel() }
                  }
                }
              }
            }
          }

          // --------------------------------------------------------- the bar
          //
          // The grid, and nothing else, in three groups picked at the start of
          // the row: where it is (side, columns, scale), how its cards look
          // (opacity, radius, padding) and how it moves. Each control has its
          // name above it rather than beside it, so the names read as one row
          // and the controls as another.

          BorderSurface {
            id: toolbar
            // Which group of settings the bar is showing.
            property string section: "grid"
            anchors.horizontalCenter: parent.horizontalCenter
            width: Math.min(win.width - Style.space(40),
              barColumn.implicitWidth + Style.space(36))
            height: barColumn.implicitHeight + Style.space(24)
            radius: Style.cornerRadius > 0 ? Style.cornerRadius : 0
            color: Color.popups.background
            borderSpec: Border.surfaceSpec("popups", "border", Color.popups.border,
              Math.max(1, Style.space(2)))

            // Swallow clicks so a press on the toolbar is not also a press on
            // the dismissal field behind it.
            MouseArea {
              anchors.fill: parent
              acceptedButtons: Qt.AllButtons
              onClicked: {}
            }

            Column {
              id: barColumn
              anchors.centerIn: parent
              spacing: Style.space(10)

              Row {
                id: barRow
                anchors.horizontalCenter: parent.horizontalCenter
                spacing: Style.space(16)

                // Three groups, one showing at a time, so the bar stays one
                // short row however many knobs the grid grows: where the grid
                // is, what its cards look like, and how it moves.
                ButtonGroup {
                  anchors.bottom: parent.bottom
                  options: [{ value: "grid", label: "Grid" }, { value: "look", label: "Look" }, { value: "motion", label: "Motion" }]
                  value: toolbar.section
                  foreground: root.foreground
                  accent: root.accent
                  fontFamily: root.fontFamily
                  focusable: false
                  onChanged: function(v) { toolbar.section = v }
                }

                PanelSeparator {
                  anchors.bottom: parent.bottom
                  anchors.bottomMargin: Style.space(4)
                  width: 1
                  height: Style.space(24)
                  foreground: root.foreground
                  strength: 0.25
                }

                Field {
                  anchors.bottom: parent.bottom
                  visible: toolbar.section === "grid"
                  label: "Side"
                  foreground: root.foreground
                  fontFamily: root.fontFamily

                  ButtonGroup {
                    options: [{ value: "left", label: "Left" }, { value: "right", label: "Right" }]
                    value: root.layout.side
                    foreground: root.foreground
                    accent: root.accent
                    fontFamily: root.fontFamily
                    focusable: false
                    onChanged: function(v) { if (root.service) root.service.setSide(v) }
                  }
                }

                // Only the counts that actually fit this screen are offered. A
                // grid wider than the display would put widgets somewhere you
                // cannot look at them, and the count is measured against this
                // window, which is already the usable area minus the bar.
                Field {
                  anchors.bottom: parent.bottom
                  visible: toolbar.section === "grid"
                  label: "Columns"
                  foreground: root.foreground
                  fontFamily: root.fontFamily

                  ButtonGroup {
                    options: {
                      var counts = Model.columnOptions(root.layout, win.width)
                      var out = []
                      for (var i = 0; i < counts.length; i++)
                        out.push({ value: String(counts[i]), label: String(counts[i]) })
                      return out
                    }
                    value: String(root.layout.columns)
                    foreground: root.foreground
                    accent: root.accent
                    fontFamily: root.fontFamily
                    focusable: false
                    onChanged: function(v) { if (root.service) root.service.setColumns(Number(v)) }
                  }
                }

                // One field, in percent, set at 100: any whole number from 25
                // to 200, typecast by the spinbox and written back as the
                // factor. The floor is Model.MIN_SCALE, because a grid scaled
                // to nothing cannot be clicked back.
                Field {
                  anchors.bottom: parent.bottom
                  visible: toolbar.section === "grid"
                  label: "Scale"
                  foreground: root.foreground
                  fontFamily: root.fontFamily

                  NumberField {
                    label: ""
                    value: Math.round(root.layout.scale * 100)
                    from: Math.round(Model.MIN_SCALE * 100)
                    to: Math.round(Model.MAX_SCALE * 100)
                    stepSize: 10
                    fieldWidth: Style.space(76)
                    foreground: root.foreground
                    accent: root.accent
                    fontFamily: root.fontFamily
                    onModified: function(v) { if (root.service) root.service.setScale(Number(v) / 100) }
                  }
                }

                // The whole grid's opacity, in percent. Moving it writes over
                // any card's own opacity, so the whole grid matches again.
                Field {
                  anchors.bottom: parent.bottom
                  visible: toolbar.section === "look"
                  label: "Opacity"
                  foreground: root.foreground
                  fontFamily: root.fontFamily

                  NumberField {
                    label: ""
                    value: Math.round(root.layout.opacity * 100)
                    from: 0
                    to: 100
                    stepSize: 5
                    fieldWidth: Style.space(76)
                    foreground: root.foreground
                    accent: root.accent
                    fontFamily: root.fontFamily
                    onModified: function(v) { if (root.service) root.service.setLayoutOpacity(Number(v) / 100) }
                  }
                }

                // The whole grid's corner rounding, in pixels. Moving it writes
                // over any card's own radius, so the whole grid rounds again.
                Field {
                  anchors.bottom: parent.bottom
                  visible: toolbar.section === "look"
                  label: "Radius"
                  foreground: root.foreground
                  fontFamily: root.fontFamily

                  NumberField {
                    label: ""
                    value: Math.round(root.layout.radius)
                    from: Math.round(Model.MIN_RADIUS)
                    to: Math.round(Model.MAX_RADIUS)
                    stepSize: 2
                    fieldWidth: Style.space(76)
                    foreground: root.foreground
                    accent: root.accent
                    fontFamily: root.fontFamily
                    onModified: function(v) { if (root.service) root.service.setLayoutRadius(Number(v)) }
                  }
                }

                // Space around an embedded plugin panel inside its card: the
                // theme's popup padding, or one field a side in CSS order.
                Field {
                  anchors.bottom: parent.bottom
                  visible: toolbar.section === "look"
                  label: "Padding"
                  foreground: root.foreground
                  fontFamily: root.fontFamily

                  Row {
                    spacing: Style.space(4)

                    ButtonGroup {
                      options: [{ value: "theme", label: "Theme" }, { value: "custom", label: "Custom" }]
                      value: root.layout.paddingTheme === true ? "theme" : "custom"
                      foreground: root.foreground
                      accent: root.accent
                      fontFamily: root.fontFamily
                      focusable: false
                      onChanged: function(v) {
                        if (root.service) root.service.setPaddingTheme(v === "theme")
                      }
                    }

                    // The four sides are only asked for when they are used.
                    Repeater {
                      model: root.layout.paddingTheme === true ? [] : Model.PADDING_SIDES
                      delegate: NumberField {
                        required property string modelData
                        label: ""
                        value: Math.round(root.layout.padding[modelData])
                        from: 0
                        to: Math.round(Model.MAX_PADDING)
                        stepSize: 2
                        fieldWidth: Style.space(60)
                        foreground: root.foreground
                        accent: root.accent
                        fontFamily: root.fontFamily
                        onModified: function(v) { if (root.service) root.service.setPadding(modelData, Number(v)) }
                      }
                    }
                  }
                }

                // Whether the grid leaves the screen while a window is in
                // front of it. Named for what you see rather than for what it
                // does: "hide when a window is open" is a description of the
                // mechanism, and "Windows" beside On and Off is a description
                // of nothing, so the label says what the grid does.
                Field {
                  anchors.bottom: parent.bottom
                  visible: toolbar.section === "motion"
                  label: "Hide behind windows"
                  foreground: root.foreground
                  fontFamily: root.fontFamily

                  ButtonGroup {
                    options: [{ value: "off", label: "Off" }, { value: "on", label: "On" }]
                    value: root.layout.hideWhenWindows === false ? "off" : "on"
                    foreground: root.foreground
                    accent: root.accent
                    fontFamily: root.fontFamily
                    focusable: false
                    onChanged: function(v) {
                      if (root.service) root.service.setHideWhenWindows(v === "on")
                    }
                  }
                }

                Field {
                  anchors.bottom: parent.bottom
                  visible: toolbar.section === "motion"
                  label: "Animation"
                  foreground: root.foreground
                  fontFamily: root.fontFamily

                  ButtonGroup {
                    options: [{ value: "none", label: "Off" }, { value: "fade", label: "Fade" }, { value: "slide", label: "Slide" }, { value: "scale", label: "Scale" }]
                    value: root.layout.animStyle
                    foreground: root.foreground
                    accent: root.accent
                    fontFamily: root.fontFamily
                    focusable: false
                    onChanged: function(v) {
                      if (root.service) root.service.setAnimStyle(v)
                    }
                  }
                }

                Field {
                  anchors.bottom: parent.bottom
                  visible: toolbar.section === "motion"
                  label: "Speed"
                  foreground: root.foreground
                  fontFamily: root.fontFamily

                  ButtonGroup {
                    options: [{ value: "120", label: "Fast" }, { value: "220", label: "Normal" }, { value: "400", label: "Slow" }]
                    value: String(root.layout.animDuration)
                    foreground: root.foreground
                    accent: root.accent
                    fontFamily: root.fontFamily
                    focusable: false
                    onChanged: function(v) {
                      if (root.service) root.service.setAnimDuration(Number(v))
                    }
                  }
                }

                PanelSeparator {
                  anchors.bottom: parent.bottom
                  anchors.bottomMargin: Style.space(4)
                  width: 1
                  height: Style.space(24)
                  foreground: root.foreground
                  strength: 0.25
                }

                // A small escape hatch from both the knobs above: scale and
                // opacity (grid-wide and every card's) go back to their
                // defaults.
                Button {
                  anchors.bottom: parent.bottom
                  text: "Reset"
                  tooltipText: "Restore the default scale, opacity and corner radius"
                  bordered: true
                  foreground: root.foreground
                  accent: root.accent
                  fontFamily: root.fontFamily
                  fontSize: Style.font.bodySmall
                  horizontalPadding: Style.space(12)
                  verticalPadding: Style.space(7)
                  onClicked: if (root.service) root.service.resetAppearance()
                }

                Button {
                  anchors.bottom: parent.bottom
                  text: "Done"
                  tooltipText: "Leave the editor. Nothing here needs saving."
                  bordered: true
                  selected: true
                  foreground: root.foreground
                  accent: root.accent
                  fontFamily: root.fontFamily
                  fontSize: Style.font.bodySmall
                  horizontalPadding: Style.space(12)
                  verticalPadding: Style.space(7)
                  onClicked: root.close()
                }
              }

              Text {
                anchors.horizontalCenter: parent.horizontalCenter
                width: Math.min(implicitWidth, toolbar.width - Style.space(24))
                horizontalAlignment: Text.AlignHCenter
                wrapMode: Text.Wrap
                textFormat: Text.PlainText
                // The tray is only mentioned while there is one. With every
                // widget on the desktop there is nothing above the bar, and a
                // line naming a panel that is not there is a line that has to
                // be ignored rather than read.
                text: root.selected !== null
                  ? "Drag it anywhere — either side of the screen, or onto another widget to swap."
                    + (trayPanel.visible ? " Onto the tray takes it off." : "")
                  : "Drag a widget to either side of the screen. Click one to open its settings."
                color: root.dim
                font.family: root.fontFamily
                font.pixelSize: Style.font.caption
              }
            }
          }
        }

        // ---------------------------------------------------------- ghost
        //
        // The card in hand. Drawn last so it is over everything, and made of
        // the same component as the real thing so what follows the pointer is
        // what will be left behind.

        Item {
          visible: win.dragging
          x: win.ghostX
          y: win.ghostY
          width: Model.blockWidth(root.layout, win.dragCols)
          height: Model.blockHeight(root.layout, win.dragRows)
          opacity: 0.85
          scale: 1.03

          WidgetInstance {
            anchors.fill: parent
            service: root.service
            shell: root.shell
            instance: win.dragging && root.config ? Model.findInstance(root.config, win.dragId) : null
            widgetSource: {
              var inst = win.dragging && root.config ? Model.findInstance(root.config, win.dragId) : null
              return inst ? root.sourceFor(inst.type) : ""
            }
            isPlugin: {
              var inst2 = win.dragging && root.config ? Model.findInstance(root.config, win.dragId) : null
              return inst2 ? Model.isPluginType(inst2.type) : false
            }
          }
        }
      }
    }
  }
}
