# Installing FinalCircle on a server (pm2 + nginx)

This guide installs FinalCircle on the Linux VPS that already hosts Planecircle behind **nginx** (from Planecircle's guide). The app runs with Node, managed by **pm2**, and only listens locally (`127.0.0.1:8788`; Planecircle keeps 8787); nginx publishes it over HTTPS on its own subdomain.

Once installed, players open `https://ff.mydomain.example`: games against the AI run in the browser; for online play, one player creates a game ("Play online") and sends the link, the other joins it.

Throughout this guide, replace `ff.mydomain.example` with your subdomain.

## 1. Domain name

At your registrar, create an **A** record `ff.mydomain.example` → the VPS's IPv4 address (and **AAAA** if the VPS has an IPv6 address). Check from your machine: `dig +short ff.mydomain.example`.

The app must be at the **root** of a (sub)domain: it does not work under a path such as `https://mydomain.example/ff/`.

## 2. Node 24 and pm2

Already there for Planecircle (`node --version` → v24.x, `pm2 --version`). Otherwise, see Planecircle's guide (NodeSource, `npm install -g pm2`).

## 3. Getting the code

The repository has no remote of its own. Either push it to a private repository and clone it on the VPS:

```bash
sudo mkdir -p /opt/finalcircle && sudo chown "$USER" /opt/finalcircle
git clone <url> /opt/finalcircle
```

or, without a remote, from your machine: `git bundle create finalcircle.bundle master && scp finalcircle.bundle vps:/tmp/`, then on the VPS `git clone /tmp/finalcircle.bundle /opt/finalcircle`.

## 4. Install, build and the missing images

```bash
cd /opt/finalcircle
npm ci
npm run build                      # the interface, in packages/client/dist
npm run build:server               # the server, in packages/server/dist (main.mjs and its AI worker; run without tsx)
npx tsx tools/missing-images.ts    # the 8 starter exclusives' images, absent from Square Enix's CDN, into data/images
```

`tools/missing-images.ts` fetches the images Square Enix's CDN lacks (the Starter Set 2025 exclusives 27-122S…27-129S, from TCGplayer, in English) once, 1.5 s apart, into `data/images/` — outside Git, on the server only. The relay serves them before asking the CDN. Instead, you can copy that folder from your machine: `rsync -a data/images/ vps:/opt/finalcircle/data/images/`.

## 5. Run with pm2

```bash
pm2 start deploy/ecosystem.config.cjs
pm2 save
curl http://127.0.0.1:8788/healthz    # → {"ok":true,"build":"…","protocol":1,"rules":3,"rooms":0,…,"images":{…}}
```

Useful commands: `pm2 status`, `pm2 logs finalcircle`, `pm2 restart finalcircle`. Log rotation (`pm2-logrotate`) is shared with Planecircle.

**`/healthz`:** a direct local request receives the details as JSON: server commit, protocol and rules versions, rooms, memory, the AI workers and the image relay (`breaker`: the CDN refused, the relay waits 30 minutes before asking again; `failed`: images known to be missing). Through nginx, the answer is only "ok".

Optional settings (`env` section of `deploy/ecosystem.config.cjs`): `FC_DECISION_MS` (time per decision, 60,000 ms), `FC_GRACE_MS` (time to come back after a disconnection, 60,000 ms), `FC_MAX_ROOMS` (200), `FC_MAX_HEAP_MB` (heap above which no more rooms are created, 384 MB), `FC_DATA_DIR` (saved games, `data/rooms`; `off` to keep them in memory only), `FC_MAX_ROOMS_PER_IP` (4), `FC_ORIGINS` (other origins allowed for the WebSocket; not needed normally), `FC_AI_WORKERS` (workers of the online AI seat, at most 2 by default; `0`: no online AI), `FC_MAX_AI_ROOMS` (12), `FC_MAX_RSS_MB` (640; keep pm2's `max_memory_restart` above it), `FC_IMAGES_DIR` (`data/images`), `FC_IMAGE_CACHE` (a disk cache of the relayed images; not needed behind nginx). If port 8788 is taken, change `PORT` there **and** in the nginx site.

## 6. nginx and HTTPS

```bash
sudo cp deploy/nginx-finalcircle.conf /etc/nginx/sites-available/finalcircle
sudo nano /etc/nginx/sites-available/finalcircle      # replace ff.mydomain.example
sudo ln -s ../sites-available/finalcircle /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d ff.mydomain.example          # Let's Encrypt certificate + HTTPS redirect
```

**Next to Planecircle:** both sites define `map $http_upgrade $connection_upgrade`. `nginx -t` reports the duplicate: remove the `map` block from the FinalCircle file (Planecircle's serves both). The cache zones have different names (`finalcircle_ffimg`, `planecircle_scry`).

Important points of this site (already in the file):

- `location /ws` forwards the `Upgrade` and `Connection` headers (without them, online play does not connect) and the browser's `Host` (`$http_host`, port included: the server accepts a WebSocket only from its own origin);
- `proxy_read_timeout 1h`: otherwise nginx cuts a quiet WebSocket after 60 s;
- `X-Real-IP`: the player's address as seen by nginx; the server limits connections and rooms per address;
- `location /ffimg/`: the card images, cached 60 days (1 GB at most, `/var/cache/nginx/finalcircle-ffimg`), one image per path whatever the query string, a single request to the server for an image many players ask for at once (`proxy_cache_lock`); a 503 (the CDN refuses for now) is not cached;
- HSTS: after `certbot`, add the line indicated at the top of the file to the `listen 443` block.

The file was checked with `nginx -t`, and the compiled server behind it with `tools/deploy-check.ts` (online play, the AI, the image cache `MISS` then `HIT`).

## 7. Images

Card images always go through the server (`/ffimg/`), never straight from the player's browser to Square Enix's CDN, which bans clients that ask too fast (Cloudflare). The server's relay asks for one image at a time, at least 1.1 s apart, remembers missing images for an hour, and stops asking for 30 minutes after a refusal (the cards then show their text). nginx keeps each image 60 days, and each player's browser keeps the images it has seen (service worker).

**Warming the cache** after the installation (or after adding cards), so that players never wait for the CDN:

```bash
npx tsx tools/warm-images.ts https://ff.mydomain.example    # every image of the cards, both sizes, 1.5 s apart
```

The tool stops at the first 503 (the CDN refuses for now): run it again later. Check: `curl -sI https://ff.mydomain.example/ffimg/thumbs/21-010H_fr.jpg | grep -i x-cache` gives `HIT` once warmed.

## 8. Check

```bash
npx tsx tools/deploy-check.ts https://ff.mydomain.example
```

It checks `/healthz`, the page and its security headers, the built client's files, an image of the store, online play (two players, a room, the game starts) and a game against the server's AI. Then open the site on two machines (or a normal browser and a private window) and play an online game.

## 9. Updating

```bash
cd /opt/finalcircle
./deploy/update.sh
```

The script:
1. backs up the games in progress into `data/backups/rooms-<date>-<commit>.tgz` (the last ten are kept);
2. updates the code (`git pull --ff-only`), the dependencies, the interface and the compiled server;
3. fetches the images of new cards the CDN lacks (`tools/missing-images.ts`; those already there are kept);
4. replays a copy of the games in progress with the new engine (`tools/rooms-check.ts`) and says how many will be interrupted: an update that changes the rules version (`RULES_VERSION`) interrupts the games whose fingerprints no longer match. To postpone it, stop there (Ctrl+C) and run it again when no game is in progress (`rooms` in `/healthz`);
5. restarts the server and waits for `/healthz` to answer (30 s at most).

### Rolling back

```bash
cd /opt/finalcircle
git log --oneline -5                       # the previous commit
git checkout <previous commit>
npm ci && npm run build && npm run build:server
pm2 stop finalcircle
rm -rf data/rooms && tar -xzf data/backups/rooms-<date>-<commit>.tgz -C data   # the games from before the update
pm2 start finalcircle && pm2 save
```

Restoring the backup is only useful if the games were interrupted by the new version: those played since are lost. Then go back to the branch (`git checkout master`) for the next update.

**Tabs left open:** the client sends its version (protocol and rules) when creating, joining or resuming a room. After an update, a tab running the old version reads "A new version of FinalCircle is available" and reloads; its reconnection token is kept, and the game resumes with the new version.

**Games in progress survive a restart:** each room is saved in `data/rooms/` (one file per room: the seats, then one decision per line with a fingerprint of the resulting state) and resumed at startup by replaying its decisions; the players reconnect by themselves (the browser retries for a minute). A game of another rules version resumes only if all its fingerprints match; otherwise it is interrupted (the file becomes `.rules<N>`, the player who comes back is told). Files set aside are deleted after seven days.

## Troubleshooting

Messages are quoted in English (the interface shows them in the player's language).

| Symptom | Probable cause |
|---|---|
| 502 Bad Gateway | app stopped (`pm2 status`, `pm2 logs finalcircle`) or a different port between pm2 and nginx |
| The page displays but online play never connects | `Upgrade` / `Connection` headers missing in `location /ws`, or the `Host` header not forwarded |
| Disconnections after about a minute | `proxy_read_timeout` too short in `location /ws` |
| Cards drawn from their text instead of their image | the CDN refused (`breaker: true` in the local `/healthz`; it asks again after 30 minutes), or the VPS cannot reach `fftcg.cdn.sewest.net`; for the 8 exclusives, `data/images` is missing (`tools/missing-images.ts`) |
| "Server full, try again later." | `FC_MAX_ROOMS` reached, or heap above `FC_MAX_HEAP_MB` |
| "Too many games against the AI in progress on the server" | `FC_MAX_AI_ROOMS` reached, or RSS above `FC_MAX_RSS_MB` |
| "Too many rooms open from this address" | `FC_MAX_ROOMS_PER_IP`; if every player seems to have the same address, check `X-Real-IP` in the nginx site |
| `nginx -t`: duplicate `map` | Planecircle's site already defines `$connection_upgrade`: remove the one of this file |

## Security

- The server only listens on `127.0.0.1`: it can only be reached through nginx.
- It is authoritative: decks are checked (legal in the room's format and playable), every decision is checked by the engine, no hidden information is sent to the opponent.
- No accounts or personal data: a nickname per game and a reconnection token kept in the browser; on disk, only its fingerprint (SHA-256), like that of the address of a room's creator; the files of `data/rooms` are readable only by the server's account (600).
- Content security policy: scripts and worker from the site only, images from the site (the relay) and `data:`, styles from Google Fonts, no framing by another page.
- WebSocket accepted only from the site itself (same host) or an origin of `FC_ORIGINS`; caps per address (connections, rooms), message rate limit, pings for dead connections.
- `/ffimg/`: an allow list of card image paths (never an open proxy); the CDN is asked serially, and never by the players' browsers.
- Legal: an unofficial, non-commercial fan project; card names, texts and images © SQUARE ENIX, credited on the home screen and on the drawn cards; no image in the repository.
