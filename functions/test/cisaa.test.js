// Tests for the CISAA results page parser, run against pages saved from the live site on 25 Oct 2026.
// If CISAA changes its layout again, refresh the fixtures and these tests show what broke.
const {test} = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const {
  CISAA_RESULTS_URL,
  normaliseSportName,
  parseLeagueList,
  schoolYearStart,
  parseScheduleDate,
  parseScheduleTime,
  parseResultsPage,
  hasAppleby,
} = require("../src/cisaa.js");

const fixture = (name) => fs.readFileSync(path.join(__dirname, "fixtures", name), "utf8");
const START_YEAR = 2026;

test("uses the current results page URL", () => {
  assert.equal(CISAA_RESULTS_URL, "http://www.cisaa.ca/cisaa/ShowPage.pb?CISAA_Results.html");
});

test("parseLeagueList reads all three term dropdowns", () => {
  const leagues = parseLeagueList(fixture("index.html"));
  assert.equal(leagues.length, 163);
  assert.deepEqual(
      leagues.map((league) => league.term).filter((term, i, all) => all.indexOf(term) === i),
      ["Fall", "Winter", "Spring"],
  );
  assert.deepEqual(leagues.find((league) => league.leagueCode === "S5Og9!KQ!!!2"),
      {name: "Soccer Sr Boys DI", term: "Fall", leagueCode: "S5Og9!KQ!!!2"});
  assert.ok(leagues.every((league) => league.leagueCode && league.name));
  // The "U10-U12 Sport Guidelines" dropdown is not a league list.
  assert.ok(!leagues.some((league) => league.name.includes("Guideline")));
});

test("normaliseSportName restores spacing and decodes entities", () => {
  assert.equal(normaliseSportName("Soccer SrBoys DI"), "Soccer Sr Boys DI");
  assert.equal(normaliseSportName("Volleyball U14Girls DIIB"), "Volleyball U14 Girls DIIB");
  assert.equal(normaliseSportName("Futsal U14Coed"), "Futsal U14 Coed");
  assert.equal(normaliseSportName("Track%26Field HS Coed"), "Track&Field HS Coed");
  assert.equal(normaliseSportName("Ultimate Frisbee SR DI"), "Ultimate Frisbee SR DI");
});

test("schoolYearStart rolls over in July", () => {
  assert.equal(schoolYearStart(new Date(2026, 9, 25)), 2026);
  assert.equal(schoolYearStart(new Date(2027, 1, 3)), 2026);
  assert.equal(schoolYearStart(new Date(2027, 5, 30)), 2026);
  assert.equal(schoolYearStart(new Date(2027, 6, 1)), 2027);
});

test("parseScheduleDate puts autumn in the first year and winter/spring in the second", () => {
  assert.deepEqual(parseScheduleDate("Fri Sep 25", START_YEAR), {date: "2026-09-25", weekdayMatches: true});
  assert.deepEqual(parseScheduleDate("Wed Dec 2", START_YEAR), {date: "2026-12-02", weekdayMatches: true});
  assert.deepEqual(parseScheduleDate("Wed Jan 20", START_YEAR), {date: "2027-01-20", weekdayMatches: true});
  assert.deepEqual(parseScheduleDate("Wed May 19", START_YEAR), {date: "2027-05-19", weekdayMatches: true});
  assert.equal(parseScheduleDate("Fri Sep 25", 2025).weekdayMatches, false);
  assert.equal(parseScheduleDate("TBA", START_YEAR), null);
});

test("parseScheduleTime matches the app's existing format", () => {
  assert.equal(parseScheduleTime("02:30 pm"), "2:30 PM");
  assert.equal(parseScheduleTime("10:00 am"), "10:00 AM");
  assert.equal(parseScheduleTime("12:00 pm"), "12:00 PM");
  assert.equal(parseScheduleTime("      am"), "");
});

test("parseResultsPage reads a league with two standings tables", () => {
  const page = parseResultsPage(fixture("soccer-sr-boys-dii.html"), {startYear: START_YEAR});
  assert.equal(page.title, "SOCCER SRBOYS DII");
  assert.deepEqual([...new Set(page.standings.map((row) => row.tableNum))], [1, 2]);

  const appleby = page.standings.find((row) => row.teamName === "Appleby College");
  assert.deepEqual(appleby, {
    teamName: "Appleby College",
    gamesPlayed: 3,
    gamesScheduled: 4,
    wins: 0,
    losses: 3,
    ties: 0,
    points: 0,
    tableNum: appleby.tableNum,
    schoolId: 66,
  });

  const opener = page.games.find((game) => game.date === "2026-09-30" && game.away.abbr === "AC");
  assert.deepEqual(opener, {
    date: "2026-09-30",
    weekdayMatches: true,
    time: "2:30 PM",
    home: {abbr: "CDS", name: "Country Day School", logo: "assets/CDS Logo.png", schoolId: 85},
    homeScore: "4",
    away: {abbr: "AC", name: "Appleby College", logo: "assets/AC Logo.png", schoolId: 66},
    awayScore: "0",
    location: opener.location,
  });
  assert.ok(hasAppleby(page));
});

test("parseResultsPage leaves scores empty for unplayed games", () => {
  const page = parseResultsPage(fixture("soccer-sr-boys-dii.html"), {startYear: START_YEAR});
  const upcoming = page.games.find((game) => game.date === "2026-10-28" && game.home.abbr === "HTS");
  assert.equal(upcoming.homeScore, "");
  assert.equal(upcoming.awayScore, "");
  assert.equal(upcoming.away.abbr, "AC");
});

test("parseResultsPage spans December and the new year in a winter league", () => {
  const page = parseResultsPage(fixture("volleyball-sr-girls-di.html"), {startYear: START_YEAR});
  const applebyDates = page.games
      .filter((game) => game.home.abbr === "AC" || game.away.abbr === "AC")
      .map((game) => game.date);
  assert.deepEqual(applebyDates, ["2026-12-02", "2027-01-20", "2027-01-27", "2027-02-03", "2027-02-17"]);
  const tba = page.games.find((game) => game.date === "2026-12-02" && game.away.abbr === "AC");
  assert.equal(tba.time, "");
});

test("parseResultsPage reads every standings table in a five-pool league", () => {
  const page = parseResultsPage(fixture("badminton-sr-coed.html"), {startYear: START_YEAR});
  assert.deepEqual([...new Set(page.standings.map((row) => row.tableNum))], [1, 2, 3, 4, 5]);
  assert.ok(page.standings.some((row) => row.teamName === "Appleby College"));
  assert.equal(page.games.filter((game) => game.home.abbr === "AC" || game.away.abbr === "AC").length, 6);
});

test("every fixture date agrees with its printed weekday", () => {
  for (const name of ["soccer-sr-boys-di.html", "soccer-sr-boys-dii.html", "volleyball-sr-girls-di.html", "badminton-sr-coed.html"]) {
    const page = parseResultsPage(fixture(name), {startYear: START_YEAR});
    assert.ok(page.games.length > 0, `${name} has games`);
    assert.ok(page.standings.length > 0, `${name} has standings`);
    for (const game of page.games) {
      assert.ok(game.weekdayMatches, `${name}: ${game.date} weekday mismatch`);
    }
  }
});

test("a league without Appleby is not kept", () => {
  const page = parseResultsPage(fixture("soccer-sr-boys-di.html"), {startYear: START_YEAR});
  assert.equal(page.standings.length, 6);
  assert.equal(page.games.length, 15);
  assert.equal(hasAppleby(page), false);
});

test("a page with no results tables parses to nothing", () => {
  const page = parseResultsPage(fixture("index.html"), {startYear: START_YEAR});
  assert.deepEqual(page.standings, []);
  assert.deepEqual(page.games, []);
});
