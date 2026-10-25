// This file contains the Game class which encapsulates game data as an object.

/**
 * Represents a base game.
 */
class BaseGame {
  /**
   * Creates an instance of BaseGame.
   * @param {object} params - The parameters for creating a base game.
   * @param {string} [params.homeTeam=""] - The home team name.
   * @param {string} [params.homeAbbr=""] - The home team abbreviation.
   * @param {string} [params.homeLogo=""] - The home team logo URL.
   * @param {string} [params.awayTeam=""] - The away team name.
   * @param {string} [params.awayAbbr=""] - The away team abbreviation.
   * @param {string} [params.awayLogo=""] - The away team logo URL.
   * @param {Date} [params.gameDate=new Date()] - The date of the game.
   * @param {string} [params.gameTime=""] - The time of the game.
   * @param {string} [params.homeScore=""] - The home team score.
   * @param {string} [params.awayScore=""] - The away team score.
   * @param {string} [params.sportsName=""] - The name of the sport.
   * @param {string} [params.term=""] - The term/season of the game.
   * @param {string} [params.leagueCode=""] - The league code.
   * @param {string} [params.gameCode=""] - The game code.
   */
  constructor({
    homeTeam = "",
    homeAbbr = "",
    homeLogo = "",
    awayTeam = "",
    awayAbbr = "",
    awayLogo = "",
    gameDate = new Date(),
    gameTime = "",
    homeScore = "",
    awayScore = "",
    sportsName = "",
    term = "",
    leagueCode = "",
    gameCode = "",
  }) {
    this.homeTeam = homeTeam;
    this.homeAbbr = homeAbbr;
    this.homeLogo = homeLogo;
    this.awayTeam = awayTeam;
    this.awayAbbr = awayAbbr;
    this.awayLogo = awayLogo;
    this.gameDate = gameDate;
    this.gameTime = gameTime;
    this.homeScore = homeScore;
    this.awayScore = awayScore;
    this.sportsName = sportsName;
    this.term = term;
    this.leagueCode = leagueCode;
    this.gameCode = gameCode;
  }

  /**
   * Converts the BaseGame instance to a plain JavaScript object.
   * @return {object} A plain JavaScript object representing the base game.
   */
  toMap() {
    return {
      home_team: this.homeTeam,
      home_abbr: this.homeAbbr,
      home_logo: this.homeLogo,
      away_team: this.awayTeam,
      away_abbr: this.awayAbbr,
      away_logo: this.awayLogo,
      game_date: this.gameDate.toISOString(),
      game_time: this.gameTime,
      home_score: this.homeScore,
      away_score: this.awayScore,
      sports_name: this.sportsName,
      term: this.term,
      league_code: this.leagueCode,
      game_code: this.gameCode,

    };
  }
}

module.exports = {
  BaseGame,
};
