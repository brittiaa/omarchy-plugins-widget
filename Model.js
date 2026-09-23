.pragma library

// Pure logic for the Widgets plugin, behind one door. The implementation lives
// in model/, one file per concern; this file re-exports all of it so a QML
// file has a single import and a single name (`Model`). No Qt and no
// Quickshell anywhere in model/, which is what lets tests/ run it under node.
//
// `.pragma library` is what makes the catalogue work. Without it every QML
// file that imports this gets its own copy of the module scope, so the plugin
// entries the service discovers at runtime would be visible only to the file
// that set them. With it there is one instance per QML engine and one
// catalogue for everyone. The model/ files are libraries too, and share that
// instance.
//
// Names that start with an underscore are module-private and not re-exported.
// `.pragma` and `.import` are not JavaScript, so tests/ evaluates these files
// through its own tiny module loader; see the top of tests/model.test.js.

.import "model/Util.js" as Util
.import "model/Catalogue.js" as Catalogue
.import "model/Layout.js" as Layout
.import "model/Mutations.js" as Mutations
.import "model/Config.js" as Config
.import "model/Packing.js" as Packing
.import "model/Github.js" as Github
.import "model/Music.js" as Music
.import "model/Weather.js" as Weather
.import "model/Clock.js" as Clock
.import "model/Calendar.js" as Calendar
.import "model/Ics.js" as Ics
.import "model/Todos.js" as Todos
.import "model/Photos.js" as Photos
.import "model/Omate.js" as Omate
.import "model/Crypto.js" as Crypto

// Util
var SCHEMA_VERSION = Util.SCHEMA_VERSION
var MAX_WIDGETS = Util.MAX_WIDGETS
var MAX_STRING = Util.MAX_STRING
var MAX_PATH = Util.MAX_PATH
var MAX_COLUMNS = Util.MAX_COLUMNS
var MAX_ROWS = Util.MAX_ROWS
var MAX_MARGIN = Util.MAX_MARGIN
var MIN_SCALE = Util.MIN_SCALE
var MAX_SCALE = Util.MAX_SCALE
var DEFAULT_OPACITY = Util.DEFAULT_OPACITY
var MIN_RADIUS = Util.MIN_RADIUS
var MAX_RADIUS = Util.MAX_RADIUS
var MAX_PADDING = Util.MAX_PADDING
var PADDING_SIDES = Util.PADDING_SIDES
var ALIGNS = Util.ALIGNS
var MIN_CONTENT_SCALE = Util.MIN_CONTENT_SCALE
var MAX_CONTENT_SCALE = Util.MAX_CONTENT_SCALE
var DEFAULT_RADIUS = Util.DEFAULT_RADIUS
var SIDES = Util.SIDES
var ANIM_STYLES = Util.ANIM_STYLES
var isPlainObject = Util.isPlainObject
var clampString = Util.clampString
var clampPath = Util.clampPath
var clampNumber = Util.clampNumber
var DAY_MS = Util.DAY_MS
var DAY_MS = Util.DAY_MS
var padTwo = Util.padTwo
var numberOrNaN = Util.numberOrNaN

// Catalogue
var setCatalogExtension = Catalogue.setCatalogExtension
var isPluginType = Catalogue.isPluginType
var catalog = Catalogue.catalog
var bridgePluginSetting = Catalogue.bridgePluginSetting
var pluginSettingsFromDefaults = Catalogue.pluginSettingsFromDefaults
var buildPluginCatalogEntry = Catalogue.buildPluginCatalogEntry
var settingsSchema = Catalogue.settingsSchema
var settingSpec = Catalogue.settingSpec
var defaultsFor = Catalogue.defaultsFor
var zoneLabel = Catalogue.zoneLabel
var catalogEntry = Catalogue.catalogEntry
var catalogTypes = Catalogue.catalogTypes
var sizesFor = Catalogue.sizesFor
var defaultSize = Catalogue.defaultSize
var isAllowedSize = Catalogue.isAllowedSize
var iconFor = Catalogue.iconFor
var sizeLabel = Catalogue.sizeLabel
var sizesWithin = Catalogue.sizesWithin
var fitSize = Catalogue.fitSize
var nextSize = Catalogue.nextSize

// Layout
var DEFAULT_LAYOUT = Layout.DEFAULT_LAYOUT
var normalizeLayout = Layout.normalizeLayout
var scaledCell = Layout.scaledCell
var scaledGap = Layout.scaledGap
var blockRunAt = Layout.blockRunAt
var blockWidth = Layout.blockWidth
var blockHeight = Layout.blockHeight
var gridWidth = Layout.gridWidth
var gridOriginX = Layout.gridOriginX
var maxColumnsFor = Layout.maxColumnsFor
var columnOptions = Layout.columnOptions
var cellRect = Layout.cellRect
var widgetRect = Layout.widgetRect
var flowRects = Layout.flowRects
var cellFromPoint = Layout.cellFromPoint
var instanceLabel = Layout.instanceLabel
var displayName = Layout.displayName
var sideOf = Layout.sideOf
var rowsThatFit = Layout.rowsThatFit

// Mutations
var dropTarget = Mutations.dropTarget
var allowsMultiple = Mutations.allowsMultiple
var countOfType = Mutations.countOfType
var nextInstanceId = Mutations.nextInstanceId
var landingCell = Mutations.landingCell
var addWidget = Mutations.addWidget
var duplicateWidget = Mutations.duplicateWidget
var canRemove = Mutations.canRemove
var removeWidget = Mutations.removeWidget
var ensureCatalogCoverage = Mutations.ensureCatalogCoverage
var setEnabled = Mutations.setEnabled
var toggleEnabled = Mutations.toggleEnabled
var placeDisplacing = Mutations.placeDisplacing
var moveWidget = Mutations.moveWidget
var placeWidget = Mutations.placeWidget
var setSetting = Mutations.setSetting
var resizeWidget = Mutations.resizeWidget
var cycleSize = Mutations.cycleSize
var setSide = Mutations.setSide
var setWidgetSide = Mutations.setWidgetSide
var sidesInUse = Mutations.sidesInUse
var setColumns = Mutations.setColumns
var setScale = Mutations.setScale
var setHideWhenWindows = Mutations.setHideWhenWindows
var setAnimStyle = Mutations.setAnimStyle
var setAnimDuration = Mutations.setAnimDuration
var setPadding = Mutations.setPadding
var setPaddingTheme = Mutations.setPaddingTheme
var setCardPadding = Mutations.setCardPadding
var clearCardPadding = Mutations.clearCardPadding
var setMaxRows = Mutations.setMaxRows
var setAlign = Mutations.setAlign
var setContentScale = Mutations.setContentScale
var effectivePadding = Mutations.effectivePadding
var normalizePadding = Layout.normalizePadding
var setLayoutOpacity = Mutations.setLayoutOpacity
var dropOpacityOverrides = Mutations.dropOpacityOverrides
var setLayoutRadius = Mutations.setLayoutRadius
var dropRadiusOverrides = Mutations.dropRadiusOverrides
var resetAppearance = Mutations.resetAppearance
var setOpacity = Mutations.setOpacity
var clearOpacity = Mutations.clearOpacity
var effectiveOpacity = Mutations.effectiveOpacity
var effectiveRadius = Mutations.effectiveRadius
var widgetsForScreen = Mutations.widgetsForScreen
var isInteractiveType = Mutations.isInteractiveType
var interactiveWidgetsForScreen = Mutations.interactiveWidgetsForScreen
var offWidgets = Mutations.offWidgets

// Config
var defaultInstance = Config.defaultInstance
var defaultConfig = Config.defaultConfig
var normalizeSettings = Config.normalizeSettings
var coerceSetting = Config.coerceSetting
var normalizeInstance = Config.normalizeInstance
var isLegacyInstance = Config.isLegacyInstance
var normalizeConfig = Config.normalizeConfig

// Packing
var rectsOverlap = Packing.rectsOverlap
var occupants = Packing.occupants
var fitsAmong = Packing.fitsAmong
var firstFreeCellAmong = Packing.firstFreeCellAmong
var canPlace = Packing.canPlace
var firstFreeCellFrom = Packing.firstFreeCellFrom
var firstFreeCell = Packing.firstFreeCell
var relocate = Packing.relocate
var resolveOverlaps = Packing.resolveOverlaps
var usedRows = Packing.usedRows
var findInstance = Packing.findInstance

// Github
var isSafeRepo = Github.isSafeRepo
var reposInUse = Github.reposInUse
var parseRepo = Github.parseRepo
var parsePullCount = Github.parsePullCount
var repoStats = Github.repoStats
var repoUrl = Github.repoUrl
var compactCount = Github.compactCount
var sinceLabel = Github.sinceLabel
var isSafeLogin = Github.isSafeLogin
var loginsInUse = Github.loginsInUse
var MAX_CONTRIBUTION_BYTES = Github.MAX_CONTRIBUTION_BYTES
var parseContributions = Github.parseContributions
var dayOfWeekUTC = Github.dayOfWeekUTC
var dateMs = Github.dateMs
var contributionGrid = Github.contributionGrid
var weeksThatFit = Github.weeksThatFit
var weeksLabel = Github.weeksLabel

// Music
var trackTime = Music.trackTime
var trackFraction = Music.trackFraction
var isProxyPlayer = Music.isProxyPlayer
var hasTrackMetadata = Music.hasTrackMetadata
var playerCanControl = Music.playerCanControl
var hasAnyMetadata = Music.hasAnyMetadata
var playerScore = Music.playerScore
var pickPlayerIndex = Music.pickPlayerIndex
var hasPlayable = Music.hasPlayable
var playerTransport = Music.playerTransport

// Weather
var WEATHER_ICONS = Weather.WEATHER_ICONS
var WEATHER_ICON_FALLBACK = Weather.WEATHER_ICON_FALLBACK
var weatherIcon = Weather.weatherIcon
var parseClockTime = Weather.parseClockTime
var isNight = Weather.isNight
var firstValue = Weather.firstValue
var roundedTemp = Weather.roundedTemp
var parseWeather = Weather.parseWeather
var isFahrenheit = Weather.isFahrenheit
var tempLabel = Weather.tempLabel
var rangeLabel = Weather.rangeLabel

// Clock
var isSafeZone = Clock.isSafeZone
var zonesInUse = Clock.zonesInUse
var parseOffsetToken = Clock.parseOffsetToken
var parseZoneOffsets = Clock.parseZoneOffsets
var zoneShiftMinutes = Clock.zoneShiftMinutes
var offsetLabel = Clock.offsetLabel
var clockLabel = Clock.clockLabel

// Calendar
var CALENDAR_HOST = Calendar.CALENDAR_HOST
var isSafeIcsUrl = Calendar.isSafeIcsUrl
var calendarsInUse = Calendar.calendarsInUse
var upcomingEvents = Calendar.upcomingEvents
var todayEvents = Calendar.todayEvents
var nextDayEvent = Calendar.nextDayEvent
var eventTimeLabel = Calendar.eventTimeLabel
var untilLabel = Calendar.untilLabel
var eventUntilLabel = Calendar.eventUntilLabel
var startOfDay = Calendar.startOfDay
var daysApart = Calendar.daysApart
var ICS_DAY_NAMES = Calendar.ICS_DAY_NAMES
var ICS_MONTH_NAMES = Calendar.ICS_MONTH_NAMES
var dayHeading = Calendar.dayHeading
var todayHeading = Calendar.todayHeading
var groupEventsByDay = Calendar.groupEventsByDay

// Ics
var unfoldIcs = Ics.unfoldIcs
var parseIcsLine = Ics.parseIcsLine
var unescapeIcsText = Ics.unescapeIcsText
var parseUtcOffset = Ics.parseUtcOffset
var icsWallOf = Ics.icsWallOf
var wallToEpoch = Ics.wallToEpoch
var parseIcsDuration = Ics.parseIcsDuration
var ICS_WEEKDAYS = Ics.ICS_WEEKDAYS
var nthWeekdayOfMonth = Ics.nthWeekdayOfMonth
var parseRrule = Ics.parseRrule
var daysInIcsMonth = Ics.daysInIcsMonth
var expandWalls = Ics.expandWalls
var monthDaysFor = Ics.monthDaysFor
var parseIcsTimezones = Ics.parseIcsTimezones
var icsTransitionWall = Ics.icsTransitionWall
var tzOffsetAt = Ics.tzOffsetAt
var collectVevents = Ics.collectVevents
var icsEventDuration = Ics.icsEventDuration
var icsExceptions = Ics.icsExceptions
var parseCalendar = Ics.parseCalendar

// Todos
var TODO_MAX_ITEMS = Todos.TODO_MAX_ITEMS
var DEFAULT_TODO_FILE = Todos.DEFAULT_TODO_FILE
var todoPath = Todos.todoPath
var todoPathsInUse = Todos.todoPathsInUse
var parseTodos = Todos.parseTodos
var parseTodoLine = Todos.parseTodoLine
var setTodoDone = Todos.setTodoDone
var rewriteTodoMark = Todos.rewriteTodoMark
var visibleTodos = Todos.visibleTodos
var todoProgress = Todos.todoProgress
var todoTitle = Todos.todoTitle

// Photos
var PHOTO_EXTENSIONS = Photos.PHOTO_EXTENSIONS
var MAX_PHOTOS = Photos.MAX_PHOTOS
var photoPath = Photos.photoPath
var pathExtension = Photos.pathExtension
var isPhotoFile = Photos.isPhotoFile
var photoTarget = Photos.photoTarget
var photoFoldersInUse = Photos.photoFoldersInUse
var parsePhotoList = Photos.parsePhotoList
var nextPhotoIndex = Photos.nextPhotoIndex
var photoIntervalMs = Photos.photoIntervalMs
var photoAt = Photos.photoAt
var photoName = Photos.photoName

// Omate
var pluginFileUrl = Omate.pluginFileUrl
var CHASE_LABELS = Omate.CHASE_LABELS
var chaseLabel = Omate.chaseLabel
var settingNumber = Omate.settingNumber

// Crypto
var CRYPTO_CHAINS = Crypto.CRYPTO_CHAINS
var CRYPTO_PRICE_HOST = Crypto.CRYPTO_PRICE_HOST
var CRYPTO_CURRENCIES = Crypto.CRYPTO_CURRENCIES
var CRYPTO_CURRENCY_SYMBOLS = Crypto.CRYPTO_CURRENCY_SYMBOLS
var CRYPTO_DEFAULT_CHAIN = Crypto.CRYPTO_DEFAULT_CHAIN
var CRYPTO_DEFAULT_CURRENCY = Crypto.CRYPTO_DEFAULT_CURRENCY
var MAX_CRYPTO_PRICE = Crypto.MAX_CRYPTO_PRICE
var MAX_CRYPTO_AMOUNT = Crypto.MAX_CRYPTO_AMOUNT
var MAX_WRITABLE = Crypto.MAX_WRITABLE
var cryptoChain = Crypto.cryptoChain
var cryptoChainNames = Crypto.cryptoChainNames
var cryptoSymbol = Crypto.cryptoSymbol
var isSafeCryptoAddress = Crypto.isSafeCryptoAddress
var isCryptoCurrency = Crypto.isCryptoCurrency
var cryptoCurrencyOf = Crypto.cryptoCurrencyOf
var cryptoChainOf = Crypto.cryptoChainOf
var cryptoWalletKey = Crypto.cryptoWalletKey
var cryptoWalletsInUse = Crypto.cryptoWalletsInUse
var cryptoCoinsInUse = Crypto.cryptoCoinsInUse
var cryptoCurrenciesInUse = Crypto.cryptoCurrenciesInUse
var CRYPTO_CURL_FLAGS = Crypto.CRYPTO_CURL_FLAGS
var cryptoBalanceCommand = Crypto.cryptoBalanceCommand
var cryptoPriceCommand = Crypto.cryptoPriceCommand
var parseEsploraBalance = Crypto.parseEsploraBalance
var parseHexBalance = Crypto.parseHexBalance
var parseLamportBalance = Crypto.parseLamportBalance
var parseCryptoBalance = Crypto.parseCryptoBalance
var parseCryptoMarket = Crypto.parseCryptoMarket
var CRYPTO_SERIES_MIN = Crypto.CRYPTO_SERIES_MIN
var cryptoSeries = Crypto.cryptoSeries
var cryptoSparkline = Crypto.cryptoSparkline
var cryptoSeriesRange = Crypto.cryptoSeriesRange
var cryptoQuote = Crypto.cryptoQuote
var cryptoAmountLabel = Crypto.cryptoAmountLabel
var groupThousands = Crypto.groupThousands
var cryptoMoneyLabel = Crypto.cryptoMoneyLabel
var cryptoChangeLabel = Crypto.cryptoChangeLabel
var cryptoHoldingValue = Crypto.cryptoHoldingValue
var cryptoAddressShort = Crypto.cryptoAddressShort
var cryptoCardLabel = Crypto.cryptoCardLabel

