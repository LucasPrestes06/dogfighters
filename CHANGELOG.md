# Changelog

## v1.1 — Free For All
- Online mode is now FFA: no AI enemies, one life per round, last survivor wins the round (+1 win), match ends at 5 / 10 / 15 wins chosen by the host.
- Removed the fixed 4-player limit (configurable safety cap `MAX_PLAYERS_PER_ROOM`, default 24).
- New server phases (`ffa.js`): WAITING, STARTING, ROUND_ACTIVE, ROUND_RESULTS, MATCH_FINISHED.
- Pixel-art round scoreboard and final standings (`board.js`), lobby win selector, multi-column player list.
- Host-only `room:config` and `room:lobby`; spawn rings for any number of players; eliminated players' bullets are dropped.

## v1.0 — Multiplayer (server-authoritative), fixed camera, finite arena
