
export const TICKET_STATUS = {
  OPEN: 'OPEN',
  CLOSED: 'CLOSED',
  IN_PROGRESS: 'IN_PROGRESS'
};

export const UI_TO_DB_STATUS_MAP = {
  'New': 'OPEN',
  'Pending': 'OPEN',
  'In Progress': 'IN_PROGRESS',
  'Closed': 'CLOSED',
  'open': 'OPEN',
  'in progress': 'IN_PROGRESS',
  'closed': 'CLOSED',
  '': 'OPEN',
  null: 'OPEN',
  undefined: 'OPEN'
};

export const getValidStatus = (uiStatus) => {
  if (!uiStatus) return TICKET_STATUS.OPEN;
  
  // Normalize input
  const normalized = String(uiStatus).trim();
  
  // Check direct mapping
  if (UI_TO_DB_STATUS_MAP[normalized]) {
    return UI_TO_DB_STATUS_MAP[normalized];
  }
  
  // Check case-insensitive
  const upper = normalized.toUpperCase();
  if (Object.values(TICKET_STATUS).includes(upper)) {
    return upper;
  }
  
  // Default fallback
  return TICKET_STATUS.OPEN;
};
