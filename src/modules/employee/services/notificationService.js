import { supabase } from '@/lib/customSupabaseClient';

const getUser = async () => {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");
  return user;
};

export const notificationService = {
  // Send notification to a specific user
  sendNotification: async (userId, type, title, message, link = null) => {
    try {
      const { data, error } = await supabase
        .from('notifications')
        .insert([{
          user_id: userId,
          type,
          title,
          message,
          link,
          is_read: false,
          created_at: new Date().toISOString()
        }])
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error sending notification:', error);
      throw error;
    }
  },

  // Send notifications to all users with a specific role
  sendNotificationToRole: async (role, type, title, message, link = null) => {
    try {
      // Get all employees with the specified role
      const { data: employees, error: empError } = await supabase
        .from('employees')
        .select('user_id')
        .eq('role', role);

      if (empError) throw empError;
      if (!employees || employees.length === 0) return [];

      // Send notification to each employee
      const userIds = employees.map(emp => emp.user_id);
      const notifications = userIds.map(userId => ({
        user_id: userId,
        type,
        title,
        message,
        link,
        is_read: false,
        created_at: new Date().toISOString()
      }));

      const { data, error } = await supabase
        .from('notifications')
        .insert(notifications)
        .select();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error sending notification to role:', error);
      throw error;
    }
  },

  // Get notifications for current user
  getNotifications: async (userId, limit = 50) => {
    try {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching notifications:', error);
      throw error;
    }
  },

  // Get unread notification count
  getUnreadCount: async (userId) => {
    try {
      const { count, error } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('is_read', false);

      if (error) throw error;
      return count || 0;
    } catch (error) {
      console.error('Error fetching unread count:', error);
      return 0;
    }
  },

  // Mark notification as read
  markAsRead: async (notificationId) => {
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', notificationId);

      if (error) throw error;
    } catch (error) {
      console.error('Error marking notification as read:', error);
      throw error;
    }
  },

  // Mark all notifications as read for a user
  markAllAsRead: async (userId) => {
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', userId)
        .eq('is_read', false);

      if (error) throw error;
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
      throw error;
    }
  },

  // Delete a notification
  deleteNotification: async (notificationId) => {
    try {
      const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('id', notificationId);

      if (error) throw error;
    } catch (error) {
      console.error('Error deleting notification:', error);
      throw error;
    }
  },

  // Subscribe to real-time notifications
  subscribeToNotifications: (userId, callback) => {
    const subscription = supabase
      .channel(`notifications:${userId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`
        },
        (payload) => callback(payload.new)
      )
      .subscribe();

    return subscription;
  }
};
