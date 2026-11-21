const {
  MessageFlags,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');
const { hasStaffRole, canApproveRequests, canUseSlashCommands, getStaffRank, getPayRates } = require('../utils/permissions');
const { dmEmbed, baseEmbed, statusColor, SUCCESS_COLOR, DANGER_COLOR, logTypeSelect } = require('../utils/embeds');

const part1 = require('./part1');
const part2 = require('./part2');

const fn = new Function(
  'MessageFlags','ActionRowBuilder','ButtonBuilder','ButtonStyle','ModalBuilder','TextInputBuilder','TextInputStyle',
  'hasStaffRole','canApproveRequests','canUseSlashCommands','getStaffRank','getPayRates',
  'dmEmbed','baseEmbed','statusColor','SUCCESS_COLOR','DANGER_COLOR','logTypeSelect',
  part1 + '\n' + part2 + '\nreturn { handleButton, handleModal };'
);

module.exports = fn(
  MessageFlags, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle,
  hasStaffRole, canApproveRequests, canUseSlashCommands, getStaffRank, getPayRates,
  dmEmbed, baseEmbed, statusColor, SUCCESS_COLOR, DANGER_COLOR, logTypeSelect
);
