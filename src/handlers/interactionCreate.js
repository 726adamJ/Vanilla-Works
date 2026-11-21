const fs = require('fs');
const path = require('path');
const Module = require('module');
const https = require('https');

const PARTS_DIR = path.join(__dirname, 'ic');
const CACHE = path.join(process.cwd(), 'data', 'interactionCreate.cache.js');
const SOURCE_URL =
  'https://raw.githubusercontent.com/726adamJ/Vanilla-Works/16a736f31a80c440713f4c85baeff38e8503d24a/src/events/interactionCreate.js';

function patch(code) {
  const oldStr =
    "async function handleModal(interaction, client) {\n  const id = interaction.customId;\n  if (id === 'modal_mutual_giveaway') return handleMutualSubmit(interaction, client);";
  const newStr =
    "async function handleModal(interaction, client) {\n  const id = interaction.customId;\n  if (id === 'modal_cooldown_import') {\n    const { handleCooldownImportModal } = require('../commands/cooldown');\n    return handleCooldownImportModal(interaction, client);\n  }\n  if (id === 'modal_mutual_giveaway') return handleMutualSubmit(interaction, client);";
  if (code.includes('modal_cooldown_import')) return code;
  if (code.includes(oldStr)) return code.replace(oldStr, newStr);
  return code;
}

function loadFromCode(code) {
  const filename = path.join(__dirname, 'interactionCreate.runtime.js');
  const m = new Module(filename);
  m.filename = filename;
  m.paths = module.paths;
  m._compile(code, filename);
  return m.exports;
}

function ensureDataDir() {
  const dir = path.dirname(CACHE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function loadFromParts() {
  if (!fs.existsSync(PARTS_DIR)) return null;
  const files = ['c1.js', 'c2.js', 'c3.js']
    .map((f) => path.join(PARTS_DIR, f))
    .filter((f) => fs.existsSync(f));
  if (files.length !== 3) return null;
  const code = files.map((f) => fs.readFileSync(f, 'utf8')).join('');
  if (code.length < 1000) return null; // placeholders
  return loadFromCode(patch(code));
}

function downloadSync(url) {
  const { execSync } = require('child_process');
  return execSync('curl -fsSL ' + JSON.stringify(url), {
    encoding: 'utf8',
    maxBuffer: 5 * 1024 * 1024
  });
}

let exported;

// 1) Prefer local parts (if committed fully)
try {
  exported = loadFromParts();
} catch (e) {
  console.error('[handlers] parts load failed:', e.message);
}

// 2) Cache in /data (NOT in events/)
if (!exported) {
  try {
    if (fs.existsSync(CACHE)) {
      exported = loadFromCode(patch(fs.readFileSync(CACHE, 'utf8')));
    }
  } catch (e) {
    console.error('[handlers] cache load failed:', e.message);
  }
}

// 3) Download once and cache
if (!exported) {
  try {
    ensureDataDir();
    const code = downloadSync(SOURCE_URL);
    const patched = patch(code);
    fs.writeFileSync(CACHE, patched);
    exported = loadFromCode(patched);
    console.log('[handlers] Bootstrapped interactionCreate from GitHub and cached.');
  } catch (e) {
    console.error('[handlers] bootstrap failed:', e.message);
  }
}

if (!exported) {
  exported = {
    name: 'interactionCreate',
    async execute(interaction) {
      console.error('[handlers] interactionCreate unavailable');
      try {
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({
            content: 'Handler failed to load. Please restart the bot or contact the owner.',
            ephemeral: true
          });
        }
      } catch {}
    }
  };
}

module.exports = exported;
