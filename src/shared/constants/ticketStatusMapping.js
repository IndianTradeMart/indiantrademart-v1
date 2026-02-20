
export const TICKET_STATUS_MAP = {
  // UI variations
  'New': 'OPEN',
  'Pending': 'OPEN',
  'In Progress': 'IN_PROGRESS',
  'Closed': 'CLOSED',
  
  // Lowercase
  'new': 'OPEN',
  'pending': 'OPEN',
  'open': 'OPEN',
  'in progress': 'IN_PROGRESS',
  'closed': 'CLOSED',
  
  // Uppercase (Valid DB values)
  'OPEN': 'OPEN',
  'IN_PROGRESS': 'IN_PROGRESS',
  'CLOSED': 'CLOSED',
  
  // Empty/Null
  '': 'OPEN',
  null: 'OPEN',
  undefined: 'OPEN'
};

/**
 * Maps any UI status string to a valid database status enum.
 * Defaults to 'OPEN' if the input is unrecognized.
 * 
 * @param {string} status - The status string from UI or input
 * @returns {string} - Valid DB status ('OPEN', 'IN_PROGRESS', 'CLOSED')
 */
export const mapStatusToValid = (status) => {
  if (typeof status !== 'string') return 'OPEN';
  return TICKET_STATUS_MAP[status] || TICKET_STATUS_MAP[status.trim()] || 'OPEN';
};
