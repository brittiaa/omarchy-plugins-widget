import QtQuick
import qs.Commons
import qs.Ui
import "../Model.js" as Model

// Everything that is true of one widget, in one panel.
//
// It used to be a second row on the toolbar: the card's name, then its size,
// then Duplicate and Remove, then whatever its schema asked for, all reading
// left to right across the bottom of the screen. That row grew with every
// setting any widget declared, and it left the bar a different size depending
// on what you had clicked.
//
// Here instead it is its own panel, stacked over the bar and the tray and the
// same width as them, so the editor's chrome is one column down the middle of
// the screen rather than pieces of interface in three places. It is only up
// while something is selected — a click on empty grid puts it away — so the
// editor is quiet by default and detailed on demand.
//
// The settings flow across that width rather than down it. A panel as wide as
// the toolbar with one field per line would be a column of controls in a field
// of nothing; laid out in a flow, four of them fit a line and the panel is as
// tall as the widget actually needs.
BorderSurface {
  id: root

  property var service: null
  property var config: null
  property var selected: null
  property string selectedId: ""
  property var layout: null
  property var timezoneOptions: []
  property real windowHeight: 0
  // The most this may grow to before its content starts scrolling.
  property real maxHeight: 400

  property color foreground: Color.popups.text
  property color accent: Color.accent
  property color urgent: Color.urgent
  property string fontFamily: Style.font.family

  readonly property color dim: Qt.darker(foreground, 1.5)
  readonly property string type: selected ? String(selected.type) : ""
  readonly property bool isPlugin: selected !== null && Model.isPluginType(type)

  // One column of the flow. Wide enough for a path and narrow enough that a
  // toolbar-width panel holds four of them.
  readonly property real fieldWidth: Style.space(210)
  readonly property real contentWidth: Math.max(fieldWidth,
    width - Style.spacing.panelPadding * 2)

  readonly property var sizeOptions: {
    if (!root.selected || !root.layout) return []
    var sizes = Model.sizesWithin(root.type, root.layout.columns)
    var out = []
    for (var i = 0; i < sizes.length; i++) {
      out.push({
        value: sizes[i][0] + "x" + sizes[i][1],
        label: Model.sizeLabel(sizes[i][0], sizes[i][1])
      })
    }
    return out
  }

  function commit(key, value) {
    if (service && selectedId) service.setSetting(selectedId, key, value)
  }

  height: Math.min(root.maxHeight, column.implicitHeight + Style.spacing.panelPadding * 2)
  radius: Style.cornerRadius > 0 ? Style.cornerRadius : 0
  color: Color.popups.background
  borderSpec: Border.surfaceSpec("popups", "border", Color.popups.border, Math.max(1, Style.space(2)))

  // Swallow clicks, so working the controls is not also clicking the grid
  // behind them.
  MouseArea {
    anchors.fill: parent
    acceptedButtons: Qt.AllButtons
    onClicked: {}
    onWheel: function(wheel) { wheel.accepted = true }
  }

  Flickable {
    anchors.fill: parent
    anchors.margins: Style.spacing.panelPadding
    contentHeight: column.implicitHeight
    clip: true
    boundsBehavior: Flickable.StopAtBounds
    interactive: contentHeight > height

    Column {
      id: column
      width: parent.width
      spacing: Style.spacing.xxl

      // -------------------------------------------------- name, and the two
      //
      // Duplicate and Remove sit up here with the name rather than under the
      // settings: they are about the widget itself, not about anything it can
      // be told, and a Remove at the bottom of a list of fields is a Remove
      // you meet by scrolling past everything else.

      Item {
        width: parent.width
        implicitHeight: Math.max(title.implicitHeight, actions.implicitHeight)

        Row {
          id: title
          anchors.left: parent.left
          anchors.right: actions.left
          anchors.rightMargin: Style.spacing.xxl
          anchors.verticalCenter: parent.verticalCenter
          spacing: Style.spacing.lg

          Text {
            anchors.verticalCenter: parent.verticalCenter
            text: Model.iconFor(root.type)
            textFormat: Text.PlainText
            color: root.accent
            font.family: root.fontFamily
            font.pixelSize: Style.font.iconLarge
            renderType: Text.NativeRendering
          }

          Column {
            anchors.verticalCenter: parent.verticalCenter
            width: parent.width - parent.spacing - Style.font.iconLarge
            spacing: Style.spacing.xxs

            Text {
              width: parent.width
              elide: Text.ElideRight
              textFormat: Text.PlainText
              text: Model.displayName(root.config, root.selected)
              color: root.foreground
              font.family: root.fontFamily
              font.pixelSize: Style.font.title
              font.bold: true
            }

            // The id, which is the name the command line and the config file
            // know this card by. Worth having somewhere, and this is the one
            // place there is room for it.
            Text {
              width: parent.width
              elide: Text.ElideRight
              textFormat: Text.PlainText
              text: root.selectedId
              color: root.dim
              font.family: root.fontFamily
              font.pixelSize: Style.font.caption
            }
          }
        }

        Row {
          id: actions
          anchors.right: parent.right
          anchors.verticalCenter: parent.verticalCenter
          spacing: Style.spacing.md

          // Only for a type that says a second one means something — a
          // duplicate weather card would be the same reading twice.
          Button {
            visible: Model.allowsMultiple(root.type)
            text: "Duplicate"
            tooltipText: "Add another, with these settings"
            bordered: true
            foreground: root.foreground
            accent: root.accent
            fontFamily: root.fontFamily
            fontSize: Style.font.bodySmall
            onClicked: if (root.service) root.service.duplicateWidget(root.selectedId)
          }

          // ...and away again. Only ever offered for a spare: the last of a
          // type is switched off rather than deleted, because deleting it
          // would only mean the next config read put a fresh one back.
          Button {
            visible: root.config !== null && Model.canRemove(root.config, root.selectedId)
            text: "Remove"
            tooltipText: "Delete this widget and its settings"
            bordered: true
            foreground: root.urgent
            accent: root.urgent
            fontFamily: root.fontFamily
            fontSize: Style.font.bodySmall
            onClicked: if (root.service) root.service.removeWidget(root.selectedId)
          }
        }
      }

      PanelSeparator { width: parent.width; foreground: root.foreground }

      // ------------------------------------------------------- the settings
      //
      // Size and opacity lead, because they are true of every card and the
      // schema behind them is true of one type. Size is a list rather than a
      // button that cycles: the photo card offers seven footprints, and
      // pressing through six of them to reach the last is not a choice, it is
      // a wait.

      Flow {
        width: parent.width
        spacing: Style.spacing.huge

        Field {
          label: "Size"
          visible: root.sizeOptions.length > 1
          width: root.fieldWidth
          foreground: root.foreground
          fontFamily: root.fontFamily

          PickerField {
            width: root.fieldWidth
            height: Style.spacing.controlHeight
            windowHeight: root.windowHeight
            options: root.sizeOptions
            value: root.selected ? (root.selected.cols + "x" + root.selected.rows) : ""
            foreground: root.foreground
            accent: root.accent
            fontFamily: root.fontFamily
            onChanged: function(v) {
              var parts = String(v).split("x")
              if (root.service && root.selectedId && parts.length === 2)
                root.service.resizeWidget(root.selectedId, Number(parts[0]), Number(parts[1]))
            }
          }
        }

        Field {
          label: "Opacity"
          width: root.fieldWidth
          foreground: root.foreground
          fontFamily: root.fontFamily

          Row {
            spacing: Style.spacing.md

            // Reads the card's own value when it has one, the grid's
            // otherwise; editing always sets the card's own.
            NumberField {
              anchors.verticalCenter: parent.verticalCenter
              label: ""
              value: root.selected ? Math.round(Model.effectiveOpacity(root.config, root.selected) * 100) : 100
              from: 0
              to: 100
              stepSize: 5
              fieldWidth: Style.space(84)
              foreground: root.foreground
              accent: root.accent
              fontFamily: root.fontFamily
              onModified: function(v) {
                if (root.service && root.selectedId) root.service.setOpacity(root.selectedId, Number(v) / 100)
              }
            }

            Button {
              anchors.verticalCenter: parent.verticalCenter
              visible: root.selected !== null && root.selected.opacity !== null
              text: "↺"
              tooltipText: "Follow the grid's opacity instead of this one"
              bordered: true
              foreground: root.foreground
              accent: root.accent
              fontFamily: root.fontFamily
              fontSize: Style.font.bodySmall
              onClicked: if (root.service && root.selectedId) root.service.clearOpacity(root.selectedId)
            }
          }
        }

        // How a plugin's panel sits in its card. Only a plugin has one: a
        // built-in widget is drawn for a card and lays itself out.
        Field {
          label: "Padding"
          visible: root.isPlugin
          width: root.fieldWidth * 2
          foreground: root.foreground
          fontFamily: root.fontFamily

          Row {
            spacing: Style.spacing.md

            ButtonGroup {
              anchors.verticalCenter: parent.verticalCenter
              options: [{ value: "grid", label: "Grid" }, { value: "own", label: "Own" }]
              value: root.selected && root.selected.padding ? "own" : "grid"
              foreground: root.foreground
              accent: root.accent
              fontFamily: root.fontFamily
              focusable: false
              onChanged: function(v) {
                if (!root.service || !root.selectedId) return
                if (v === "grid") root.service.clearCardPadding(root.selectedId)
                // Any side will do to start owning one: it copies the grid's
                // four values, then sets this one to what it already was.
                else root.service.setCardPadding(root.selectedId, "top",
                  Model.effectivePadding(root.config, root.selected).top)
              }
            }

            Repeater {
              model: root.selected && root.selected.padding ? Model.PADDING_SIDES : []
              delegate: NumberField {
                required property string modelData
                anchors.verticalCenter: parent.verticalCenter
                label: ""
                value: root.selected && root.selected.padding ? Math.round(root.selected.padding[modelData]) : 0
                from: 0
                to: Math.round(Model.MAX_PADDING)
                stepSize: 2
                fieldWidth: Style.space(60)
                foreground: root.foreground
                accent: root.accent
                fontFamily: root.fontFamily
                onModified: function(v) {
                  if (root.service && root.selectedId) root.service.setCardPadding(root.selectedId, modelData, Number(v))
                }
              }
            }
          }
        }

        // How big the panel is drawn, in percent of its own size. Capped by
        // the card's width: a panel already as wide as the card grows no more.
        Field {
          label: "Content size (%)"
          visible: root.isPlugin
          width: root.fieldWidth
          foreground: root.foreground
          fontFamily: root.fontFamily

          NumberField {
            label: ""
            value: root.selected ? Math.round(root.selected.contentScale * 100) : 100
            from: Math.round(Model.MIN_CONTENT_SCALE * 100)
            to: Math.round(Model.MAX_CONTENT_SCALE * 100)
            stepSize: 10
            fieldWidth: Style.space(84)
            foreground: root.foreground
            accent: root.accent
            fontFamily: root.fontFamily
            onModified: function(v) {
              if (root.service && root.selectedId) root.service.setContentScale(root.selectedId, Number(v) / 100)
            }
          }
        }

        // How tall the card may grow with its content, in rows. 0 is no limit;
        // past the limit the panel shrinks to fit instead.
        Field {
          label: "Max height (rows, 0 = none)"
          visible: root.isPlugin
          width: root.fieldWidth
          foreground: root.foreground
          fontFamily: root.fontFamily

          NumberField {
            label: ""
            value: root.selected ? root.selected.maxRows : 0
            from: 0
            to: Model.MAX_ROWS
            stepSize: 1
            fieldWidth: Style.space(84)
            foreground: root.foreground
            accent: root.accent
            fontFamily: root.fontFamily
            onModified: function(v) {
              if (root.service && root.selectedId) root.service.setMaxRows(root.selectedId, Number(v))
            }
          }
        }

        // Where the panel sits when the card's cells are taller than it.
        Field {
          label: "Align"
          visible: root.isPlugin
          width: root.fieldWidth
          foreground: root.foreground
          fontFamily: root.fontFamily

          ButtonGroup {
            options: [{ value: "top", label: "Top" }, { value: "center", label: "Center" }, { value: "bottom", label: "Bottom" }]
            value: root.selected ? root.selected.align : "top"
            foreground: root.foreground
            accent: root.accent
            fontFamily: root.fontFamily
            focusable: false
            onChanged: function(v) {
              if (root.service && root.selectedId) root.service.setAlign(root.selectedId, v)
            }
          }
        }

        Repeater {
          model: root.selected ? Model.settingsSchema(root.type) : []

          delegate: SettingField {
            required property var modelData
            width: root.fieldWidth
            spec: modelData
            value: root.selected && root.selected.settings
              ? root.selected.settings[modelData.key] : undefined
            foreground: root.foreground
            accent: root.accent
            fontFamily: root.fontFamily
            windowHeight: root.windowHeight
            timezoneOptions: root.timezoneOptions
            onCommitted: function(v) { root.commit(modelData.key, v) }
            onChooseRequested: function(pathKind) {
              if (!root.service || !root.selectedId) return
              root.service.choosePath(root.selectedId, modelData.key, pathKind,
                "Choose " + String(modelData.label).toLowerCase()
                  + " for " + Model.displayName(root.config, root.selected),
                modelData.extensions || "")
            }
          }
        }

        // Where this card came from, for the ones that came from somewhere.
        //
        // A built-in says nothing here: the answer would be "this plugin",
        // which the user is already looking at. A discovered plugin names
        // itself, because the settings above are its author's and the place to
        // take a complaint about them is the plugin, not this repo -- and
        // because the id is what `omarchy plugin` wants to be told.
        Text {
          readonly property var entry: root.selected ? Model.catalogEntry(root.type) : null

          visible: entry && entry._isPlugin === true
          width: root.fieldWidth
          wrapMode: Text.Wrap
          textFormat: Text.PlainText
          text: {
            if (!entry || entry._isPlugin !== true) return ""
            var line = String(entry._pluginId || "")
            if (entry._pluginVersion) line += "  " + String(entry._pluginVersion)
            if (entry._pluginAuthor) line += "\nby " + String(entry._pluginAuthor)
            return line
          }
          color: Qt.darker(root.foreground, 1.7)
          font.family: root.fontFamily
          font.pixelSize: Style.font.caption
        }
      }
    }
  }
}
