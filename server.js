const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const db = require('./database');
const GameManager = require('./game-manager');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: '*',
        methods: ['GET', 'POST']
    }
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Initialize GameManager
const gameManager = new GameManager(io, db);

// Socket.IO connection handling
io.on('connection', (socket) => {
    let username = null;

    socket.on('set-username', (data) => {
        if (data && data.username) {
            username = data.username;
            db.upsertPlayer(username);
        }
    });

    socket.on('find-match', () => {
        gameManager.handleFindMatch(socket, username);
    });

    socket.on('cancel-match', () => {
        gameManager.handleCancelMatch(socket);
    });

    socket.on('player-choice', (data) => {
        if (data && data.roomId && data.choice) {
            gameManager.handlePlayerChoice(socket, data.roomId, data.choice);
        }
    });

    socket.on('leave-room', (data) => {
        if (data && data.roomId) {
            gameManager.handleLeaveRoom(socket, data.roomId);
        }
    });

    socket.on('disconnect', () => {
        gameManager.handleDisconnect(socket);
    });
});

// REST API Endpoints

// POST /api/solo-play
app.post('/api/solo-play', (req, res) => {
    const { username, choice } = req.body;
    
    if (!username || !choice) {
        return res.status(400).json({ error: 'username and choice are required' });
    }

    const cpuChoice = gameManager.cpuPick();
    const winner = gameManager.getResult(choice, cpuChoice);
    
    db.upsertPlayer(username);
    
    let result = '';
    if (winner === 'p1') {
        db.recordWin(username);
        result = 'win';
    } else if (winner === 'p2') {
        db.recordLoss(username);
        result = 'lose';
    } else {
        db.recordDraw(username);
        result = 'draw';
    }
    
    const id = uuidv4();
    db.recordMatch(id, username, 'CPU', winner === 'p1' ? username : (winner === 'p2' ? 'CPU' : null), winner === 'p1' ? 1 : 0, winner === 'p2' ? 1 : 0, 'solo');

    const playerStats = db.getPlayerStats(username);

    res.json({ cpuChoice, result, playerStats });
});

// GET /api/leaderboard
app.get('/api/leaderboard', (req, res) => {
    try {
        const leaderboard = db.getLeaderboard(20);
        res.json(leaderboard);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch leaderboard' });
    }
});

// GET /api/leaderboard/:username
app.get('/api/leaderboard/:username', (req, res) => {
    const { username } = req.params;
    try {
        const stats = db.getPlayerStats(username);
        if (!stats) {
            return res.status(404).json({ error: 'Player not found' });
        }
        res.json(stats);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch player stats' });
    }
});

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Rock Paper Scissors server running on port ${PORT}`);
});
