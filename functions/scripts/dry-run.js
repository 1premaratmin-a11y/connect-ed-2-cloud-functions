// Scrapes the live CISAA results page and prints what a run would write, without touching Firestore.
// It never loads firebase-admin, so it needs no credentials.
//
//   npm run dry-run             Appleby's games for the current season
//   npm run dry-run -- --all    every term this school year
//   npm run dry-run -- --json   the Games and Sports documents as JSON
const {parseSports, scrapeLeague, toGames, toStandings, mapLimit, FETCH_CONCURRENCY} = require("../src/games.js");
const {getSeason} = require("../src/cisaa.js");

/**
 * Runs the dry run.
 * @async
 */
async function main() {
  const all = process.argv.includes("--all");
  const json = process.argv.includes("--json");
  const season = getSeason(new Date());

  const sports = await parseSports();
  const selected = all || season === "Unknown" ? sports : sports.filter((sport) => sport.term === season);
  console.log(`Appleby leagues: ${sports.length} this school year, ${selected.length} in ${all ? "all terms" : season}`);

  const results = await mapLimit(selected, FETCH_CONCURRENCY, async (sport) => {
    const page = await scrapeLeague(sport.leagueCode);
    return {sport, standings: toStandings(page, sport.leagueCode).map((s) => s.toMap()), games: toGames(page, sport)};
  });

  const games = results.flatMap((result) => result.games).sort((a, b) => a.game_date.localeCompare(b.game_date));
  if (json) {
    const sportDocs = results.map(({sport, standings}) => ({
      name: sport.name, term: sport.term, league_code: sport.leagueCode, standings_data: standings,
    }));
    console.log(JSON.stringify({Sports: sportDocs, Games: games}, null, 2));
  } else {
    for (const {sport, standings} of results) {
      const appleby = standings.find((row) => row.teamName.startsWith("Appleby College"));
      const record = appleby ? `${appleby.wins}-${appleby.losses}-${appleby.ties}, ${appleby.points} pts` : "not in standings";
      console.log(`  ${sport.term.padEnd(6)} ${sport.name.padEnd(34)} ${sport.leagueCode}  ${standings.length} teams, Appleby ${record}`);
    }
    console.log(`\nAppleby games (${games.length}):`);
    for (const game of games) {
      const score = game.home_score !== "" || game.away_score !== "" ? `${game.home_score}-${game.away_score}` : "vs";
      console.log(`  ${game.game_date.slice(0, 10)} ${game.game_time.padStart(8)}  ${game.home_abbr.padStart(5)} ${score.padEnd(5)} ` +
        `${game.away_abbr.padEnd(5)} ${game.sports_name}`);
    }
  }
  if (games.length === 0) {
    throw new Error("No Appleby games found; a real run would fail here.");
  }
  console.log("\nDry run only: nothing was written to Firestore.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
