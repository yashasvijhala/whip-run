# Changelog

## 0.2.2

- **Wayland fix**: the overlay now starts Electron in X11 mode from launch. Before, it switched too late on Wayland desktops, the drawing crashed, and the cowboy never appeared

## 0.2.1

- **No surprise visits**: live reactions while Claude Code works are now opt-in through `whipRun.reactToClaude`
- **Esc means Esc**: it now dismisses a cameo that's already on screen, not just the game

## 0.2.0

- **Whip Run**: an endless runner along the bottom edge of your screen, with six levels from Hello World to Infinite Loop
- **Claude runs with you**: his energy drains, and a well-aimed crack gets him sprinting again with double points
- **Cross-platform overlay**: Electron downloads once on first play and is checked against its published SHA-256 checksums
- **Claude Code connection**: hooks report busy, waiting and idle, plus which tool ran, so the screen can react

## 0.1.0

- The prototype: a cowboy, a whip, and a very tired robot
