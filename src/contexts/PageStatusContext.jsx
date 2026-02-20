import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/customSupabaseClient';

const PageStatusContext = createContext(null);

export const PageStatusProvider = ({ children }) => {
  const [pageStatuses, setPageStatuses] = useState({});
  const [isLoading, setIsLoading] = useState(true);

  // Prevent noisy logs + aggressive polling in dev.
  // Enable logs only when you explicitly want them:
  //   VITE_DEBUG_PAGE_STATUS=true
  const DEBUG = Boolean(import.meta?.env?.VITE_DEBUG_PAGE_STATUS === 'true');
  const pollRef = useRef(null);

  useEffect(() => {
    const fetchAllPageStatuses = async () => {
      try {
        if (DEBUG) console.log('[PageStatusContext] Fetching all page statuses...');

        const { data, error } = await supabase
          .from('page_status')
          .select('*');

        if (error) {
          console.error('[PageStatusContext] Error fetching statuses:', error);
          setIsLoading(false);
          return;
        }

        const statusMap = {};
        if (data) {
          data.forEach(page => {
            statusMap[page.page_route] = {
              is_blanked: page.is_blanked === true,
              error_message: page.error_message || ''
            };
            if (DEBUG) console.log('[PageStatusContext] Loaded:', page.page_route, { is_blanked: page.is_blanked });
          });
        }

        setPageStatuses(statusMap);
        if (DEBUG) console.log('[PageStatusContext] All page statuses loaded:', statusMap);
        setIsLoading(false);
      } catch (err) {
        console.error('[PageStatusContext] Exception:', err);
        setIsLoading(false);
      }
    };

    fetchAllPageStatuses();

    const subscription = supabase
      .channel('all_page_statuses', { config: { broadcast: { self: true } } })
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'page_status' },
        (payload) => {
          if (DEBUG) console.log('[PageStatusContext] Realtime UPDATE received:', payload);

          if (payload.new) {
            const route = payload.new.page_route;
            const isBlanked = payload.new.is_blanked === true;

            setPageStatuses(prev => ({
              ...prev,
              [route]: {
                is_blanked: isBlanked,
                error_message: payload.new.error_message || ''
              }
            }));
          }
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'page_status' },
        (payload) => {
          if (DEBUG) console.log('[PageStatusContext] Realtime INSERT received:', payload);

          if (payload.new) {
            const route = payload.new.page_route;
            const isBlanked = payload.new.is_blanked === true;

            setPageStatuses(prev => ({
              ...prev,
              [route]: {
                is_blanked: isBlanked,
                error_message: payload.new.error_message || ''
              }
            }));
          }
        }
      )
      .subscribe((status) => {
        if (DEBUG) console.log('[PageStatusContext] Subscription status:', status);

        const isSubscribed = String(status).toUpperCase() === 'SUBSCRIBED';

        // Only poll as a fallback when realtime isn't subscribed.
        if (!isSubscribed && !pollRef.current) {
          pollRef.current = setInterval(fetchAllPageStatuses, 30000);
        }

        if (isSubscribed && pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      });

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
      subscription.unsubscribe();
    };
  }, []);

  const getPageStatus = (pageRoute) => {
    return pageStatuses[pageRoute] || { is_blanked: false, error_message: '' };
  };

  const isPageOffline = (pageRoute) => {
    return pageStatuses[pageRoute]?.is_blanked === true;
  };

  return (
    <PageStatusContext.Provider value={{ pageStatuses, isLoading, getPageStatus, isPageOffline }}>
      {children}
    </PageStatusContext.Provider>
  );
};

export const usePageStatusContext = () => {
  const context = useContext(PageStatusContext);
  if (!context) {
    throw new Error('usePageStatusContext must be used within PageStatusProvider');
  }
  return context;
};
