const { v4: uuidv4 } = require('uuid');

class GameManager {
    constructor(io, db) {
        this.io = io;
        this.db = db;
        this.queue = []; // Array of { socket, username }
        this.rooms = new Map(); // Map of rooms
    }

    // Determine the result of a round
    // Returns: 'p1', 'p2', or 'draw'
    getResult(p1Choice, p2Choice) {
        if (p1Choice === p2Choice) return 'draw';
        if (
            (p1Choice === 'rock' && p2Choice === 'scissors') ||
            (p1Choice === 'scissors' && p2Choice === 'paper') ||
            (p1Choice === 'paper' && p2Choice === 'rock')
        ) {
            return 'p1';
        }
        return 'p2';
    }

    // CPU choice for solo mode
    cpuPick() {
        const choices = ['rock', 'paper', 'scissors'];
        return choices[Math.floor(Math.random() * choices.length)];
    }

    // Handle entering matchmaking queue
    handleFindMatch(socket, username) {
        if (!username) {
            socket.emit('error', { message: 'Username is required to find a match.' });
            return;
        }

        // Make sure player isn't already in queue
        const existingIndex = this.queue.findIndex(p => p.socket.id === socket.id);
        if (existingIndex !== -1) {
            return;
        }

        this.db.upsertPlayer(username);
        this.queue.push({ socket, username });

        // Try to match players
        this.processQueue();
    }

    // Handle leaving matchmaking queue
    handleCancelMatch(socket) {
        this.queue = this.queue.filter(p => p.socket.id !== socket.id);
    }

    // Process the queue to find matches
    processQueue() {
        // Send queue size updates to everyone in queue
        this.queue.forEach(p => {
            p.socket.emit('queue-size', { count: this.queue.length });
            p.socket.emit('waiting', { message: 'Waiting for an opponent...' });
        });

        while (this.queue.length >= 2) {
            const p1 = this.queue.shift();
            const p2 = this.queue.shift();

            const roomId = uuidv4();
            
            p1.socket.join(roomId);
            p2.socket.join(roomId);

            const room = {
                id: roomId,
                players: [
                    { socket: p1.socket, username: p1.username, choice: null, score: 0 },
                    { socket: p2.socket, username: p2.username, choice: null, score: 0 }
                ],
                round: 1,
                maxRounds: 5,
                status: 'playing' // 'playing' | 'finished'
            };

            this.rooms.set(roomId, room);

            // Notify players they found a match
            p1.socket.emit('match-found', { roomId, opponent: p2.username, yourTurn: true });
            p2.socket.emit('match-found', { roomId, opponent: p1.username, yourTurn: true });
        }
    }

    // Handle a player submitting a choice
    handlePlayerChoice(socket, roomId, choice) {
        const room = this.rooms.get(roomId);
        if (!room || room.status !== 'playing') {
            socket.emit('error', { message: 'Room not found or game already finished.' });
            return;
        }

        const playerIndex = room.players.findIndex(p => p.socket.id === socket.id);
        if (playerIndex === -1) return;

        const player = room.players[playerIndex];
        const opponentIndex = playerIndex === 0 ? 1 : 0;
        const opponent = room.players[opponentIndex];

        if (player.choice) {
            // Choice already made
            return;
        }

        player.choice = choice;
        opponent.socket.emit('opponent-choice-made');

        // If both players have made a choice, resolve the round
        if (player.choice && opponent.choice) {
            this.resolveRound(room);
        }
    }

    // Resolve the current round
    resolveRound(room) {
        const p1 = room.players[0];
        const p2 = room.players[1];

        const winner = this.getResult(p1.choice, p2.choice);
        
        if (winner === 'p1') p1.score++;
        else if (winner === 'p2') p2.score++;

        const p1Result = winner === 'p1' ? 'win' : winner === 'p2' ? 'lose' : 'draw';
        const p2Result = winner === 'p2' ? 'win' : winner === 'p1' ? 'lose' : 'draw';

        // Check for game over (best of 5 means first to 3 wins)
        const gameOver = p1.score === 3 || p2.score === 3;

        // Emit round-result to both players
        p1.socket.emit('round-result', {
            round: room.round,
            playerChoice: p1.choice,
            opponentChoice: p2.choice,
            result: p1Result,
            scores: { you: p1.score, opponent: p2.score },
            gameOver
        });

        p2.socket.emit('round-result', {
            round: room.round,
            playerChoice: p2.choice,
            opponentChoice: p1.choice,
            result: p2Result,
            scores: { you: p2.score, opponent: p1.score },
            gameOver
        });

        if (gameOver) {
            this.finishGame(room, p1, p2);
        } else {
            // Reset for next round
            room.round++;
            p1.choice = null;
            p2.choice = null;
        }
    }

    // Finish the game, record stats
    finishGame(room, p1, p2) {
        room.status = 'finished';
        let winnerName = null;

        if (p1.score > p2.score) {
            winnerName = p1.username;
            this.db.recordWin(p1.username);
            this.db.recordLoss(p2.username);
        } else if (p2.score > p1.score) {
            winnerName = p2.username;
            this.db.recordWin(p2.username);
            this.db.recordLoss(p1.username);
        } else {
            this.db.recordDraw(p1.username);
            this.db.recordDraw(p2.username);
        }

        this.db.recordMatch(room.id, p1.username, p2.username, winnerName, p1.score, p2.score, 'multiplayer');

        const p1Stats = this.db.getPlayerStats(p1.username);
        const p2Stats = this.db.getPlayerStats(p2.username);

        p1.socket.emit('game-over', {
            winner: winnerName,
            finalScores: { you: p1.score, opponent: p2.score },
            playerStats: p1Stats
        });

        p2.socket.emit('game-over', {
            winner: winnerName,
            finalScores: { you: p2.score, opponent: p1.score },
            playerStats: p2Stats
        });

        this.rooms.delete(room.id);
    }

    // Handle a player explicitly leaving a room
    handleLeaveRoom(socket, roomId) {
        socket.leave(roomId);
        const room = this.rooms.get(roomId);
        if (room) {
            const opponent = room.players.find(p => p.socket.id !== socket.id);
            if (opponent) {
                opponent.socket.emit('opponent-disconnected', { reason: 'Opponent left the room.' });
            }
            this.rooms.delete(roomId);
        }
    }

    // Handle socket disconnect
    handleDisconnect(socket) {
        // Remove from queue if present
        this.handleCancelMatch(socket);

        // Notify opponents in any active rooms
        for (const [roomId, room] of this.rooms.entries()) {
            const player = room.players.find(p => p.socket.id === socket.id);
            if (player) {
                const opponent = room.players.find(p => p.socket.id !== socket.id);
                if (opponent && room.status === 'playing') {
                    opponent.socket.emit('opponent-disconnected', { reason: 'Opponent disconnected.' });
                }
                this.rooms.delete(roomId);
            }
        }
    }
}

module.exports = GameManager;
