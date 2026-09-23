.pragma library

.import "Util.js" as Util

// What the music card needs: track times, player capabilities and metadata.

// Seconds to "3:45", and past an hour to "1:03:45".
function trackTime(seconds) {
  var n = Number(seconds)
  if (!isFinite(n) || n < 0) return "0:00"
  var total = Math.floor(n)
  var s = total % 60
  var m = Math.floor(total / 60) % 60
  var h = Math.floor(total / 3600)
  var mm = h > 0 && m < 10 ? "0" + m : String(m)
  var ss = s < 10 ? "0" + s : String(s)
  return h > 0 ? h + ":" + mm + ":" + ss : mm + ":" + ss
}

// How far through, clamped, and zero rather than NaN when the player has not
// said how long the track is.
function trackFraction(position, length) {
  var pos = Number(position)
  var len = Number(length)
  if (!isFinite(pos) || !isFinite(len) || len <= 0) return 0
  return Math.min(1, Math.max(0, pos / len))
}

// playerctld mirrors whatever else is on the bus. It answers as a player in
// its own right, and it lags the thing it is mirroring, so picking it is the
// difference between a card that updates when the track changes and one that
// updates a moment later. Omarchy's own media widget deprioritises it for the
// same reason; this follows its rules so the bar and the card agree.
function isProxyPlayer(player) {
  var bus = String((player && player.dbusName) || "").toLowerCase()
  var entry = String((player && player.desktopEntry) || "").toLowerCase()
  return bus.indexOf("playerctld") !== -1 || entry === "playerctld"
}

// Something worth drawing a card about.
function hasTrackMetadata(player) {
  return !!(player && (player.trackTitle || player.trackArtist
    || player.trackAlbum || player.trackArtUrl))
}

function playerCanControl(player) {
  return !!(player && (player.canTogglePlaying || player.canPlay
    || player.canPause || player.canControl))
}

// Anything at all that identifies a player, which is a lower bar than having
// a track. It is what a name the user asked for is matched against: a player
// they named by hand should be followed even before it says what is loaded.
function hasAnyMetadata(player) {
  return !!(player && (hasTrackMetadata(player) || player.identity || player.desktopEntry))
}

// How good a candidate a player is, highest wins. The weights encode the
// order Omarchy's media service resolves in: something playing beats
// something with a track, which beats something merely controllable, and a
// real player beats a proxy at equal rank.
function playerScore(player) {
  if (!player) return -1
  var score = 0
  if (player.isPlaying === true) score += 8
  if (hasTrackMetadata(player)) score += 4
  if (playerCanControl(player)) score += 2
  if (!isProxyPlayer(player)) score += 1
  return score
}

// Which player the widget should follow, given what is registered. A name the
// user asked for wins as long as it has anything to show; otherwise the best
// scoring candidate, and the first of them on a tie so the choice does not
// flicker between two equals.
//
// Takes plain objects so it can be tested without a session bus.
function pickPlayerIndex(players, preferred) {
  // Length-and-index rather than Array.isArray: what arrives at runtime is
  // Mpris.players.values, a QML list that indexes and measures like an array
  // but is not one, so Array.isArray says false and every player vanishes.
  // Tests hand it a real array and would never have caught that.
  if (!players) return -1
  var count = Number(players.length)
  if (!isFinite(count) || count <= 0) return -1

  var wanted = Util.clampString(preferred).toLowerCase()
  if (wanted !== "") {
    for (var p = 0; p < count; p++) {
      var identity = String((players[p] && players[p].identity) || "").toLowerCase()
      var bus = String((players[p] && players[p].dbusName) || "").toLowerCase()
      if ((identity.indexOf(wanted) !== -1 || bus.indexOf(wanted) !== -1)
        && hasAnyMetadata(players[p])) return p
    }
  }

  var best = -1
  var bestScore = -1
  for (var i = 0; i < count; i++) {
    var score = playerScore(players[i])
    if (score > bestScore) { bestScore = score; best = i }
  }
  return best
}

// Enough to draw a card: a title or an artist. Some players publish one a
// moment before the other, and waiting for the title means the card says
// "nothing playing" while the desktop is plainly playing something.
function hasPlayable(player) {
  return !!(player && (player.trackTitle || player.trackArtist))
}

// Which transport controls a player will actually answer. MPRIS publishes a
// flag per control and they are not decoration: a browser tab has somewhere
// to pause and nowhere to skip to, and a button that does nothing when it is
// pressed is worse than no button. Only an explicit true counts — these
// arrive over a bus, so an absent flag is not a no by accident.
function playerTransport(player) {
  return {
    toggle: !!player && player.canTogglePlaying === true,
    previous: !!player && player.canGoPrevious === true,
    next: !!player && player.canGoNext === true
  }
}
