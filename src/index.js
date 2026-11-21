require('dotenv').config();
const { Client, GatewayIntentBits, Partials, Collection } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { db } = require('./database');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages
  ],
  partials: [Partials.Channel, Partials.Message, Partials.User]
});

client.commands = new Collection();

// Load commands
const commandsPath = path.join(__dirname, 'commands');
if (fs.existsSync(commandsPath)) {
  const commandFiles = fs.readdirSync(commandsPath).filter(f => f.endsWith('.js'));
  for (const file of commandFiles) {
    const command = require(path.join(commandsPath, file));
    if (command.data && command.execute) {
      client.commands.set(command.data.name, command);
    }
  }
}

// Load events — only explicit event files (never cache/runtime/partials)
const eventsPath = path.join(__dirname, 'events');
const EVENT_FILES = [
  'ready.js',
  'interactionCreate.js',
  'messageCreate.js',
  'messageDelete.js'
];
for (const file of EVENT_FILES) {
  const full = path.join(eventsPath, file);
  if (!fs.existsSync(full)) continue;
  const event = require(full);
  if (!event || !event.name || !event.execute) continue;
  if (event.once) {
    client.once(event.name, (...args) => event.execute(...args, client));
  } else {
    client.on(event.name, (...args) => event.execute(...args, client));
  }
  console.log('Loaded event:', event.name, '(' + file + ')');
}

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('Shutting down...');
  db.close();
  process.exit(0);
});

client.login(process.env.DISCORD_TOKEN);
