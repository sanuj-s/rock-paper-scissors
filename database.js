const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'rps.db');
const db = new Database(dbPath);

// Initialize tables
db.exec(`
    CREATE TABLE IF NOT EXISTS players (
        username TEXT PRIMARY KEY,
        wins INTEGER DEFAULT 0,
        losses INTEGER DEFAULT 0,
        draws INTEGER DEFAULT 0,
        games_played INTEGER DEFAULT 0,
        best_streak INTEGER DEFAULT 0,
        current_streak INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_played DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS match_history (
        id TEXT PRIMARY KEY,
        player1 TEXT,
        player2 TEXT,
        winner TEXT,
        p1_score INTEGER,
        p2_score INTEGER,
        mode TEXT,
        played_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
`);

// Prepared statements
const stmts = {
    upsertPlayer: db.prepare(`
        INSERT INTO players (username) VALUES (?)
        ON CONFLICT(username) DO UPDATE SET last_played = CURRENT_TIMESTAMP
    `),
    recordWin: db.prepare(`
        UPDATE players 
        SET wins = wins + 1, 
            games_played = games_played + 1,
            current_streak = current_streak + 1,
            best_streak = MAX(best_streak, current_streak + 1),
            last_played = CURRENT_TIMESTAMP
        WHERE username = ?
    `),
    recordLoss: db.prepare(`
        UPDATE players 
        SET losses = losses + 1, 
            games_played = games_played + 1,
            current_streak = 0,
            last_played = CURRENT_TIMESTAMP
        WHERE username = ?
    `),
    recordDraw: db.prepare(`
        UPDATE players 
        SET draws = draws + 1, 
            games_played = games_played + 1,
            current_streak = 0,
            last_played = CURRENT_TIMESTAMP
        WHERE username = ?
    `),
    recordMatch: db.prepare(`
        INSERT INTO match_history (id, player1, player2, winner, p1_score, p2_score, mode)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `),
    getLeaderboard: db.prepare(`
        SELECT username, wins, losses, draws, games_played, best_streak 
        FROM players 
        ORDER BY wins DESC 
        LIMIT ?
    `),
    getPlayerStats: db.prepare(`
        SELECT * FROM players WHERE username = ?
    `)
};

module.exports = {
    upsertPlayer: (username) => {
        if (!username) return;
        stmts.upsertPlayer.run(username);
    },
    recordWin: (username) => stmts.recordWin.run(username),
    recordLoss: (username) => stmts.recordLoss.run(username),
    recordDraw: (username) => stmts.recordDraw.run(username),
    recordMatch: (id, p1, p2, winner, p1_score, p2_score, mode) => {
        stmts.recordMatch.run(id, p1, p2, winner, p1_score, p2_score, mode);
    },
    getLeaderboard: (limit = 20) => stmts.getLeaderboard.all(limit),
    getPlayerStats: (username) => stmts.getPlayerStats.get(username)
};
