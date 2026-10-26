# Security policy

Visulaserz runs both as a local app and as the hosted site [visulaserz.com](https://visulaserz.com), which has member accounts.

## Reporting a vulnerability

Report it privately through GitHub: the repository's **Security** tab → **Report a vulnerability**. Please do not open a public issue, pull request or discussion about it.

Include what an attacker can do, the steps or a small proof of concept, and the version or commit you tested. Test against your own local copy (`npm start`), not against visulaserz.com or other people's accounts.

You will get a reply within a week. Once a fix is live, the advisory is published with credit to you, unless you would rather stay anonymous.

## In scope

- The server (`server.js`, `lib/`): accounts, sessions, CSRF, the admin desk, file and media handling, the YouTube import jobs.
- The web app (`public/`): anything that lets one user's input run script or read data in another user's browser.

## Out of scope

- Denial of service by sheer traffic volume.
- Problems that need an already compromised machine or browser.
- Bugs in yt-dlp, ffmpeg or Node.js themselves; report those to their projects.
