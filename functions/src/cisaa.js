// Fetches and parses the CISAA results page (http://www.cisaa.ca/cisaa/ShowPage.pb?CISAA_Results.html).
// Everything except fetchResultsPage is pure so it can be tested against saved HTML in test/fixtures.
const axios = require("axios");
const cheerio = require("cheerio");
const qs = require("qs");
const {Schools} = require("./models/schools.js");

const CISAA_RESULTS_URL = "http://www.cisaa.ca/cisaa/ShowPage.pb?CISAA_Results.html";

// The three league dropdowns on the results page, in term order.
const TERM_LISTS = [
  ["lstFall", "Fall"],
  ["lstWinter", "Winter"],
  ["lstSpring", "Spring"],
];

// Header rows that identify each kind of table. CISAA spells "Visitor" as "Vistor".
const STANDINGS_HEADER = ["teams", "games", "win", "loss", "tie", "points"];
const SCHEDULE_HEADERS = [
  ["date", "time", "home", "score", "vistor", "score", "location"],
  ["date", "time", "home", "score", "visitor", "score", "location"],
];

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const WEEKDAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

/**
 * Fetches the results page for one league, or the bare page (with the league lists) when no code is given.
 * The form on the page posts txtleague as application/x-www-form-urlencoded.
 * @param {string} [leagueCode] - The CISAA league code, e.g. "S5Og9!KQ!!!2".
 * @return {Promise<string>} The page HTML.
 * @async
 */
async function fetchResultsPage(leagueCode) {
  const MAX_ATTEMPTS = 4;
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await axios.request({
        url: CISAA_RESULTS_URL,
        method: "POST",
        headers: {"content-type": "application/x-www-form-urlencoded"},
        data: qs.stringify({txtleague: leagueCode || ""}),
        timeout: 30000,
        responseType: "text",
      });
      return response.data;
    } catch (err) {
      if (attempt >= MAX_ATTEMPTS) {
        throw new Error(`Fetching CISAA results for league ${leagueCode || "(none)"} failed: ${err.message}`);
      }
      // CISAA's server drops connections under load; back off 1s, 2s, 4s.
      await new Promise((resolve) => setTimeout(resolve, 1000 * 2 ** (attempt - 1)));
    }
  }
}

/**
 * Turns a dropdown label such as "Soccer SrBoys DI" or "Track%26Field HS Coed" into the
 * spaced form the app has always shown ("Soccer Sr Boys DI", "Track&Field HS Coed").
 * @param {string} raw - The option text.
 * @return {string} The cleaned sport name.
 */
function normaliseSportName(raw) {
  let name = raw.trim();
  try {
    name = decodeURIComponent(name);
  } catch (err) {
    // Leave names with a stray % as they are.
  }
  return name
      .replace(/(Sr|Jr|U\d+)(Boys|Girls|Coed)/g, "$1 $2")
      .replace(/\s+/g, " ");
}

/**
 * Reads every league from the Fall, Winter and Spring dropdowns.
 * @param {string} html - The results page HTML.
 * @return {Array<{name: string, term: string, leagueCode: string}>} One entry per league.
 */
function parseLeagueList(html) {
  const $ = cheerio.load(html);
  const leagues = [];
  for (const [listId, term] of TERM_LISTS) {
    $(`#${listId} option`).each((index, element) => {
      const leagueCode = ($(element).attr("value") || "").trim();
      // The first option of each list is the "FALL"/"WINTER"/"SPRING" label with an empty value.
      if (!leagueCode) return;
      leagues.push({name: normaliseSportName($(element).text()), term, leagueCode});
    });
  }
  return leagues;
}

/**
 * The calendar year the current school year started in. CISAA dates carry no year, so
 * games from July to December belong to this year and January to June to the next.
 * @param {Date} now - The date to work from.
 * @return {number} The school year's first calendar year.
 */
function schoolYearStart(now) {
  return now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
}

/**
 * Looks up a school by the abbreviation shown in the schedule.
 * Tries the exact text first, then its leading capitals ("AC (b)" -> "AC").
 * @param {string} rawAbbr - The abbreviation as printed.
 * @return {object} {abbr, school}: the normalised abbreviation and the school record, or undefined if unknown.
 */
function lookupAbbreviation(rawAbbr) {
  const trimmed = rawAbbr.trim();
  const exact = Schools.getSchoolByAbbreviation(trimmed);
  if (exact) return {abbr: trimmed, school: exact};
  const prefix = (trimmed.match(/^[A-Z]+/) || [trimmed])[0];
  return {abbr: prefix, school: Schools.getSchoolByAbbreviation(prefix)};
}

/**
 * Looks up a school by a standings team name, preferring an exact match so
 * "Upper Canada College Prep" is not read as "Upper Canada College".
 * @param {string} teamName - The team name without the league suffix.
 * @return {object|undefined} The school record if known.
 */
function lookupSchoolName(teamName) {
  const exact = Schools.getSchoolByName(teamName);
  if (exact) return exact;
  return Schools.getAllSchools().find((school) => teamName.includes(school.school_name));
}

/**
 * Converts "Wed Sep 30" to an ISO date, choosing the year from the school year.
 * @param {string} text - The date cell text.
 * @param {number} startYear - The school year's first calendar year.
 * @return {object|null} {date, weekdayMatches}: the date (YYYY-MM-DD) and whether the printed weekday agrees.
 */
function parseScheduleDate(text, startYear) {
  const match = text.trim().match(/^([A-Za-z]{3})\w*\s+([A-Za-z]{3})\w*\s+(\d{1,2})$/);
  if (!match) return null;
  const monthIndex = MONTHS.indexOf(match[2].toLowerCase());
  if (monthIndex < 0) return null;
  const day = parseInt(match[3], 10);
  const year = monthIndex >= 6 ? startYear : startYear + 1;
  const date = `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const weekday = WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()];
  return {date, weekdayMatches: weekday === match[1].toLowerCase()};
}

/**
 * Converts "02:30 pm" to "2:30 PM". Unscheduled games show only "am" and become "".
 * @param {string} text - The time cell text.
 * @return {string} The formatted time, or "" when none is given.
 */
function parseScheduleTime(text) {
  const match = text.trim().match(/^(\d{1,2}):(\d{2})\s*([ap])\.?m\.?$/i);
  if (!match) return "";
  return `${parseInt(match[1], 10)}:${match[2]} ${match[3].toUpperCase()}M`;
}

/**
 * Builds the schedule entry for one team cell.
 * @param {string} rawAbbr - The abbreviation as printed.
 * @return {object} {abbr, name, logo, schoolId}; name and logo are "" and schoolId null for unknown schools.
 */
function scheduleTeam(rawAbbr) {
  const {abbr, school} = lookupAbbreviation(rawAbbr);
  return {
    abbr,
    name: school ? school.school_name : "",
    logo: school ? school.logo_dir : "",
    schoolId: school ? school.id : null,
  };
}

/**
 * Parses one league's results page. Tables are recognised by their header rows, not by ids or
 * classes, and data rows are read until the next header (CISAA puts the header row and the data
 * rows in separate tables).
 * @param {string} html - The results page HTML for one league.
 * @param {object} [options] - Parsing options.
 * @param {number} [options.startYear] - The school year's first calendar year; defaults to the current school year.
 * @return {{title: string, standings: Array<object>, games: Array<object>}} The parsed page.
 */
function parseResultsPage(html, {startYear = schoolYearStart(new Date())} = {}) {
  const $ = cheerio.load(html);
  const standings = [];
  const games = [];
  let mode = null;
  let tableNum = 0;

  const cellTexts = (row) => $(row).children("th, td").map((i, cell) => $(cell).text().replace(/\s+/g, " ").trim()).get();
  const matches = (cells, header) => cells.length === header.length && cells.every((text, i) => text.toLowerCase() === header[i]);

  $("tr").each((index, row) => {
    // Skip layout rows that wrap other tables; their inner rows are visited on their own.
    if ($(row).find("table").length > 0) return;
    const cells = cellTexts(row);

    if (matches(cells, STANDINGS_HEADER)) {
      mode = "standings";
      tableNum++;
      return;
    }
    if (SCHEDULE_HEADERS.some((header) => matches(cells, header))) {
      mode = "schedule";
      return;
    }
    if ($(row).children("td").length === 0) return;

    if (mode === "standings" && cells.length === STANDINGS_HEADER.length) {
      const rawName = cells[0];
      const dash = rawName.lastIndexOf(" - ");
      const teamName = dash >= 0 ? rawName.substring(0, dash).trim() : rawName;
      const [played, scheduled] = cells[1].split("/").map((part) => parseInt(part, 10));
      const school = lookupSchoolName(teamName);
      standings.push({
        teamName,
        gamesPlayed: Number.isNaN(played) ? 0 : played,
        gamesScheduled: Number.isNaN(scheduled) ? null : scheduled,
        wins: parseInt(cells[2], 10) || 0,
        losses: parseInt(cells[3], 10) || 0,
        ties: parseInt(cells[4], 10) || 0,
        points: parseInt(cells[5], 10) || 0,
        tableNum,
        schoolId: school ? school.id : null,
      });
    } else if (mode === "schedule" && cells.length === SCHEDULE_HEADERS[0].length) {
      const parsedDate = parseScheduleDate(cells[0], startYear);
      if (!parsedDate) return;
      games.push({
        date: parsedDate.date,
        weekdayMatches: parsedDate.weekdayMatches,
        time: parseScheduleTime(cells[1]),
        home: scheduleTeam(cells[2]),
        homeScore: cells[3],
        away: scheduleTeam(cells[4]),
        awayScore: cells[5],
        location: cells[6],
      });
    }
  });

  return {
    title: $(".captionHeader").first().text().trim(),
    standings,
    games,
  };
}

/**
 * Whether a schedule team is Appleby College (abbreviation "AC", including "AC (b)").
 * @param {{abbr: string}} team - A team from parseResultsPage's games.
 * @return {boolean} True for Appleby.
 */
function isApplebyTeam(team) {
  return /^AC\b/.test(team.abbr);
}

/**
 * Whether Appleby College plays in a parsed league, from its standings or schedule.
 * @param {{standings: Array<object>, games: Array<object>}} page - The result of parseResultsPage.
 * @return {boolean} True if Appleby appears.
 */
function hasAppleby(page) {
  return page.standings.some((row) => row.teamName.startsWith("Appleby College")) ||
    page.games.some((game) => isApplebyTeam(game.home) || isApplebyTeam(game.away));
}

/**
 * Determines the current sports season based on the given date.
 * @param {Date} date - The date to determine the season for.
 * @return {string} The current season ("Fall", "Winter", "Spring", or "Unknown").
 */
function getSeason(date) {
  const month = date.getMonth();
  const day = date.getDate();
  let season;
  switch (month) {
    case 8:
    case 9:
      season = "Fall";
      break;
    case 10:
      season = day >= 10 ? "Winter" : "Fall";
      break;
    case 11:
    case 0:
    case 1:
      season = "Winter";
      break;
    case 2:
      season = day >= 10 ? "Spring" : "Winter";
      break;
    case 3:
    case 4:
      season = "Spring";
      break;
    default:
      season = "Unknown";
  }
  return season;
}

module.exports = {
  CISAA_RESULTS_URL,
  fetchResultsPage,
  normaliseSportName,
  parseLeagueList,
  schoolYearStart,
  getSeason,
  parseScheduleDate,
  parseScheduleTime,
  parseResultsPage,
  isApplebyTeam,
  hasAppleby,
};
