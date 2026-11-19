const { getConfigJSON, getConfig } = require('../database');

function getManagementRoles() {
  return getConfigJSON('management_roles', []) || [];
}

function getStaffRoles() {
  return getConfigJSON('staff_roles', []) || [];
}

function hasManagementRole(member) {
  if (!member) return false;
  if (member.permissions && member.permissions.has('Administrator')) return true;
  const roles = getManagementRoles();
  if (!roles.length) return member.permissions && member.permissions.has('Administrator');
  return member.roles.cache.some(r => roles.includes(r.id));
}

function hasStaffRole(member) {
  if (!member) return false;
  if (hasManagementRole(member)) return true;
  const roles = getStaffRoles();
  return member.roles.cache.some(r => roles.includes(r.id));
}

function canApproveRequests(member) {
  return hasManagementRole(member);
}

function canUseSlashCommands(member) {
  return hasManagementRole(member);
}

function canCreateEmbeds(member) {
  return hasManagementRole(member);
}

function getStaffRank(member) {
  const seniorId = getConfig('senior_pr_role');
  const juniorId = getConfig('junior_pr_role');
  if (seniorId && member.roles.cache.has(seniorId)) return 'Senior';
  if (juniorId && member.roles.cache.has(juniorId)) return 'Junior';
  // Default to Junior if no rank role assigned
  return 'Junior';
}

function getPayRates(rank) {
  if (rank === 'Senior') {
    return { partnership: 60, mutual: 65, invite: 40 };
  }
  return { partnership: 50, mutual: 55, invite: 40 };
}

module.exports = {
  getManagementRoles,
  getStaffRoles,
  hasManagementRole,
  hasStaffRole,
  canApproveRequests,
  canUseSlashCommands,
  canCreateEmbeds,
  getStaffRank,
  getPayRates
};
