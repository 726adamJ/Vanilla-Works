# Vanilla Works | Public Relations Management Bot

A professional Discord bot built for the **Vanilla Works Public Relations Department**.  
It centralises PR operations through a single permanent Staff PR Panel and supporting slash commands.

## Features

- **Central Staff PR Panel** – Permanent embed with buttons for Post Request, Log Outreach, Department Polls and Staff Posts
- **Promotional Request System**
  - Mutual Giveaway Requests (modal + management approval/rejection with mandatory reason + DM notifications)
  - Partnership Requests (full ad support + same approval flow)
- **Individual Staff Outreach Logging**
  - Per-staff Discord threads
  - Evidence image support
  - Configurable notification role ping
- **Department Poll System**
  - Multi-select / single-choice
  - Anonymous or public
  - Live vote counts + automatic expiry
- **Staff Posts** (Instagram-style)
  - Caption + photo + optional ping
  - Interactive Like button with live counter
- **Custom Embed Builder**
  - Preview → Publish / Cancel
  - Colour presets + HEX support
- **Full Permission & Config System**
  - Management / Staff roles
  - Configurable channels & roles via `/config`
- **Management Reporting**
  - `/pr stats`, `/pr pending`, `/pr history`, `/pr staff`, `/pr staffstats`

All data is persisted in SQLite (`better-sqlite3`) and survives bot restarts.

## Tech Stack

- Node.js 18+
- discord.js v14
- better-sqlite3
- dotenv + uuid

## Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/726adamJ/Vanilla-Works.git
   cd Vanilla-Works
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment**
   ```bash
   cp .env.example .env
   ```
   Fill in:
   ```env
   DISCORD_TOKEN=your_bot_token
   CLIENT_ID=your_application_client_id
   GUILD_ID=your_guild_id          # optional – speeds up command deployment
   DATABASE_PATH=./data/bot.db    # optional
   ```

4. **Deploy slash commands**
   ```bash
   npm run deploy
   ```

5. **Start the bot**
   ```bash
   npm start
   ```

## First-time Configuration

After the bot is online, run these as an administrator:

```
/config set key:Approval Channel channel:#pr-approvals
/config set key:Poll Channel channel:#department-polls
/config set key:Staff Post Channel channel:#staff-posts
/config set key:Outreach Notification Role role:@PR-Notify
/config set key:Management Roles roles:@Management
/config set key:Staff Roles roles:@PR-Staff
```

Then create the permanent panel:

```
/panel create
```

Assign outreach threads for each staff member:

```
/staff log action:setup member:@StaffMember thread:THREAD_ID_OR_LINK
```

## Command Reference

| Command | Description | Permission |
|---------|-------------|------------|
| `/panel create` / `update` | Create or refresh the central Staff PR Panel | Admin / Management |
| `/staff log setup/edit/remove/view` | Manage per-staff outreach threads | Admin / Management |
| `/poll create` / `end` | Create or manually close department polls | Management |
| `/post create` / `remove` | Publish or remove staff posts | Staff+ (configurable) |
| `/embed create` / `delete` | Custom embed builder + delete | Management (configurable) |
| `/config set` / `view` | Configure channels, roles & permissions | Admin / Management |
| `/pr stats` | Department-wide statistics | Management |
| `/pr pending` | List open requests | Management |
| `/pr history` | Recent request history | Management |
| `/pr staff` | List staff ↔ thread assignments | Management |
| `/pr staffstats` | Individual staff activity | Management |

## Panel Buttons

- **Post Request** → Mutual Giveaway or Partnership modal → sent to approval channel
- **Log Outreach** → Modal → optional evidence image → delivered to the staff member’s private thread + role ping
- **Department Polls** → Points users to `/poll create`
- **Staff Posts** → Points users to `/post create`

## Notes

- Discord modals are limited to 5 text inputs. For Mutual Giveaway the winners field is combined into the Duration field (e.g. `24h, 3 winners`).
- Evidence images are collected via a short-lived message collector after the outreach modal.
- Poll results update live on every vote.
- All interactive buttons remain functional after bot restarts (state is stored in the database).

## License

MIT
