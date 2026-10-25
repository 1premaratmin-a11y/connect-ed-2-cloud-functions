const {initializeApp, cert} = require("firebase-admin/app");
const {getFirestore} = require("firebase-admin/firestore");
const {parseSports, scrapeLeague, toStandings, toGames, mapLimit, FETCH_CONCURRENCY} = require("./games.js");
const {schoolYearStart, getSeason} = require("./cisaa.js");
const path = require("path");
const fs = require("fs");
const {Article} = require("./models/Article.js");
const {Event} = require("./models/Event.js");
const {LunchMenu} = require("./models/LunchMenu.js");

// Global variables
let firebaseInitialized = false;
let db;

/**
 * Initializes the Firebase Admin SDK.
 * If the env var LOCAL_SA_PATH is set, it will load that service-account JSON (for local dev / emulator).
 * @throws {Error} If the service account file is not found or if initialization fails.
 */
function initializeFirebase() {
  if (firebaseInitialized) return;

  if (process.env.LOCAL_SA_PATH) {
    // running locally or in your emulator
    const keyPath = path.resolve(process.cwd(), process.env.LOCAL_SA_PATH);
    if (!fs.existsSync(keyPath)) {
      throw new Error(`Local service account not found at ${keyPath}`);
    }
    const serviceAccount = JSON.parse(fs.readFileSync(keyPath, "utf8"));
    initializeApp({credential: cert(serviceAccount)});
    console.log("🔑 Firebase Admin initialized with local key");
  } else {
    // running in Cloud Functions / Cloud Run
    initializeApp();
    console.log("✅ Firebase Admin initialized with default application credentials");
  }
  db = getFirestore();
  firebaseInitialized = true;
}

/**
 * Converts a "Sports" document (or a parseSports entry) to the league shape the scraper uses.
 * @param {object} sport - A Sports document ({name, term, league_code}) or {name, term, leagueCode}.
 * @return {{name: string, term: string, leagueCode: string}} The league.
 */
function toLeague(sport) {
  return {name: sport.name, term: sport.term, leagueCode: sport.leagueCode || sport.league_code};
}

/**
 * setSports:
 * Finds Appleby's leagues on the CISAA results page (using parseSports) and writes each into the "Sports" collection,
 * keyed by league code. Each document is stamped with the school year so last year's documents can be told apart.
 * @async
 * @function setSports
 * @return {Promise<Array<{name: string, term: string, leagueCode: string}>>} The leagues written.
 * @throws {Error} If scraping finds no leagues or committing to Firestore fails.
 */
async function setSports() {
  const sports = await parseSports();
  const schoolYear = schoolYearStart(new Date());
  const batch = db.batch();
  sports.forEach((sport) => {
    const docRef = db.collection("Sports").doc(sport.leagueCode);
    batch.set(docRef, {
      name: sport.name,
      term: sport.term,
      league_code: sport.leagueCode,
      school_year: schoolYear,
    }, {merge: true});
  });
  await batch.commit();
  return sports;
}

/**
 * Writes a league's standings into its "Sports" document and its Appleby games into "Games".
 * Standings are left untouched when the page has none, so a bad fetch does not blank the table.
 * @param {{name: string, term: string, leagueCode: string}} sport - The league.
 * @param {{standings: Array<object>, games: Array<object>}} page - The parsed results page.
 * @return {Promise<number>} The number of games written.
 * @async
 */
async function writeLeague(sport, page) {
  const standings = toStandings(page, sport.leagueCode).map((s) => s.toMap());
  const games = toGames(page, sport);
  const batch = db.batch();

  if (standings.length > 0) {
    // Assumes the Sport document itself is created by setSports first.
    batch.update(db.collection("Sports").doc(sport.leagueCode), {standings_data: standings});
  } else {
    console.warn(`No standings found for ${sport.name} (${sport.leagueCode}); keeping the stored standings.`);
  }
  games.forEach((game) => {
    batch.set(db.collection("Games").doc(game.game_code), game, {merge: true});
  });

  await batch.commit();
  console.log(`${sport.name} (${sport.leagueCode}): ${standings.length} standings rows, ${games.length} games`);
  return games.length;
}

/**
 * Scrapes and writes every given league, then fails the run if no games were found at all.
 * @param {Array<{name: string, term: string, leagueCode: string}>} sports - The leagues.
 * @return {Promise<number>} The total number of games written.
 * @throws {Error} If no league produced any games.
 * @async
 */
async function writeLeagues(sports) {
  const counts = await mapLimit(sports, FETCH_CONCURRENCY, async (sport) => writeLeague(sport, await scrapeLeague(sport.leagueCode)));
  const total = counts.reduce((sum, count) => sum + count, 0);
  if (total === 0) {
    throw new Error(`Scraped ${sports.length} leagues but found no Appleby games; the CISAA results page layout may have changed.`);
  }
  return total;
}

/**
 * Reads one "Sports" document.
 * @param {string} leagueCode - The league code (document ID).
 * @return {Promise<{name: string, term: string, leagueCode: string}>} The league.
 * @throws {Error} If no such document exists.
 * @async
 */
async function getSport(leagueCode) {
  const docSnap = await db.collection("Sports").doc(leagueCode).get();
  if (!docSnap.exists) {
    throw new Error(`Sport document ${leagueCode} not found; run setSports first.`);
  }
  return toLeague(docSnap.data());
}

/**
 * setStandings:
 * Scrapes a league's standings and writes them as the standings_data array of its "Sports" document.
 * @param {string} leagueCode - The league code for which to set standings.
 * @throws {Error} If the page has no standings or the Sport document does not exist.
 * @async
 */
async function setStandings(leagueCode) {
  const page = await scrapeLeague(leagueCode);
  const standingsDataArray = toStandings(page, leagueCode).map((s) => s.toMap());
  if (standingsDataArray.length === 0) {
    throw new Error(`No standings found for league ${leagueCode}.`);
  }
  await db.collection("Sports").doc(leagueCode).update({standings_data: standingsDataArray});
  console.log(`Standings array updated for sport ${leagueCode}`);
}

/**
 * setGames:
 * Scrapes Appleby's games in a league and writes/updates each document in the "Games" collection.
 * @param {string} leagueCode - The league code for which to set games.
 * @throws {Error} If the Sport document does not exist or committing fails.
 * @async
 */
async function setGames(leagueCode) {
  const sport = await getSport(leagueCode);
  const games = toGames(await scrapeLeague(leagueCode), sport);
  const batch = db.batch();
  games.forEach((game) => {
    batch.set(db.collection("Games").doc(game.game_code), game, {merge: true});
  });
  await batch.commit();
  console.log(`${games.length} games written for sport ${leagueCode}`);
}

/**
 * setAll:
 * Finds this year's Appleby leagues, then writes standings and games for each of them.
 * @throws {Error} If no leagues or no games are found.
 * @async
 */
async function setAll() {
  const sports = await setSports();
  const total = await writeLeagues(sports);
  console.log(`All sports, standings and games set: ${sports.length} leagues, ${total} games.`);
}

/**
 * Retrieves all sports from the "Sports" collection in Firestore.
 * @return {Promise<Array<object>>} A promise that resolves to an array of sport objects.
 */
async function getSports() {
  const snapshot = await db.collection("Sports").get();
  const sports = [];
  snapshot.forEach((doc) => sports.push(doc.data())); // doc.data() will now include standings_data
  return sports;
}

/**
 * Retrieves standings array for a specific league from its Sport document.
 * @param {string} leagueNum - The league code (document ID of the sport).
 * @return {Promise<Array<object>>} A promise that resolves to an array of standing objects, or an empty array if not found.
 */
async function getStandings(leagueNum) {
  try {
    const sportDocRef = db.collection("Sports").doc(leagueNum);
    const docSnap = await sportDocRef.get();

    if (docSnap.exists) {
      const sportData = docSnap.data();
      return sportData.standings_data || []; // Return the array or an empty one if field is missing
    } else {
      console.log(`Sport document ${leagueNum} not found for getStandings.`);
      return [];
    }
  } catch (error) {
    console.error(`Error getting standings for league ${leagueNum}:`, error);
    return []; // Return empty array on error
  }
}

/**
 * Retrieves all standings for all sports by extracting them from each Sport document.
 * @return {Promise<Array<object>>} A promise that resolves to a flattened array of all standing objects.
 */
async function getAllStandings() {
  const sportsSnapshot = await db.collection("Sports").get();
  const allStandingsData = [];

  sportsSnapshot.forEach((sportDoc) => {
    const sportData = sportDoc.data();
    if (sportData.standings_data && Array.isArray(sportData.standings_data)) {
      allStandingsData.push(...sportData.standings_data);
    }
  });
  return allStandingsData;
}

/**
 * Retrieves games for a specific league from the "Games" collection in Firestore.
 * @param {string} leagueNum - The league code for which to retrieve games.
 * @return {Promise<Array<object>>} A promise that resolves to an array of game objects.
 */
async function getGames(leagueNum) {
  const snapshot = await db.collection("Games").where("league_code", "==", leagueNum).get();
  const games = [];
  snapshot.forEach((doc) => games.push(doc.data()));
  return games;
}

/**
 * Retrieves all games from the "Games" collection in Firestore.
 * @return {Promise<Array<object>>} A promise that resolves to an array of all game objects.
 */
async function getAllGames() {
  const snapshot = await db.collection("Games").get();
  const games = [];
  snapshot.forEach((doc) => games.push(doc.data()));
  return games;
}

/**
 * Retrieves a stored roster from the "Team Rosters" collection. Rosters came from GameSheet, which CISAA
 * no longer uses, so these documents are no longer updated.
 * @param {string} leagueNum - The document ID of the sport in "Team Rosters" (typically the sanitized sport name).
 * @return {Promise<Array<object>>} A promise that resolves to an array of player objects, or an empty array if an error occurs or no roster is found.
 */
async function getRoster(leagueNum) {
  try {
    const sportDocRef = db.collection("Team Rosters").doc(leagueNum);
    const docSnap = await sportDocRef.get();

    if (docSnap.exists) {
      const teamRosterData = docSnap.data();
      // Return the players_data array or an empty one if the field is missing
      return teamRosterData.players_data || [];
    } else {
      console.log(`Team Roster document ${leagueNum} not found for getRoster.`);
      return [];
    }
  } catch (error) {
    console.error(`Error getting roster for ${leagueNum}:`, error);
    return []; // Return empty array on error
  }
}

// --- LunchMenu Functions ---

/**
 * setLunchMenu:
 * Writes or updates a lunch menu document in the "LunchMenus" collection.
 * The document ID will be the formatted date (YYYY-MM-DD).
 * @param {LunchMenu | object} menuData - An instance of LunchMenu or a plain object representing the menu.
 */
async function setLunchMenu(menuData) {
  if (!firebaseInitialized) initializeFirebase();
  const menu = (menuData instanceof LunchMenu) ? menuData : new LunchMenu(menuData);
  const docId = menu.getFormattedDate();
  const docRef = db.collection("LunchMenus").doc(docId);
  await docRef.set(menu.toMap(), {merge: true});
  console.log(`Lunch menu for ${docId} successfully set/updated.`);
}

/**
 * getLunchMenuByDate:
 * Retrieves a specific lunch menu by its date.
 * @param {Date | string} date - A Date object or a date string in 'YYYY-MM-DD' format.
 * @return {Promise<object | null>} The lunch menu data as an object, or null if not found or if the date format is invalid.
 */
async function getLunchMenuByDate(date) {
  if (!firebaseInitialized) initializeFirebase();
  let docId;
  if (date instanceof Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    docId = `${year}-${month}-${day}`;
  } else if (typeof date === "string" && date.match(/^\d{4}-\d{2}-\d{2}$/)) {
    docId = date;
  } else {
    console.error("Invalid date format for getLunchMenuByDate. Use Date object or 'YYYY-MM-DD' string.");
    return null;
  }
  const docRef = db.collection("LunchMenus").doc(docId);
  const docSnap = await docRef.get();
  if (docSnap.exists) {
    return docSnap.data();
  } else {
    console.log(`No lunch menu found for date: ${docId}`);
    return null;
  }
}

/**
 * getAllLunchMenus:
 * Retrieves all lunch menus from the "LunchMenus" collection, ordered by date descending.
 * @return {Promise<Array<object>>} An array of lunch menu objects.
 */
async function getAllLunchMenus() {
  if (!firebaseInitialized) initializeFirebase();
  const snapshot = await db.collection("LunchMenus").orderBy("date", "desc").get();
  const menus = [];
  snapshot.forEach((doc) => menus.push(doc.data()));
  return menus;
}

// --- Article Functions ---

/**
 * setArticle:
 * Writes or updates an article document in the "Articles" collection.
 * Uses `article.articleId` as document ID if provided and valid; otherwise, Firestore auto-generates an ID.
 * @param {Article | object} articleData - An instance of Article or a plain object representing the article.
 * @return {Promise<string>} The document ID of the created or updated article.
 */
async function setArticle(articleData) {
  if (!firebaseInitialized) initializeFirebase();
  const article = (articleData instanceof Article) ? articleData : new Article(articleData);
  let docRef;
  if (article.articleId && typeof article.articleId === "string" && article.articleId.trim() !== "") {
    docRef = db.collection("Articles").doc(article.articleId.trim());
  } else {
    docRef = db.collection("Articles").doc(); // Firestore auto-generates ID
  }
  await docRef.set(article.toMap(), {merge: true});
  console.log(`Article with ID ${docRef.id} successfully set/updated.`);
  return docRef.id;
}

/**
 * getArticleById:
 * Retrieves a specific article by its document ID from the "Articles" collection.
 * @param {string} articleId - The document ID of the article to retrieve.
 * @return {Promise<object | null>} The article data (including its ID) as an object, or null if not found or if `articleId` is invalid.
 */
async function getArticleById(articleId) {
  if (!firebaseInitialized) initializeFirebase();
  if (!articleId || typeof articleId !== "string" || articleId.trim() === "") {
    console.error("Invalid articleId provided to getArticleById.");
    return null;
  }
  const docRef = db.collection("Articles").doc(articleId.trim());
  const docSnap = await docRef.get();
  if (docSnap.exists) {
    return {id: docSnap.id, ...docSnap.data()};
  } else {
    console.log(`No article found with ID: ${articleId}`);
    return null;
  }
}

/**
 * getAllArticles:
 * Retrieves all articles from the "Articles" collection, ordered by publication date descending.
 * @return {Promise<Array<object>>} An array of article objects, each including its ID.
 */
async function getAllArticles() {
  if (!firebaseInitialized) initializeFirebase();
  const snapshot = await db.collection("Articles").orderBy("publication_date", "desc").get();
  const articles = [];
  snapshot.forEach((doc) => articles.push({id: doc.id, ...doc.data()}));
  return articles;
}

// --- Event Functions ---

/**
 * setEvent:
 * Writes or updates an event document in the "Events" collection.
 * Uses `event.eventId` as document ID if provided and valid; otherwise, Firestore auto-generates an ID.
 * @param {Event | object} eventData - An instance of Event or a plain object representing the event.
 * @return {Promise<string>} The document ID of the created or updated event.
 */
async function setEvent(eventData) {
  if (!firebaseInitialized) initializeFirebase();
  const event = (eventData instanceof Event) ? eventData : new Event(eventData);
  let docRef;
  if (event.eventId && typeof event.eventId === "string" && event.eventId.trim() !== "") {
    docRef = db.collection("Events").doc(event.eventId.trim());
  } else {
    docRef = db.collection("Events").doc(); // Firestore auto-generates ID
  }
  await docRef.set(event.toMap(), {merge: true});
  console.log(`Event with ID ${docRef.id} successfully set/updated.`);
  return docRef.id;
}

/**
 * getEventById:
 * Retrieves a specific event by its document ID from the "Events" collection.
 * @param {string} eventId - The document ID of the event to retrieve.
 * @return {Promise<object | null>} The event data (including its ID) as an object, or null if not found or if `eventId` is invalid.
 */
async function getEventById(eventId) {
  if (!firebaseInitialized) initializeFirebase();
  if (!eventId || typeof eventId !== "string" || eventId.trim() === "") {
    console.error("Invalid eventId provided to getEventById.");
    return null;
  }
  const docRef = db.collection("Events").doc(eventId.trim());
  const docSnap = await docRef.get();
  if (docSnap.exists) {
    return {id: docSnap.id, ...docSnap.data()};
  } else {
    console.log(`No event found with ID: ${eventId}`);
    return null;
  }
}

/**
 * getAllEvents:
 * Retrieves all events from the "Events" collection, ordered by start date ascending.
 * @return {Promise<Array<object>>} An array of event objects, each including its ID.
 */
async function getAllEvents() {
  if (!firebaseInitialized) initializeFirebase();
  const snapshot = await db.collection("Events").orderBy("start_date", "asc").get();
  const events = [];
  snapshot.forEach((doc) => events.push({id: doc.id, ...doc.data()}));
  return events;
}

/**
 * updateGamesStandings:
 * Updates games and standings for this school year's sports in the current season.
 * @throws {Error} If no sports are stored for this school year or no games are found.
 * @async
 */
async function updateGamesStandings() {
  console.log("Updating games and standings in Firestore");
  const today = new Date();
  const schoolYear = schoolYearStart(today);
  const sports = (await getSports()).filter((sport) => sport.school_year === schoolYear);
  if (sports.length === 0) {
    throw new Error(`No Sports documents for the ${schoolYear} school year; run setSports or setAll first.`);
  }
  const season = getSeason(today);
  const filteredSports = season !== "Unknown" ? sports.filter((sport) => sport.term === season) : sports;

  const total = await writeLeagues(filteredSports.map(toLeague));
  console.log(`Games and standings updated in Firestore: ${filteredSports.length} leagues, ${total} games`);
}

module.exports = {
  db,
  initializeFirebase,
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
};

