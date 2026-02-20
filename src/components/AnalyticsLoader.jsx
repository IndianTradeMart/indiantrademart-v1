import { useEffect } from 'react';

const GTAG_ID = import.meta.env.VITE_GTAG_ID || 'G-XGPYTMRKW2';

const loadGtag = () => {
  if (!GTAG_ID) return;
  if (document.querySelector(`script[data-gtag="${GTAG_ID}"]`)) return;

  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${GTAG_ID}`;
  script.dataset.gtag = GTAG_ID;
  document.head.appendChild(script);

  window.dataLayer = window.dataLayer || [];
  function gtag() {
    window.dataLayer.push(arguments);
  }
  window.gtag = window.gtag || gtag;
  window.gtag('js', new Date());
  window.gtag('config', GTAG_ID, { anonymize_ip: true, transport_type: 'beacon' });
};

const scheduleLoad = () => {
  if (typeof window === 'undefined') return;
  if ('requestIdleCallback' in window) {
    window.requestIdleCallback(loadGtag, { timeout: 2000 });
  } else {
    setTimeout(loadGtag, 1200);
  }
};

const AnalyticsLoader = () => {
  useEffect(() => {
    if (!import.meta.env.PROD) return;
    scheduleLoad();
  }, []);

  return null;
};

export default AnalyticsLoader;
