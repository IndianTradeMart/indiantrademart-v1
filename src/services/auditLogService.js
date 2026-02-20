import { supabase } from '@/lib/customSupabaseClient';

/**
 * Service for logging superadmin actions to audit_logs table
 */
export const auditLogService = {
  /**
   * Log a superadmin action
   * @param {string} superAdminId - ID of superadmin performing action
   * @param {string} action - Description of action (e.g., 'USER_CREATED', 'PAGE_BLANKED')
   * @param {string} entityType - Type of entity affected (e.g., 'USER', 'PAGE')
   * @param {string} entityId - ID of affected entity
   * @param {object} details - Additional details about the action
   * @returns {Promise<boolean>} Success status
   */
  async logAction(superAdminId, action, entityType, entityId, details = {}) {
    try {
      const { error } = await supabase.from('audit_logs').insert([
        {
          user_id: superAdminId,
          action: action,
          entity_type: entityType,
          entity_id: entityId,
          details: details,
          ip_address: this._getClientIP(),
          created_at: new Date().toISOString()
        }
      ]);

      if (error) {
        console.error('[AuditLog] Error logging action:', error);
        return false;
      }

      console.log(`[AuditLog] Action logged: ${action} on ${entityType}#${entityId}`);
      return true;
    } catch (err) {
      console.error('[AuditLog] Exception:', err);
      return false;
    }
  },

  /**
   * Get audit logs for a specific time period
   * @param {number} limit - Number of logs to fetch
   * @param {number} hoursBack - Number of hours to look back
   * @returns {Promise<Array>} Array of audit logs
   */
  async getAuditLogs(limit = 100, hoursBack = 24) {
    try {
      const cutoffTime = new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString();

      const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .gte('created_at', cutoffTime)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('[AuditLog] Error fetching logs:', error);
        return [];
      }

      return data || [];
    } catch (err) {
      console.error('[AuditLog] Exception:', err);
      return [];
    }
  },

  /**
   * Get audit logs for a specific user
   * @param {string} userId - User ID to fetch logs for
   * @param {number} limit - Number of logs to fetch
   * @returns {Promise<Array>} Array of audit logs
   */
  async getAuditLogsByUser(userId, limit = 100) {
    try {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('[AuditLog] Error fetching user logs:', error);
        return [];
      }

      return data || [];
    } catch (err) {
      console.error('[AuditLog] Exception:', err);
      return [];
    }
  },

  /**
   * Get audit logs for a specific entity
   * @param {string} entityType - Type of entity
   * @param {string} entityId - ID of entity
   * @param {number} limit - Number of logs to fetch
   * @returns {Promise<Array>} Array of audit logs
   */
  async getAuditLogsByEntity(entityType, entityId, limit = 50) {
    try {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .eq('entity_type', entityType)
        .eq('entity_id', entityId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) {
        console.error('[AuditLog] Error fetching entity logs:', error);
        return [];
      }

      return data || [];
    } catch (err) {
      console.error('[AuditLog] Exception:', err);
      return [];
    }
  },

  /**
   * Helper to get client IP address (note: this is approximate in browser)
   * @returns {string} Client IP or 'UNKNOWN'
   */
  _getClientIP() {
    // In a real app, you'd get this from the server
    // For now, return a placeholder
    return 'CLIENT_IP';
  }
};
