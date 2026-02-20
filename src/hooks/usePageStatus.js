import { useState, useEffect } from 'react';
import { supabase } from '@/lib/customSupabaseClient';

/**
 * Hook to check if a page is offline (blanked)
 * No caching - always fetches fresh from database
 */
export const usePageStatus = (pageRoute) => {
  const [isOffline, setIsOffline] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const checkPageStatus = async () => {
      try {
        console.log('[PageStatus] Checking page status for:', pageRoute);
        
        // Always fetch fresh from database
        const { data, error } = await supabase
          .from('page_status')
          .select('*')
          .eq('page_route', pageRoute)
          .maybeSingle();

        if (error) {
          console.error('[PageStatus] Query error:', error);
          setIsOffline(false);
          setErrorMessage('');
          setIsLoading(false);
          return;
        }

        if (data) {
          console.log('[PageStatus] Found page status:', { 
            route: pageRoute, 
            is_blanked: data.is_blanked, 
            error_message: data.error_message 
          });
          setIsOffline(data.is_blanked === true);
          setErrorMessage(data.error_message || '');
        } else {
          console.log('[PageStatus] No status record found for route:', pageRoute, '- page is ONLINE');
          setIsOffline(false);
          setErrorMessage('');
        }

        setIsLoading(false);
      } catch (err) {
        console.error('[PageStatus] Unexpected error:', err);
        setIsOffline(false);
        setIsLoading(false);
      }
    };

    checkPageStatus();

    // Subscribe to realtime changes
    const subscription = supabase
      .channel('page_status_changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'page_status',
          filter: `page_route=eq.${pageRoute}`
        },
        (payload) => {
          console.log('[PageStatus] Realtime update received:', payload);
          if (payload.new) {
            const isBlanked = payload.new.is_blanked === true;
            console.log('[PageStatus] Realtime update - setting offline to:', isBlanked);
            setIsOffline(isBlanked);
            setErrorMessage(payload.new.error_message || '');
          }
        }
      )
      .subscribe();

    // Poll for updates every 5 seconds (faster response)
    const interval = setInterval(checkPageStatus, 5000);

    return () => {
      clearInterval(interval);
      subscription.unsubscribe();
    };
  }, [pageRoute]);

  return { isOffline, errorMessage, isLoading };
};
