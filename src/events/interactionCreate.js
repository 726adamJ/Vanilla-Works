const fs = require('fs');
const path = require('path');
const Module = require('module');

const CACHE = path.join(__dirname, 'interactionCreate.cache.js');
const SOURCE_URL =
  'https://raw.githubusercontent.com/726adamJ/Vanilla-Works/16a736f31a80c440713f4c85baeff38e8503d24a/src/events/interactionCreate.js';

function patch(code) {
  const oldStr =
    "async function handleModal(interaction, client) {\n  const id = interaction.customId;\n  if (id === 'modal_mutual_giveaway') return handleMutualSubmit(interaction, client);";
  const newStr =
    "async function handleModal(interaction, client) {\n  const id = interaction.customId;\n  if (id === 'modal_cooldown_import') {\n    const { handleCooldownImportModal } = require('../commands/cooldown');\n    return handleCooldownImportModal(interaction, client);\n  }\n  if (id === 'modal_mutual_giveaway') return handleMutualSubmit(interaction, client);";
  if (code.includes(oldStr)) return code.replace(oldStr, newStr);
  if (code.includes('modal_cooldown_import')) return code;
  return code;
}

function loadFromCode(code) {
  const m = new Module(path.join(__dirname, 'interactionCreate.runtime.js'));
  m.filename = path.join(__dirname, 'interactionCreate.runtime.js');
  m.paths = module.paths;
  m._compile(code, m.filename);
  return m.exports;
}

let exportsObj;

if (fs.existsSync(CACHE)) {
  exportsObj = loadFromCode(patch(fs.readFileSync(CACHE, 'utf8')));
} else {
  try {
    const { execSync } = require('child_process');
    const code = execSync('curl -fsSL ' + JSON.stringify(SOURCE_URL), {
      encoding: 'utf8',
      maxBuffer: 5 * 1024 * 1024
    });
    const patched = patch(code);
    fs.writeFileSync(CACHE, patched);
    exportsObj = loadFromCode(patched);
  } catch (e) {
    console.error('[interactionCreate] Failed to bootstrap handlers:', e.message);
    exportsObj = {
      name: 'interactionCreate',
      async execute(interaction) {
        if (interaction.isRepliable && interaction.isRepliable()) {
          await interaction.reply({
            content: 'Bot handlers are still loading. Please restart the bot once.',
            ephemeral: true
          }).catch(() => {});
        }
      }
    };
  }
}

module.exports = exportsObj;
