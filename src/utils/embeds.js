const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const BRAND_COLOR = 0x000000; // Black panel / brand colour
const SUCCESS_COLOR = 0x2ECC71;
const DANGER_COLOR = 0xE74C3C;
const WARNING_COLOR = 0xF39C12;
const INFO_COLOR = 0x3498DB;

function baseEmbed() {
  return new EmbedBuilder()
    .setColor(BRAND_COLOR)
    .setTimestamp()
    .setFooter({ text: 'Vanilla Works | Public Relations' });
}

function panelEmbed() {
  return new EmbedBuilder()
    .setColor(0x000000)
    .setTitle('Vanilla Works | Public Relations Department')
    .setDescription(
      'Welcome to the **Vanilla Works Public Relations Department**.\n\n' +
      'Use the buttons below to submit promotional requests, log outreach activity, check your totals, or request a server blacklist.'
    )
    .setTimestamp()
    .setFooter({ text: 'Vanilla Works | Public Relations' });
}

function panelButtons() {
  // Two rows so we don't exceed the 5-button limit
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('pr_post_request')
      .setLabel('Post Request')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('📝'),
    new ButtonBuilder()
      .setCustomId('pr_log_outreach')
      .setLabel('Log Outreach')
      .setStyle(ButtonStyle.Success)
      .setEmoji('📋'),
    new ButtonBuilder()
      .setCustomId('pr_total_outreach')
      .setLabel("Total Outreach's")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('📊'),
    new ButtonBuilder()
      .setCustomId('pr_request_blacklist')
      .setLabel('Request a Blacklist')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('⛔')
  );
  return [row1];
}

function requestTypeSelect() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('request_mutual')
      .setLabel('Mutual Giveaway Request')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('🎁'),
    new ButtonBuilder()
      .setCustomId('request_partnership')
      .setLabel('Partnership Request')
      .setStyle(ButtonStyle.Primary)
      .setEmoji('🤝')
  );
}

function statusColor(status) {
  switch (status) {
    case 'approved': return SUCCESS_COLOR;
    case 'rejected': return DANGER_COLOR;
    case 'pending': return WARNING_COLOR;
    default: return INFO_COLOR;
  }
}

function dmEmbed(title, description, color = BRAND_COLOR) {
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(description)
    .setTimestamp()
    .setFooter({ text: 'Vanilla Works | Public Relations' });
}

module.exports = {
  BRAND_COLOR,
  SUCCESS_COLOR,
  DANGER_COLOR,
  WARNING_COLOR,
  INFO_COLOR,
  baseEmbed,
  panelEmbed,
  panelButtons,
  requestTypeSelect,
  statusColor,
  dmEmbed
};
