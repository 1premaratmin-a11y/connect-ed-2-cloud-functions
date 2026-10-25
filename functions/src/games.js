const {BaseGame} = require("./models/GameClasses.js");
const {BaseStandings} = require("./models/StandingsClasses.js");
const {
  fetchResultsPage,
  parseLeagueList,
  parseResultsPage,
  schoolYearStart,
  isApplebyTeam,
  hasAppleby,
} = require("./cisaa.js");

// How many CISAA pages to request at once. More than this and the server starts resetting connections.
const FETCH_CONCURRENCY = 4;

/**
 * Runs an async function over items with at most `limit` calls in flight, keeping input order.
 * @param {Array} items - The inputs.
 * @param {number} limit - Maximum concurrent calls.
 * @param {function(*): Promise<*>} fn - The async function.
 * @return {Promise<Array>} The results, in input order.
 * @async
 */
async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({length: Math.min(limit, items.length)}, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await fn(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * Fetches and parses one league's results page.
 * @param {string} leagueCode - The CISAA league code.
 * @param {Date} [now] - Used to pick the school year for dates without a year.
 * @return {Promise<{title: string, standings: Array<object>, games: Array<object>}>} The parsed page.
 * @async
 */
async function scrapeLeague(leagueCode, now = new Date()) {
  const html = await fetchResultsPage(leagueCode);
  return parseResultsPage(html, {startYear: schoolYearStart(now)});
}

/**
 * inSport: Checks whether Appleby College plays in a league.
 * @param {string} leagueCode - The league code.
 * @return {Promise<boolean>} True if Appleby College is in the league's standings or schedule.
 * @async
 */
async function inSport(leagueCode) {
  return hasAppleby(await scrapeLeague(leagueCode));
}

/**
 * parseSports: Reads every league from the CISAA dropdowns and keeps those Appleby plays in.
 * @return {Promise<Array<{name: string, term: string, leagueCode: string}>>} Appleby's leagues.
 * @throws {Error} If the page lists no leagues or none include Appleby, which means the page layout changed.
 * @async
 */
async function parseSports() {
  const leagues = parseLeagueList(await fetchResultsPage());
  if (leagues.length === 0) {
    throw new Error("CISAA results page listed no leagues; the lstFall/lstWinter/lstSpring dropdowns may have changed.");
  }

  const flags = await mapLimit(leagues, FETCH_CONCURRENCY, (league) => inSport(league.leagueCode));
  const sports = leagues.filter((league, index) => flags[index]);
  console.log(`Found ${sports.length} Appleby leagues out of ${leagues.length} CISAA leagues.`);
  if (sports.length === 0) {
    throw new Error(`None of the ${leagues.length} CISAA leagues include Appleby College; the results page layout may have changed.`);
  }
  return sports;
}

/**
 * Converts a parsed page's standings into BaseStandings for the Sports document.
 * @param {{standings: Array<object>}} page - The result of parseResultsPage.
 * @param {string} leagueCode - The league code.
 * @return {Array<BaseStandings>} One entry per team, in table order.
 */
function toStandings(page, leagueCode) {
  return page.standings.map((row) => new BaseStandings({
    teamName: row.teamName,
    gamesPlayed: row.gamesPlayed,
    wins: row.wins,
    losses: row.losses,
    ties: row.ties,
    points: row.points,
    tableNum: row.tableNum,
    sportId: leagueCode,
    schoolId: row.schoolId,
    standingsCode: `S_${row.schoolId}_${leagueCode}`,
  }));
}

/**
 * Converts a parsed page's schedule into Games documents for Appleby's games.
 * Games against a school missing from models/schools.js (or a playoff placeholder such as "1st") are skipped.
 * @param {{games: Array<object>}} page - The result of parseResultsPage.
 * @param {{name: string, term: string, leagueCode: string}} sport - The league.
 * @return {Array<object>} Game maps in the Firestore "Games" shape.
 */
function toGames(page, sport) {
  const games = [];
  for (const game of page.games) {
    if (!isApplebyTeam(game.home) && !isApplebyTeam(game.away)) continue;
    if (!game.home.schoolId || !game.away.schoolId) {
      console.warn(`Skipping ${game.date} ${game.home.abbr} vs ${game.away.abbr} in ${sport.leagueCode}: school not in models/schools.js`);
      continue;
    }
    games.push(new BaseGame({
      homeTeam: game.home.name,
      homeAbbr: game.home.abbr,
      homeLogo: game.home.logo,
      awayTeam: game.away.name,
      awayAbbr: game.away.abbr,
      awayLogo: game.away.logo,
      homeScore: game.homeScore,
      awayScore: game.awayScore,
      gameDate: new Date(game.date),
      gameTime: game.time,
      sportsName: sport.name,
      term: sport.term,
      leagueCode: sport.leagueCode,
      gameCode: `G_${game.home.schoolId}_${game.away.schoolId}_${game.date.replace(/-/g, "_")}_${sport.leagueCode}`,
    }).toMap());
  }
  return games;
}

/**
 * parseStandings: Scrapes a league's standings.
 * @param {string} leagueCode - The league code.
 * @return {Promise<Array<BaseStandings>>} The standings.
 * @async
 */
async function parseStandings(leagueCode) {
  return toStandings(await scrapeLeague(leagueCode), leagueCode);
}

/**
 * parseGames: Scrapes Appleby's games in a league.
 * @param {{name: string, term: string, leagueCode: string}} sport - The league.
 * @return {Promise<Array<object>>} Game maps in the Firestore "Games" shape.
 * @async
 */
async function parseGames(sport) {
  return toGames(await scrapeLeague(sport.leagueCode), sport);
}

module.exports = {
  mapLimit,
  scrapeLeague,
  inSport,
  parseSports,
  toStandings,
  toGames,
  parseStandings,
  parseGames,
  FETCH_CONCURRENCY,
};
