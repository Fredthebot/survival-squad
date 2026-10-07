# Survival Squad — Full Multiplayer Edition

A real-time cooperative browser survival game using Node.js, Express, and WebSockets.

## Run locally
1. Install Node.js LTS.
2. Open Terminal in this folder.
3. Run `npm install`
4. Run `npm start`
5. Open http://localhost:3000 in multiple browser tabs.

## Deploy
This project is designed for Node hosting such as Render. Build command: `npm install`. Start command: `npm start`. The server automatically uses the hosting provider's `PORT` environment variable and the client automatically switches to `wss://` when deployed over HTTPS.

## Gameplay
- Up to 16 players
- 10 waves
- Grunts, runners, tanks, and bosses
- XP and levels
- Coins and upgrade shop
- Cooperative win/loss state
- Server-authoritative movement, enemies, damage, waves, XP, and purchases
