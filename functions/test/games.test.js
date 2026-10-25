// Tests that parsed pages become documents in the shapes the Flutter app reads.
const {test} = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const {parseResultsPage} = require("../src/cisaa.js");
const {toGames, toStandings, mapLimit} = require("../src/games.js");

const fixture = (name) => fs.readFileSync(path.join(__dirname, "fixtures", name), "utf8");
const SPORT = {name: "Soccer Sr Boys DII", term: "Fall", leagueCode: "S5Og9!KQ!!25"};

test("toGames keeps only Appleby games, in the Games document shape", () => {
  const page = parseResultsPage(fixture("soccer-sr-boys-dii.html"), {startYear: 2026});
  const games = toGames(page, SPORT);
  assert.equal(games.length, 4);
  assert.ok(games.every((game) => game.home_abbr === "AC" || game.away_abbr === "AC"));
  assert.deepEqual(games[0], {
    home_team: "Country Day School",
    home_abbr: "CDS",
    home_logo: "assets/CDS Logo.png",
    away_team: "Appleby College",
    away_abbr: "AC",
    away_logo: "assets/AC Logo.png",
    game_date: "2026-09-30T00:00:00.000Z",
    game_time: "2:30 PM",
    home_score: "4",
    away_score: "0",
    sports_name: "Soccer Sr Boys DII",
    term: "Fall",
    league_code: "S5Og9!KQ!!25",
    game_code: "G_85_66_2026_09_30_S5Og9!KQ!!25",
  });
  assert.ok(games.every((game) => !game.game_code.includes("/")), "game codes are valid Firestore ids");
});

test("toGames skips opponents that are not in models/schools.js", () => {
  const page = {
    games: [{
      date: "2027-04-14", time: "", homeScore: "", awayScore: "", location: "",
      home: {abbr: "AC", name: "Appleby College", logo: "assets/AC Logo.png", schoolId: 66},
      away: {abbr: "1st", name: "", logo: "", schoolId: null},
    }],
  };
  assert.deepEqual(toGames(page, SPORT), []);
});

test("toStandings keeps the standings_data fields", () => {
  const page = parseResultsPage(fixture("soccer-sr-boys-dii.html"), {startYear: 2026});
  const appleby = toStandings(page, SPORT.leagueCode).map((row) => row.toMap()).find((row) => row.teamName === "Appleby College");
  assert.deepEqual(appleby, {
    teamName: "Appleby College",
    gamesPlayed: 3,
    wins: 0,
    losses: 3,
    ties: 0,
    points: 0,
    tableNum: appleby.tableNum,
    sportId: "S5Og9!KQ!!25",
    schoolId: 66,
    standingsCode: "S_66_S5Og9!KQ!!25",
  });
});

test("mapLimit keeps order and caps concurrency", async () => {
  let running = 0;
  let peak = 0;
  const results = await mapLimit([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
    running++;
    peak = Math.max(peak, running);
    await new Promise((resolve) => setTimeout(resolve, 5));
    running--;
    return n * 2;
  });
  assert.deepEqual(results, [2, 4, 6, 8, 10, 12, 14]);
  assert.ok(peak <= 3);
});
