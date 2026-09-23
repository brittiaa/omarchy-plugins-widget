.pragma library

.import "Util.js" as Util

// What the crypto card needs: chains, wallets, price and balance parsing, and
// how amounts are written.

// A holding, and what it is worth. With no address in the settings the same
// card is a plain ticker instead, which costs nothing to support: only the
// middle line changes, and it is the shape most people actually want.
//
// Four chains, two request shapes. Bitcoin and Litecoin are both read through
// an Esplora API -- mempool.space and litecoinspace.org, which is its Litecoin
// fork -- and answer identically, so they share a parser. Ethereum and Solana
// each take a JSON-RPC POST. A fifth chain is a row in this table, not a new
// code path.
//
// `decimals` is the offset of the chain's smallest unit: 1e8 for a satoshi or
// a litoshi, 1e18 for wei, 1e9 for a lamport.
//
// None of these hosts wants an API key, which is the only reason a wallpaper
// decoration can talk to them at all -- there is nowhere here to keep a
// secret. It also means they can withdraw the courtesy, so a chain that stops
// answering has to degrade to a card that says so, never to a wrong number.

var CRYPTO_CHAINS = {
  bitcoin: {
    coin: "bitcoin",
    symbol: "BTC",
    decimals: 8,
    kind: "esplora",
    host: "mempool.space",
    endpoint: "https://mempool.space/api/address/",
    pattern: /^(bc1[02-9ac-hj-np-z]{11,71}|[13][a-km-zA-HJ-NP-Z1-9]{25,34})$/
  },
  litecoin: {
    coin: "litecoin",
    symbol: "LTC",
    decimals: 8,
    kind: "esplora",
    host: "litecoinspace.org",
    endpoint: "https://litecoinspace.org/api/address/",
    pattern: /^(ltc1[02-9ac-hj-np-z]{11,71}|[LM3][a-km-zA-HJ-NP-Z1-9]{25,34})$/
  },
  ethereum: {
    coin: "ethereum",
    symbol: "ETH",
    decimals: 18,
    kind: "evm",
    host: "ethereum-rpc.publicnode.com",
    endpoint: "https://ethereum-rpc.publicnode.com",
    pattern: /^0x[0-9a-fA-F]{40}$/
  },
  solana: {
    coin: "solana",
    symbol: "SOL",
    decimals: 9,
    kind: "solana",
    host: "api.mainnet-beta.solana.com",
    endpoint: "https://api.mainnet-beta.solana.com",
    pattern: /^[1-9A-HJ-NP-Za-km-z]{32,44}$/
  }
}

// Where the prices come from, for every chain at once. One call answers every
// coin in every currency anybody has on screen, which is what keeps a desktop
// of six of these cards down to a single request.
var CRYPTO_PRICE_HOST = "api.coingecko.com"

var CRYPTO_CURRENCIES = ["usd", "eur", "gbp", "inr", "jpy", "aud", "cad"]

var CRYPTO_CURRENCY_SYMBOLS = {
  usd: "$", eur: "€", gbp: "£", inr: "₹",
  jpy: "¥", aud: "A$", cad: "C$"
}

var CRYPTO_DEFAULT_CHAIN = "bitcoin"
var CRYPTO_DEFAULT_CURRENCY = "usd"

// Ceilings on the two numbers that arrive from outside. Neither is a limit
// anybody can reach: no coin is worth a trillion of anything, and no chain
// here has 1e15 units to hold. They are here because a number this large
// stops being written as digits -- String(1e21) is "1e+21", which the
// thousands grouping would happily turn into "$1e+,300" on the wallpaper.
// A figure past these is a response to disbelieve, not one to clamp.
var MAX_CRYPTO_PRICE = 1e12
var MAX_CRYPTO_AMOUNT = 1e15

// Where `String` stops writing digits: String(1e21) is "1e+21", and the
// thousands grouping would turn that into "$1e,+21" on the wallpaper. The two
// ceilings above catch a figure on the way in, but a holding is a price times
// an amount and the product of two numbers under their own bounds can still
// land past this one -- so the labels refuse it here, at the last point
// before it is drawn, which covers every caller rather than one path.
var MAX_WRITABLE = 1e21

function cryptoChain(name) {
  var key = String(name || "")
  return Object.prototype.hasOwnProperty.call(CRYPTO_CHAINS, key) ? CRYPTO_CHAINS[key] : null
}

function cryptoChainNames() {
  var out = []
  for (var key in CRYPTO_CHAINS) {
    if (Object.prototype.hasOwnProperty.call(CRYPTO_CHAINS, key)) out.push(key)
  }
  return out
}

function cryptoSymbol(chain) {
  var entry = cryptoChain(chain)
  return entry ? entry.symbol : ""
}

// The address becomes a path segment or a JSON string sent to a node, so it
// is an allowlist per chain rather than an attempt to escape what arrived.
// Bech32 carries no b, i or o, which is why those two patterns are not the
// obvious [a-z0-9].
function isSafeCryptoAddress(chain, address) {
  var entry = cryptoChain(chain)
  if (!entry || typeof address !== "string") return false
  if (address.length === 0 || address.length > 128) return false
  return entry.pattern.test(address)
}

function isCryptoCurrency(value) {
  var code = String(value || "").toLowerCase()
  for (var i = 0; i < CRYPTO_CURRENCIES.length; i++) {
    if (CRYPTO_CURRENCIES[i] === code) return true
  }
  return false
}

function cryptoCurrencyOf(settings) {
  var code = Util.isPlainObject(settings) ? String(settings.currency || "").toLowerCase() : ""
  return isCryptoCurrency(code) ? code : CRYPTO_DEFAULT_CURRENCY
}

function cryptoChainOf(settings) {
  var name = Util.isPlainObject(settings) ? String(settings.chain || "") : ""
  return cryptoChain(name) ? name : CRYPTO_DEFAULT_CHAIN
}

function cryptoWalletKey(chain, address) {
  return String(chain) + ":" + String(address)
}

// Distinct wallets across every crypto card that is switched on. An address
// typed into two cards is fetched once.
function cryptoWalletsInUse(config) {
  var list = config && Array.isArray(config.widgets) ? config.widgets : []
  var seen = {}
  var out = []
  for (var i = 0; i < list.length; i++) {
    if (list[i].type !== "crypto" || !list[i].enabled) continue
    var settings = list[i].settings || {}
    var chain = cryptoChainOf(settings)
    var address = Util.clampString(settings.address)
    if (!address || !isSafeCryptoAddress(chain, address)) continue
    var key = cryptoWalletKey(chain, address)
    if (seen[key]) continue
    seen[key] = true
    out.push({ chain: chain, address: address, key: key })
  }
  return out
}

// Every coin any crypto card wants a price for -- including the cards with no
// address at all, which are tickers and want nothing else.
function cryptoCoinsInUse(config) {
  var list = config && Array.isArray(config.widgets) ? config.widgets : []
  var seen = {}
  var out = []
  for (var i = 0; i < list.length; i++) {
    if (list[i].type !== "crypto" || !list[i].enabled) continue
    var entry = cryptoChain(cryptoChainOf(list[i].settings || {}))
    if (!entry || seen[entry.coin]) continue
    seen[entry.coin] = true
    out.push(entry.coin)
  }
  return out
}

function cryptoCurrenciesInUse(config) {
  var list = config && Array.isArray(config.widgets) ? config.widgets : []
  var seen = {}
  var out = []
  for (var i = 0; i < list.length; i++) {
    if (list[i].type !== "crypto" || !list[i].enabled) continue
    var code = cryptoCurrencyOf(list[i].settings || {})
    if (seen[code]) continue
    seen[code] = true
    out.push(code)
  }
  return out
}

// The command lines live here rather than in Service.qml, unlike the other
// fetchers, for one reason: four chains times two request shapes is exactly
// the kind of thing that is wrong in one branch and right in three, and here
// it can be tested. Everything interpolated has already been through
// `isSafeCryptoAddress`, and is checked again by the caller before it runs.
// The flags every crypto fetch carries, and why each one is there.
//
// `--proto =https` and `--max-redirs 0` are the pair that keep the promise
// this widget makes out loud: an address is only ever sent to its own chain's
// node. Without them a courtesy endpoint could answer a balance lookup with a
// redirect, and curl would happily carry the address -- which for Bitcoin and
// Litecoin sits in the URL path -- to whatever host the redirect named. There
// is no legitimate redirect on any of these five endpoints, so the number of
// hops allowed is none.
//
// `--max-filesize` is the calendar's rule applied here: this body is about to
// be turned into objects inside the process that draws the desktop, and a
// courtesy endpoint that starts streaming is not a thing to find out about by
// running out of memory. A balance or a price is a few hundred bytes; 256 KiB
// is a ceiling nothing honest reaches.
var CRYPTO_CURL_FLAGS = ["-fsS", "--proto", "=https", "--max-redirs", "0",
  "--max-time", "15", "--max-filesize", "262144"]

function cryptoBalanceCommand(chain, address) {
  var entry = cryptoChain(chain)
  if (!entry || !isSafeCryptoAddress(chain, address)) return null
  var timeout = ["/usr/bin/timeout", "-k", "2", "20", "/usr/bin/curl"]
  if (entry.kind === "esplora") {
    return timeout.concat(CRYPTO_CURL_FLAGS, [entry.endpoint + address])
  }
  var body = entry.kind === "evm"
    ? JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getBalance", params: [address, "latest"] })
    : JSON.stringify({ jsonrpc: "2.0", id: 1, method: "getBalance", params: [address] })
  return timeout.concat(CRYPTO_CURL_FLAGS,
    ["-X", "POST", "-H", "content-type: application/json", "-d", body, entry.endpoint])
}

// One request per currency, covering every coin anybody has on screen.
//
// `coins/markets` rather than `simple/price`, which is what this asked for
// first: it answers with the price, the day's change and a week of hourly
// closes in the same body, so the card's graph costs no extra request. The
// trade is that it takes one currency at a time where `simple/price` took a
// list -- the two-line change that bought a graph. A desktop in one currency,
// which is nearly all of them, still makes exactly one call.
//
// The series is asked for in the card's own currency rather than fetched once
// in dollars and drawn under every label: the shape is normalised to its own
// range before it is drawn and the difference would rarely show, but a graph
// captioned in euros should be a graph of euros.
function cryptoPriceCommand(coins, currency) {
  var ids = []
  for (var i = 0; i < (coins || []).length; i++) {
    var entry = null
    for (var key in CRYPTO_CHAINS) {
      if (CRYPTO_CHAINS[key].coin === coins[i]) { entry = CRYPTO_CHAINS[key]; break }
    }
    if (entry && ids.indexOf(entry.coin) === -1) ids.push(entry.coin)
  }
  if (ids.length === 0 || !isCryptoCurrency(currency)) return null
  var code = String(currency).toLowerCase()
  return ["/usr/bin/timeout", "-k", "2", "20", "/usr/bin/curl"].concat(
    CRYPTO_CURL_FLAGS,
    ["https://api.coingecko.com/api/v3/coins/markets?vs_currency=" + code
      + "&ids=" + ids.join(",")
      + "&sparkline=true&price_change_percentage=24h"])
}

// An Esplora address answers with confirmed totals and the mempool's delta on
// top. Both are counted: a payment that arrived a minute ago is part of the
// balance every wallet would show, and leaving it out reads as the card being
// broken rather than as the card being careful.
function parseEsploraBalance(data, decimals) {
  if (!Util.isPlainObject(data)) return null
  var total = 0
  var parts = [data.chain_stats, data.mempool_stats]
  var sawOne = false
  for (var i = 0; i < parts.length; i++) {
    if (!Util.isPlainObject(parts[i])) continue
    var funded = Number(parts[i].funded_txo_sum)
    var spent = Number(parts[i].spent_txo_sum)
    if (!isFinite(funded) || !isFinite(spent)) continue
    total += funded - spent
    sawOne = true
  }
  if (!sawOne) return null
  return total / Math.pow(10, decimals)
}

// Wei does not fit a double: 1e18 of them is well past the 2^53 that stays
// exact. It does not matter here, because a double still carries fifteen
// significant digits and this card shows at most eight -- the loss is below
// the last figure anybody reads. Do not "fix" this into integer math; the QML
// JS engine is not guaranteed to have BigInt.
function parseHexBalance(data, decimals) {
  if (!Util.isPlainObject(data) || typeof data.result !== "string") return null
  if (!/^0x[0-9a-fA-F]{1,64}$/.test(data.result)) return null
  var wei = parseInt(data.result, 16)
  if (!isFinite(wei)) return null
  return wei / Math.pow(10, decimals)
}

function parseLamportBalance(data, decimals) {
  if (!Util.isPlainObject(data) || !Util.isPlainObject(data.result)) return null
  var lamports = Number(data.result.value)
  if (!isFinite(lamports) || lamports < 0) return null
  return lamports / Math.pow(10, decimals)
}

// A balance in whole coins, or null for anything that did not parse. Null is
// the card saying it does not know, which is never the same as zero.
function parseCryptoBalance(chain, raw) {
  var entry = cryptoChain(chain)
  if (!entry) return null
  var data = raw
  if (typeof raw === "string") {
    try { data = JSON.parse(raw) } catch (e) { return null }
  }
  if (Util.isPlainObject(data) && data.error !== undefined && data.error !== null) return null
  var amount
  if (entry.kind === "esplora") amount = parseEsploraBalance(data, entry.decimals)
  else if (entry.kind === "evm") amount = parseHexBalance(data, entry.decimals)
  else amount = parseLamportBalance(data, entry.decimals)
  if (amount === null || amount < 0 || amount > MAX_CRYPTO_AMOUNT) return null
  return amount
}

// One currency's worth of `coins/markets`, folded into { coin: { price,
// change, series } }. A coin whose price arrived without a 24h figure keeps
// the price and reports the change as null, and one that arrived without a
// week behind it reports an empty series -- the card shows what it has rather
// than nothing, which is the rule the whole file is written to.
function parseCryptoMarket(raw) {
  var data = raw
  if (typeof raw === "string") {
    try { data = JSON.parse(raw) } catch (e) { return null }
  }
  // The endpoint answers with a list, one entry per coin. An object here is
  // an error body, which is not a price table however well formed it is.
  if (!Array.isArray(data)) return null
  var out = {}
  var found = false
  for (var i = 0; i < data.length; i++) {
    var row = data[i]
    if (!Util.isPlainObject(row)) continue
    var coin = Util.clampString(row.id)
    if (!coin) continue
    var price = Util.numberOrNaN(row.current_price)
    if (!isFinite(price) || price <= 0 || price > MAX_CRYPTO_PRICE) continue
    var change = Number(row.price_change_percentage_24h_in_currency)
    if (!isFinite(change)) change = Number(row.price_change_percentage_24h)
    out[coin] = {
      price: price,
      change: isFinite(change) ? change : null,
      series: cryptoSeries(Util.isPlainObject(row.sparkline_in_7d)
        ? row.sparkline_in_7d.price : null)
    }
    found = true
  }
  return found ? out : null
}

// The week behind the price, cleaned up: every finite positive close, in the
// order it arrived, and nothing at all if there are too few to be a shape.
// Two points is a line segment, not a graph, and a graph of one week that
// happens to hold three readings would be a lie about how much is known.
var CRYPTO_SERIES_MIN = 8

function cryptoSeries(raw) {
  if (!Array.isArray(raw)) return []
  var out = []
  for (var i = 0; i < raw.length; i++) {
    var n = Util.numberOrNaN(raw[i])
    if (!isFinite(n) || n <= 0 || n > MAX_CRYPTO_PRICE) continue
    out.push(n)
  }
  return out.length >= CRYPTO_SERIES_MIN ? out : []
}

// A week of hourly closes is 168 numbers and the card is about 180 pixels
// wide, so drawing them all spends detail nobody can see. Reduced to a fixed
// count of buckets, each the mean of the readings that fall in it, which
// keeps the shape and drops the noise -- a mean rather than a sample because
// a sample of one reading per bucket would let a single spike stand for six
// hours that were nothing like it.
//
// The last bucket always ends on the last reading, so the right-hand end of
// the line is where the price is now and lines up with the number above it.
function cryptoSparkline(series, buckets) {
  var list = Array.isArray(series) ? series : []
  var count = Math.max(2, Math.round(Number(buckets) || 0))
  if (list.length < CRYPTO_SERIES_MIN) return []
  if (list.length <= count) return list.slice()
  var out = []
  for (var i = 0; i < count; i++) {
    var from = Math.floor(i * list.length / count)
    var to = Math.floor((i + 1) * list.length / count)
    if (to <= from) to = from + 1
    var sum = 0
    for (var j = from; j < to; j++) sum += list[j]
    out.push(sum / (to - from))
  }
  // Whatever the averaging did to the last bucket, the end of the line is the
  // latest reading: the graph and the price above it are the same fact.
  out[out.length - 1] = list[list.length - 1]
  return out
}

// The low and the high of a drawn series, as the range a graph is plotted
// against. A flat week has no range at all, and a zero-height plot would put
// the line on the floor rather than through the middle, so a flat series is
// given a nominal band around its own value.
function cryptoSeriesRange(series) {
  var list = Array.isArray(series) ? series : []
  if (list.length === 0) return null
  var low = list[0]
  var high = list[0]
  for (var i = 1; i < list.length; i++) {
    if (list[i] < low) low = list[i]
    if (list[i] > high) high = list[i]
  }
  if (high - low > 0) return { low: low, high: high }
  var pad = Math.abs(low) * 0.01 || 1
  return { low: low - pad, high: high + pad }
}

// The table is keyed by currency first, because one desktop can hold cards
// priced in two, and each is a separate request with a separate answer.
function cryptoQuote(prices, coin, currency) {
  if (!Util.isPlainObject(prices)) return null
  var byCoin = prices[String(currency)]
  if (!Util.isPlainObject(byCoin)) return null
  var quote = byCoin[String(coin)]
  return Util.isPlainObject(quote) ? quote : null
}

// A holding written the way somebody reads one off a wallpaper: about four
// significant figures, never scientific notation, no trailing zeros. A
// balance is not an audit -- what it has to answer is "roughly how much".
function cryptoAmountLabel(amount) {
  // numberOrNaN rather than Number: Number(null) is 0, and a balance that has
  // not arrived must never format as a wallet holding nothing.
  var n = Util.numberOrNaN(amount)
  if (!isFinite(n) || n < 0 || n >= MAX_WRITABLE) return ""
  if (n === 0) return "0"
  if (n >= 1000) return groupThousands(String(Math.round(n)))
  var decimals
  if (n >= 1) decimals = 3
  else {
    // The first significant digit's place, plus two more behind it.
    var leadingZeros = Math.floor(-Math.log(n) / Math.LN10)
    decimals = Math.min(8, leadingZeros + 3)
  }
  return n.toFixed(decimals).replace(/0+$/, "").replace(/\.$/, "")
}

function groupThousands(digits) {
  var text = String(digits)
  var out = ""
  var count = 0
  for (var i = text.length - 1; i >= 0; i--) {
    out = text.charAt(i) + out
    count++
    if (count % 3 === 0 && i > 0) out = "," + out
  }
  return out
}

// "$3,295" or "$434.12". Money on a wallpaper wants a magnitude, so anything
// over a thousand drops the cents nobody is reading from across a desk.
function cryptoMoneyLabel(value, currency) {
  var n = Util.numberOrNaN(value)
  if (!isFinite(n) || n < 0 || n >= MAX_WRITABLE) return ""
  var symbol = CRYPTO_CURRENCY_SYMBOLS[String(currency)] || ""
  if (n >= 1000) return symbol + groupThousands(String(Math.round(n)))
  return symbol + n.toFixed(2)
}

// "+2.1%". The sign is the whole of it: DESIGN.md forbids tinting by meaning,
// so this never gets a colour of its own and a fall is told apart from a rise
// by reading it, the way every other number on these cards is.
function cryptoChangeLabel(change) {
  var n = Number(change)
  if (change === null || change === undefined || !isFinite(n)) return ""
  var rounded = Math.round(Math.abs(n) * 10) / 10
  // A day that moved by less than a twentieth of a percent reads as "+0.0%",
  // never "-0.0%": the sign is the whole of what this label says, and a minus
  // in front of a zero says a fall that the number then denies.
  return (n < 0 && rounded > 0 ? "-" : "+") + rounded.toFixed(1) + "%"
}

// What one holding is worth, or null when either half is missing. Not zero:
// a price that has not arrived is not a wallet worth nothing.
function cryptoHoldingValue(amount, quote) {
  var n = Util.numberOrNaN(amount)
  if (!isFinite(n) || n < 0) return null
  if (!Util.isPlainObject(quote)) return null
  var price = Util.numberOrNaN(quote.price)
  if (!isFinite(price)) return null
  // No ceiling here: both halves already carry one, and what they make
  // together is guarded where it is written rather than where it is worked
  // out -- see MAX_WRITABLE.
  return n * price
}

// "bc1qgd...jwvw97". Long enough to recognise your own, short enough that it
// is not the loudest thing on the card.
function cryptoAddressShort(address) {
  var text = String(address || "")
  if (text.length <= 13) return text
  return text.slice(0, 6) + "…" + text.slice(-6)
}

// The label a crypto card wears: whatever was typed, else the ticker symbol.
// The address is deliberately not the fallback -- a wallpaper that announces
// which addresses you hold is not a default anyone opted into.
function cryptoCardLabel(settings, chain) {
  var typed = Util.isPlainObject(settings) ? Util.clampString(settings.label) : ""
  if (typed) return typed
  return cryptoSymbol(chain)
}
