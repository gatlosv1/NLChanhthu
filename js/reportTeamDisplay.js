const teamDisplayNameMap = new Map();

function normalizeKey(value) {
  return String(value || '').trim().toLowerCase();
}

export function setTeamDisplayNameMap(teams = []) {
  teamDisplayNameMap.clear();
  teams.forEach((team) => {
    const teamId = team?.id || team;
    const teamName = team?.name || teamId;
    if (teamId) {
      teamDisplayNameMap.set(normalizeKey(teamId), teamName);
      teamDisplayNameMap.set(normalizeKey(teamName), teamName);
    }
  });
}

export function resolveTeamDisplayName(value) {
  if (value === undefined || value === null || value === '') {
    return 'Chưa phân nhóm';
  }

  const rawValue = String(value).trim();
  if (!rawValue) {
    return 'Chưa phân nhóm';
  }

  const directMatch = teamDisplayNameMap.get(normalizeKey(rawValue));
  if (directMatch) {
    return directMatch;
  }

  return rawValue;
}

export function getRowTeam(row) {
  const rawValue = row?.teamName || row?.team || row?.teamId || row?.group || row?.to;
  return resolveTeamDisplayName(rawValue);
}
