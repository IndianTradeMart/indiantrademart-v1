import React, { useMemo, useState, useEffect } from 'react';
import { usePageStatusContext } from '@/contexts/PageStatusContext';
import { supabase } from '@/lib/customSupabaseClient';
import { AlertTriangle, Loader2 } from 'lucide-react';

/**
 * Component that wraps page content and shows offline message if page is blanked
 * Usage: <PageStatusWrapper pageRoute="/vendor" children={<YourComponent />} />
 */
const PageStatusWrapper = ({ pageRoute, children }) => {
  const { getPageStatus } = usePageStatusContext();
  const [localStatus, setLocalStatus] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // Context status
  const contextPageStatus = useMemo(
    () => getPageStatus(pageRoute),
    [pageRoute, getPageStatus]
  );

  // Check directly from DB to override context if needed
  useEffect(() => {
    const checkDirectly = async () => {
      try {
        const { data, error } = await supabase
          .from('page_status')
          .select('*')
          .eq('page_route', pageRoute)
          .maybeSingle();

        if (error) {
          console.error('[PageStatusWrapper] Direct check error:', error);
          setLocalStatus(null);
        } else if (data) {
          setLocalStatus({
            is_blanked: data.is_blanked === true,
            error_message: data.error_message || ''
          });
        } else {
          setLocalStatus({ is_blanked: false, error_message: '' });
        }
        setIsLoading(false);
      } catch (err) {
        console.error('[PageStatusWrapper] Direct check exception:', err);
        setIsLoading(false);
      }
    };

    checkDirectly();
    const interval = setInterval(checkDirectly, 3000);

    return () => clearInterval(interval);
  }, [pageRoute]);

  const status = localStatus || contextPageStatus;
  const isOffline = status?.is_blanked === true;
  const errorMessage = status?.error_message || '';

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (isOffline) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 to-orange-50 flex items-center justify-center px-4">
        <div className="max-w-md bg-white rounded-xl shadow-lg p-8 text-center border-t-4 border-red-500">
          <div className="flex justify-center mb-4">
            <div className="p-3 bg-red-100 rounded-full">
              <AlertTriangle className="h-8 w-8 text-red-600" />
            </div>
          </div>

          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Service Temporarily Unavailable
          </h1>

          <p className="text-gray-600 mb-4">
            {errorMessage || 'This section is currently offline for maintenance. Please try again later.'}
          </p>

          <div className="text-sm text-gray-500 bg-gray-50 p-3 rounded">
            <p>If this issue persists, please contact support at:</p>
            <p className="font-mono text-blue-600 mt-1">support@indiantrademart.com</p>
          </div>
        </div>
      </div>
    );
  }

  return children;
};

export default PageStatusWrapper;