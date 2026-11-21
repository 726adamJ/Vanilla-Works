/** Known copyable field keys (longest first for matching). */
const COPY_FIELDS = [
  'partners_ad',
  'server_name',
  'their_ping',
  'our_ping',
  'duration',
  'invite',
  'prize'
];

function copyButtonId(reqId, fieldKey) {
  // Use :: so field keys with underscores never break parsing
  return 'copy_' + reqId + '::' + fieldKey;
}

function parseCopyCustomId(customId) {
  if (!customId.startsWith('copy_')) return null;
  const payload = customId.slice(5);

  // New format: REQ-XXX::field_key
  if (payload.includes('::')) {
    const idx = payload.indexOf('::');
    return {
      reqId: payload.slice(0, idx),
      fieldKey: payload.slice(idx + 2)
    };
  }

  // Legacy format: REQ-XXX_field_key (field may contain underscores)
  for (const key of COPY_FIELDS) {
    const suffix = '_' + key;
    if (payload.endsWith(suffix)) {
      return {
        reqId: payload.slice(0, -suffix.length),
        fieldKey: key
      };
    }
  }

  // Fallback: last _ segment
  const parts = payload.split('_');
  if (parts.length < 2) return null;
  const fieldKey = parts.pop();
  return { reqId: parts.join('_'), fieldKey };
}

module.exports = { COPY_FIELDS, copyButtonId, parseCopyCustomId };
