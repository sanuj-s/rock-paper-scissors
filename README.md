# ⚔️ Rock Paper Scissors - Multiplayer & Solo Arena

A real-time Rock Paper Scissors web application featuring solo play against CPU, live online multiplayer matching with WebSockets (Socket.IO), persistent SQLite database for player stats & streaks, and a live leaderboard with a modern dark glassmorphic UI.

---

## ✨ Features

- **🤖 Solo Mode**: Play against an intelligent CPU with real-time streak tracking.
- **🌐 Real-Time Multiplayer**: Instant matchmaking and synchronized turns powered by Socket.IO.
- **🏆 Live Leaderboards & Stats**: SQLite-backed player stats, win streaks, win/loss/draw records, and match history.
- **🎨 Glassmorphic Dark UI**: Modern responsive design with neon glows, animated backgrounds, and smooth transitions.
- **⚡ Fast & Lightweight**: Built with Node.js, Express, Socket.IO, and Better-SQLite3.

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v16 or higher)
- npm

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/sanuj-s/rock-paper-scissors.git
   cd rock-paper-scissors
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the application:
   ```bash
   npm start
   ```

4. Open your browser and navigate to:
   ```
   http://localhost:3000
   ```

---

## 🛠️ Tech Stack

- **Frontend**: HTML5, CSS3 (Glassmorphism & animations), JavaScript (ES6+), Socket.IO client
- **Backend**: Node.js, Express.js, Socket.IO
- **Database**: SQLite with `better-sqlite3`

---

## 📄 License

ISC License
