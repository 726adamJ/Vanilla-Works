const { getConfigJSON } = require('../database');

function getManagementRoles() {
  return getConfigJSON('management_roles', []) || [];
}

function getStaffRoles() {
  return getConfigJSON('staff_roles', []) || [];
}

function hasManagementRole(member) {
  if (!member) return false;
  if (member.permissions.has('Administrator')) return true;
  const roles = getManagementRoles();
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

function canCreatePolls(member) {
  return hasManagementRole(member);
}

function canCreatePosts(member) {
  // Configurable, default to staff+
  const postRoles = getConfigJSON('post_roles', null);
  if (postRoles && postRoles.length > 0) {
    return member.roles.cache.some(r => postRoles.includes(r.id)) || hasManagementRole(member);
  }
  return hasStaffRole(member);
}

function canCreateEmbeds(member) {
  const embedRoles = getConfigJSON('embed_roles', null);
  if (embedRoles && embedRoles.length > 0) {
    return member.roles.cache.some(r => embedRoles.includes(r.id)) || hasManagementRole(member);
  }
  return hasManagementRole(member);
}

module.exports = {
  getManagementRoles,
  getStaffRoles,
  hasManagementRole,
  hasStaffRole,
  canApproveRequests,
  canCreatePolls,
  canCreatePosts,
  canCreateEmbeds
};
