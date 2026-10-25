# Connect-Ed Cloud Functions

## Overview

This repository contains a collection of Node.js Google Cloud Functions designed for the Connect-ED application. These functions scrape sports data from the CISAA results page (http://www.cisaa.ca/cisaa/ShowPage.pb?CISAA_Results.html), process it, and store it in Firebase Firestore. The system handles sports data (schedules, results, standings), as well as lunch menus, articles, and events.

## Features

- **Web Scraping**:
    - Cheerio and Axios for parsing the CISAA results page. Leagues are discovered from the page's Fall/Winter/Spring dropdowns and tables are recognised by their header rows, so new league codes need no code change.
    - A run that finds no leagues or no games throws, so a future layout change shows up as a failed run instead of a silent no-op.
- **Comprehensive Data Modeling**:
    - JavaScript classes for `Standings`, `Games`, `LunchMenus`, `Articles`, and `Events`.
    - `toMap()` methods in models for easy Firestore serialization.
- **Firestore Integration**:
    - Firebase Admin SDK for backend database operations.
    - `set...` functions for writing/updating data to various Firestore collections (e.g., `Sports`, `Games`, `Team Rosters`, `LunchMenus`, `Articles`, `Events`).
    - Standings are stored as an array within `Sports` documents.
    - `Team Rosters` documents are read-only now: they came from GameSheet, which CISAA no longer embeds.
    - `get...` utility functions for retrieving data from Firestore.
- **Automated and On-Demand Operations**:
    - Scheduled Cloud Functions for regular updates (e.g., daily game/standings updates, weekly full data refresh).
    - On-demand (HTTP and Callable) functions for immediate data fetching or updates.
- **Modular Design**:
    - Clear separation of concerns: scraping logic (`cisaa.js`, `games.js`), database interactions (`database.js`), and data models (`models/`).
- **Environment-Aware Configuration**:
    - Supports local Firebase service account keys via environment variables for development and testing.

## Technologies

- **Node.js** (v22 recommended)
- **Firebase**:
    - Cloud Functions (v2)
    - Firestore
    - Firebase Admin SDK
- **Axios**
- **Cheerio**
- **qs**
- **Google Cloud Functions Framework**

## Project Structure

```plaintext
connect-ed-2-cloud-functions/
├── functions/                      # ← your Cloud Functions codebase
│   ├── index.js                    # Entry point: exports Firebase Functions (scheduled & on-demand)
│   ├── src/                        
│   │   ├── cisaa.js                # Fetches and parses the CISAA results page (pure parsers)
│   │   ├── games.js                # Turns parsed pages into Sports/Games documents
│   │   ├── database.js             # Firestore initialization, set/get functions for all data types
│   │   └── models/
│   │       ├── Article.js          # Article class
│   │       ├── Event.js            # Event class
│   │       ├── GameClasses.js      # BaseGame
│   │       ├── LunchMenu.js        # LunchMenuItem, LunchMenuStation, LunchMenu
│   │       ├── schools.js          # Schools (static data)
│   │       └── StandingsClasses.js # BaseStandings
│   │       
│   ├── scripts/dry-run.js          # Scrapes the live site and prints what would be written
│   ├── test/                       # Unit tests and saved CISAA pages (test/fixtures)
│   ├── .eslintrc.cjs               # ESLint config for functions
│   ├── .gitignore                  # ignores node_modules, secrets, etc.
│   ├── package.json                # Project dependencies and scripts
│   └── node_modules/               # (functions-only dependencies)
│ 
├── .firebaserc                     # Firebase project aliases
├── firebase.json                   # overall Firebase config
├── .gitignore                      # root-level ignores (logs, /node_modules, etc.)
├── firestore.rules
├── firestore.indexes.json
└── README.md                       # This file
```

## Setup and Installation

1.  **Prerequisites**:
    *   Node.js (version 22 recommended, see `package.json` engines) and npm.
    *   Firebase CLI installed (`npm install -g firebase-tools`).
    *   A Firebase project created on the [Firebase Console](https://console.firebase.google.com/).

2.  **Clone the Repository**:
    ```bash
    git clone <your-repository-url>
    cd <repository-name>/functions
    ```

3.  **Install Dependencies**:
    ```bash
    npm install
    ```

4.  **Firebase Service Account for Local Development**:
    *   Go to your Firebase project settings in the Firebase Console -> "Service accounts".
    *   Generate a new private key and download the JSON file.
    *   **For local development/emulator use**:
        *   Store this file securely (e.g., in a `functions/secrets/` directory, ensuring this path is in your `.gitignore` as `functions/secrets/service-account.json` is).
        *   Set the `LOCAL_SA_PATH` environment variable to the path of this JSON file relative to the `functions` directory (e.g., `LOCAL_SA_PATH=secrets/your-service-account-file.json`). The `database.js` file will use this path.
    *   When deployed to Google Cloud, Firebase Functions automatically use the appropriate service account credentials.

5.  **Configure Firebase Project**:
    *   Associate your local project with your Firebase project:
        ```bash
        firebase use --add
        ```
        Select your project from the list.

## Key Modules and Functionality

*   **`index.js`**:
    *   Main entry point for all Firebase Functions.
    *   Initializes Firebase Admin SDK via `database.js`.
    *   Exports scheduled Cloud Functions (`onSchedule`) for:
        *   `scheduledUpdateGamesStandings`: Daily updates for games and standings.
        *   `scheduledSetAll`: Weekly updates for all data (sports, standings, games).
        *   `scheduledSetSports`: Monthly updates for sports data.
    *   Exports numerous on-demand Cloud Functions (`onCall`, `onRequest`) for:
        *   Setting and getting sports, standings and games, and getting stored rosters.
        *   Setting and getting lunch menus.
        *   Setting and getting articles.
        *   Setting and getting events.
        *   Triggering `updateGamesStandings` and `setAll` on demand.

*   **`cisaa.js`**:
    *   `CISAA_RESULTS_URL`: the one URL every request goes to (POST `txtleague=<code>`).
    *   `parseLeagueList(html)`: Reads term, code and name from the `lstFall`/`lstWinter`/`lstSpring` dropdowns.
    *   `parseResultsPage(html)`: Finds the standings and schedule tables by their header rows and returns `{standings, games}`. Dates on the page have no year; July–December are taken as the school year's first year and January–June as the second.

*   **`games.js`**:
    *   `parseSports()`: Lists every CISAA league and keeps the ones Appleby College plays in.
    *   `parseStandings()`, `parseGames()`, `inSport()`: Built on `parseResultsPage`.
    *   Uses Axios and Cheerio for scraping.

*   **`database.js`**:
    *   `initializeFirebase()`: Initializes Firebase Admin SDK. Supports local service account key via `LOCAL_SA_PATH` env var or default credentials in the cloud.
    *   `setSports()`: Writes sports data to the `Sports` collection.
    *   `setStandings()`: Updates `Sports` documents with an array of standings data.
    *   `setGames()`: Writes game data to the `Games` collection. 
    *   `setLunchMenu()`, `setArticle()`, `setEvent()`: Write data to `LunchMenus`, `Articles`, and `Events` collections respectively.
    *   Various `get...` and `getAll...` functions to retrieve data from Firestore for all managed entities.
    *   `setAll()`: Orchestrates scraping and setting all sports, standings and games. Throws if no games are found.
    *   `updateGamesStandings()`: Updates games and standings for this school year's leagues in the current season. Throws if no games are found.

*   **`models/`**:
    *   Contains JavaScript classes for data entities, each with a `constructor` and `toMap()` method.
    *   `Article.js`: Class for articles.
    *   `Event.js`: Class for events.
    *   `GameClasses.js`: `BaseGame`.
    *   `LunchMenu.js`: `LunchMenuItem`, `LunchMenuStation`, `LunchMenu` classes.
    *   `schools.js`: Static school data and lookup methods.
    *   `StandingsClasses.js`: `BaseStandings`.

## Available Scripts (from `package.json`)

*   `npm run lint`: Lints the codebase using ESLint.
*   `npm run serve`: Starts the Firebase emulators (for functions and Firestore).
*   `npm run shell`: Opens the Firebase functions shell.
*   `npm run start`: Runs the functions using Google Cloud Functions Framework (useful for local testing without full emulator).
*   `npm run deploy`: Deploys functions to Firebase.
*   `npm run logs`: Fetches logs for deployed functions.
*   `npm test`: Runs the unit tests against the saved CISAA pages in `test/fixtures`.
*   `npm run dry-run`: Scrapes the live CISAA site and prints this season's Appleby games without writing to Firestore (`-- --all` for every term, `-- --json` for the documents).

## Deployment

To deploy the functions to your Firebase project:

```bash
cd functions  # Ensure you are in the 'functions' directory
firebase deploy --only functions
```

Ensure you have selected the correct Firebase project using `firebase use <project-id>`.
