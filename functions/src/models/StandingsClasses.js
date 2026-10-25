// This file contains the Standings class which encapsulates standings data as an object.
/**
 * Represents base standings for a team.
 */
class BaseStandings {
  /**
   * @param {Object} params - The parameters for the base standings.
   * @param {string} params.teamName - The name of the team.
   * @param {number} params.gamesPlayed - The number of games played.
   * @param {number} params.wins - The number of wins.
   * @param {number} params.losses - The number of losses.
   * @param {number} params.ties - The number of ties.
   * @param {number} params.points - The number of points.
   * @param {number} params.tableNum - The table number.
   * @param {number} params.sportId - The sport ID.
   * @param {number} params.schoolId - The school ID.
   * @param {string} params.standingsCode - The standings code.
   */
  constructor({
    teamName,
    gamesPlayed,
    wins,
    losses,
    ties,
    points,
    tableNum,
    sportId,
    schoolId,
    standingsCode,
    // tableNum or other fields you always have...
  }) {
    this.teamName = teamName;
    this.gamesPlayed = gamesPlayed;
    this.wins = wins;
    this.losses = losses;
    this.ties = ties;
    this.points = points;
    this.tableNum = tableNum;
    this.sportId = sportId;
    this.schoolId = schoolId;
    this.standingsCode = standingsCode;
  }

  /**
   * Converts the BaseStandings instance to a plain JavaScript object.
   * @return {object} A plain JavaScript object representing the base standings.
   */
  toMap() {
    return {
      teamName: this.teamName,
      gamesPlayed: this.gamesPlayed,
      wins: this.wins,
      losses: this.losses,
      ties: this.ties,
      points: this.points,
      tableNum: this.tableNum,
      sportId: this.sportId,
      schoolId: this.schoolId,
      standingsCode: this.standingsCode,
    };
  }
}

module.exports = {
  BaseStandings,
};
