const {
  setSports,
  setStandings,
  setGames,
  setAll,
  getSports,
  getStandings,
  getAllStandings,
  getGames,
  getAllGames,
  getRoster,
  setLunchMenu,
  getLunchMenuByDate,
  getAllLunchMenus,
  setArticle,
  getArticleById,
  getAllArticles,
  setEvent,
  getEventById,
  getAllEvents,
  updateGamesStandings,
  initializeFirebase,
} = require("./src/database.js");
const {onSchedule} = require("firebase-functions/v2/scheduler");
const {onCall, onRequest, HttpsError} = require("firebase-functions/v2/https");
const logger = require("firebase-functions/logger");

// Initialize Firebase (this should happen only once)
initializeFirebase();

// Scheduled function to update games and standings daily
exports.scheduledUpdateGamesStandings = onSchedule({
  schedule: "every day 00:00",
  timeoutSeconds: 540,
  memory: "1GiB",
  cpu: 2,
}, async (event) => {
  logger.info("Scheduled updateGamesStandings started", {event});
  try {
    await updateGamesStandings();
    logger.info("Scheduled updateGamesStandings completed successfully");
  } catch (error) {
    logger.error("Error in scheduledUpdateGamesStandings:", error);
    throw error;
  }
});

// Scheduled function to set all data weekly (e.g., every Sunday at 1 AM)
exports.scheduledSetAll = onSchedule({
  schedule: "every sunday 01:00",
  timeoutSeconds: 540,
  memory: "1GiB",
  cpu: 2,
}, async (event) => {
  logger.info("Scheduled setAll started", {event});
  try {
    await setAll();
    logger.info("Scheduled setAll completed successfully");
  } catch (error) {
    logger.error("Error in scheduled setAll:", error);
    throw error;
  }
});

// Scheduled function to set sports data monthly (e.g., on the 1st of every month at 2 AM)
exports.scheduledSetSports = onSchedule({
  schedule: "1 of month 02:00",
  timeoutSeconds: 300,
  memory: "1GiB",
  cpu: 2,
}, async (event) => {
  logger.info("Scheduled setSports started", {event});
  try {
    await setSports();
    logger.info("Scheduled setSports completed successfully");
  } catch (error) {
    logger.error("Error in scheduled setSports:", error);
    throw error;
  }
});

// On-demand functions
exports.onDemandSetSports = onRequest(
    {
      timeoutSeconds: 300,
      memory: "1GiB",
      cpu: 2,
    }, async (request, response) => {
      logger.info("onDemandSetSports (onRequest) started", {method: request.method});
      try {
        await setSports();
        logger.info("onDemandSetSports (onRequest) completed successfully");
        response.status(200).send({message: "Sports data set successfully via onRequest."});
      } catch (error) {
        logger.error("Error in onDemandSetSports (onRequest):", error);
        response.status(500).send({error: "Internal server error", details: error.message});
      }
    });

exports.onDemandSetStandings = onCall({
  timeoutSeconds: 300,
  memory: "1GiB",
}, async (request) => {
  logger.info("onDemandSetStandings started", {request});
  const {leagueCode} = request.data;
  if (!leagueCode) {
    throw new HttpsError("invalid-argument", "The function must be called with one argument \"leagueCode\".");
  }
  try {
    await setStandings(leagueCode);
    logger.info("onDemandSetStandings completed successfully");
    return {message: `Standings for league ${leagueCode} set successfully.`};
  } catch (error) {
    logger.error("Error in onDemandSetStandings:", error);
    throw new HttpsError("internal", error.message, error);
  }
});

exports.onDemandSetGames = onCall({
  timeoutSeconds: 540,
  memory: "1GiB",
}, async (request) => {
  logger.info("onDemandSetGames started", {request});
  const {leagueCode} = request.data;
  if (!leagueCode) {
    throw new HttpsError("invalid-argument", "The function must be called with one argument \"leagueCode\".");
  }
  try {
    await setGames(leagueCode);
    logger.info("onDemandSetGames completed successfully");
    return {message: `Games for league ${leagueCode} set successfully.`};
  } catch (error) {
    logger.error("Error in onDemandSetGames:", error);
    throw new HttpsError("internal", error.message, error);
  }
});

exports.onDemandSetAll = onRequest({
  timeoutSeconds: 540,
  memory: "1GiB",
  cpu: 2,
}, async (request, response) => {
  logger.info("onDemandSetAll (onRequest) started", {method: request.method});
  try {
    await setAll();
    logger.info("onDemandSetAll (onRequest) completed successfully");
    response.status(200).send({message: "All data set successfully via onRequest."});
  } catch (error) {
    logger.error("Error in onDemandSetAll (onRequest):", error);
    response.status(500).send({error: "Internal server error", details: error.message});
  }
});

exports.onDemandGetSports = onRequest(async (request, response) => {
  logger.info("onDemandGetSports (onRequest) started", {method: request.method});
  try {
    const sports = await getSports();
    logger.info("onDemandGetSports (onRequest) completed successfully");
    response.status(200).json(sports);
  } catch (error) {
    logger.error("Error in onDemandGetSports (onRequest):", error);
    response.status(500).send({error: "Internal server error", details: error.message});
  }
});

exports.onDemandGetStandings = onCall(async (request) => {
  logger.info("onDemandGetStandings started", {request});
  const {leagueNum} = request.data;
  if (!leagueNum) {
    throw new HttpsError("invalid-argument", "The function must be called with one argument \"leagueNum\".");
  }
  try {
    const standings = await getStandings(leagueNum);
    logger.info("onDemandGetStandings completed successfully");
    return standings;
  } catch (error) {
    logger.error("Error in onDemandGetStandings:", error);
    throw new HttpsError("internal", error.message, error);
  }
});

exports.onDemandGetAllStandings = onRequest(async (request, response) => {
  logger.info("onDemandGetAllStandings (onRequest) started", {method: request.method});
  try {
    const allStandings = await getAllStandings();
    logger.info("onDemandGetAllStandings (onRequest) completed successfully");
    response.status(200).json(allStandings);
  } catch (error) {
    logger.error("Error in onDemandGetAllStandings (onRequest):", error);
    response.status(500).send({error: "Internal server error", details: error.message});
  }
});

exports.onDemandGetGames = onCall(async (request) => {
  logger.info("onDemandGetGames started", {request});
  const {leagueNum} = request.data;
  if (!leagueNum) {
    throw new HttpsError("invalid-argument", "The function must be called with one argument \"leagueNum\".");
  }
  try {
    const games = await getGames(leagueNum);
    logger.info("onDemandGetGames completed successfully");
    return games;
  } catch (error) {
    logger.error("Error in onDemandGetGames:", error);
    throw new HttpsError("internal", error.message, error);
  }
});

exports.onDemandGetAllGames = onRequest(async (request, response) => {
  logger.info("onDemandGetAllGames (onRequest) started", {method: request.method});
  try {
    const allGames = await getAllGames();
    logger.info("onDemandGetAllGames (onRequest) completed successfully");
    response.status(200).json(allGames);
  } catch (error) {
    logger.error("Error in onDemandGetAllGames (onRequest):", error);
    response.status(500).send({error: "Internal server error", details: error.message});
  }
});

exports.onDemandGetRoster = onCall(async (request) => {
  logger.info("onDemandGetRoster started", {request});
  const {leagueNum} = request.data;
  if (!leagueNum) {
    throw new HttpsError("invalid-argument", "The function must be called with one argument \"leagueNum\".");
  }
  try {
    const roster = await getRoster(leagueNum);
    logger.info("onDemandGetRoster completed successfully");
    return roster;
  } catch (error) {
    logger.error("Error in onDemandGetRoster:", error);
    throw new HttpsError("internal", error.message, error);
  }
});

exports.onDemandSetLunchMenu = onCall(async (request) => {
  logger.info("onDemandSetLunchMenu started", {request});
  const {menuData} = request.data;
  if (!menuData) {
    throw new HttpsError("invalid-argument", "The function must be called with one argument \"menuData\".");
  }
  try {
    await setLunchMenu(menuData);
    logger.info("onDemandSetLunchMenu completed successfully");
    return {message: "Lunch menu set successfully."};
  } catch (error) {
    logger.error("Error in onDemandSetLunchMenu:", error);
    throw new HttpsError("internal", error.message, error);
  }
});

exports.onDemandGetLunchMenuByDate = onCall(async (request) => {
  logger.info("onDemandGetLunchMenuByDate started", {request});
  const {date} = request.data;
  if (!date) {
    throw new HttpsError("invalid-argument", "The function must be called with one argument \"date\".");
  }
  try {
    const menu = await getLunchMenuByDate(new Date(date));
    logger.info("onDemandGetLunchMenuByDate completed successfully");
    return menu;
  } catch (error) {
    logger.error("Error in onDemandGetLunchMenuByDate:", error);
    throw new HttpsError("internal", error.message, error);
  }
});

exports.onDemandGetAllLunchMenus = onRequest(async (request, response) => {
  logger.info("onDemandGetAllLunchMenus (onRequest) started", {method: request.method});
  try {
    const menus = await getAllLunchMenus();
    logger.info("onDemandGetAllLunchMenus (onRequest) completed successfully");
    response.status(200).json(menus);
  } catch (error) {
    logger.error("Error in onDemandGetAllLunchMenus (onRequest):", error);
    response.status(500).send({error: "Internal server error", details: error.message});
  }
});

exports.onDemandSetArticle = onCall(async (request) => {
  logger.info("onDemandSetArticle started", {request});
  const {articleData} = request.data;
  if (!articleData) {
    throw new HttpsError("invalid-argument", "The function must be called with one argument \"articleData\".");
  }
  try {
    if (articleData.publicationDate) articleData.publicationDate = new Date(articleData.publicationDate);
    if (articleData.lastModifiedDate) articleData.lastModifiedDate = new Date(articleData.lastModifiedDate);
    const articleId = await setArticle(articleData);
    logger.info("onDemandSetArticle completed successfully");
    return {message: `Article ${articleId} set successfully.`};
  } catch (error) {
    logger.error("Error in onDemandSetArticle:", error);
    throw new HttpsError("internal", error.message, error);
  }
});

exports.onDemandGetArticleById = onCall(async (request) => {
  logger.info("onDemandGetArticleById started", {request});
  const {articleId} = request.data;
  if (!articleId) {
    throw new HttpsError("invalid-argument", "The function must be called with one argument \"articleId\".");
  }
  try {
    const article = await getArticleById(articleId);
    logger.info("onDemandGetArticleById completed successfully");
    return article;
  } catch (error) {
    logger.error("Error in onDemandGetArticleById:", error);
    throw new HttpsError("internal", error.message, error);
  }
});

exports.onDemandGetAllArticles = onRequest(async (request, response) => {
  logger.info("onDemandGetAllArticles (onRequest) started", {method: request.method});
  try {
    const articles = await getAllArticles();
    logger.info("onDemandGetAllArticles (onRequest) completed successfully");
    response.status(200).json(articles);
  } catch (error) {
    logger.error("Error in onDemandGetAllArticles (onRequest):", error);
    response.status(500).send({error: "Internal server error", details: error.message});
  }
});

exports.onDemandSetEvent = onCall(async (request) => {
  logger.info("onDemandSetEvent started", {request});
  const {eventData} = request.data;
  if (!eventData) {
    throw new HttpsError("invalid-argument", "The function must be called with one argument \"eventData\".");
  }
  try {
    if (eventData.startDate) eventData.startDate = new Date(eventData.startDate);
    if (eventData.endDate) eventData.endDate = new Date(eventData.endDate);
    const eventId = await setEvent(eventData);
    logger.info("onDemandSetEvent completed successfully");
    return {message: `Event ${eventId} set successfully.`};
  } catch (error) {
    logger.error("Error in onDemandSetEvent:", error);
    throw new HttpsError("internal", error.message, error);
  }
});

exports.onDemandGetEventById = onCall(async (request) => {
  logger.info("onDemandGetEventById started", {request});
  const {eventId} = request.data;
  if (!eventId) {
    throw new HttpsError("invalid-argument", "The function must be called with one argument \"eventId\".");
  }
  try {
    const event = await getEventById(eventId);
    logger.info("onDemandGetEventById completed successfully");
    return event;
  } catch (error) {
    logger.error("Error in onDemandGetEventById:", error);
    throw new HttpsError("internal", error.message, error);
  }
});

exports.onDemandGetAllEvents = onRequest(async (request, response) => {
  logger.info("onDemandGetAllEvents (onRequest) started", {method: request.method});
  try {
    const events = await getAllEvents();
    logger.info("onDemandGetAllEvents (onRequest) completed successfully");
    response.status(200).json(events);
  } catch (error) {
    logger.error("Error in onDemandGetAllEvents (onRequest):", error);
    response.status(500).send({error: "Internal server error", details: error.message});
  }
});

exports.onDemandUpdateGamesStandings = onRequest({
  timeoutSeconds: 540,
  memory: "1GiB",
  cpu: 2,
}, async (request, response) => {
  logger.info("onDemandUpdateGamesStandings (onRequest) started", {method: request.method});
  try {
    await updateGamesStandings();
    logger.info("onDemandUpdateGamesStandings (onRequest) completed successfully");
    response.status(200).send({message: "Games and standings updated successfully via onRequest."});
  } catch (error) {
    logger.error("Error in onDemandUpdateGamesStandings (onRequest):", error);
    response.status(500).send({error: "Internal server error", details: error.message});
  }
});

// module.exports = { ... } // This block is removed as functions are exported directly.

