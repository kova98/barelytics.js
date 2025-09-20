// Auto-initialize when script loads
(function initAnalytics() {
  // Get configuration from script tag data attributes
  const currentScript = document.currentScript || document.querySelector('script[data-url]');
  
  if (!currentScript) {
    console.error('Barelytics: Could not find script tag with data-url attribute');
    return;
  }
  
  let backendUrl = currentScript.getAttribute('data-url');
  const clientId = currentScript.getAttribute('data-id');
  
  if (!backendUrl) {
      backendUrl = 'https://api.barelytics.com/event';
  }
  
  if (!clientId) {
    console.error('Barelytics: data-id attribute is required');
    return;
  }
  
  function getSessionId() {
    const name = 'analytics_session=';
    const match = document.cookie.split('; ').find((row) => row.startsWith(name));
    if (match) return match.split('=')[1];
    const id = crypto.randomUUID();
    document.cookie = `analytics_session=${id}; path=/; max-age=1800`;
    return id;
  }

  function getUserId() {
    let userId = localStorage.getItem('barelytics_user_id');
    if (!userId) {
      userId = crypto.randomUUID();
      localStorage.setItem('barelytics_user_id', userId);
    }
    return userId;
  }

  function detectDevice() {
    const userAgent = navigator.userAgent;

    // Device Type Detection
    const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);
    const isTablet =
      /iPad|Android(?=.*\bMobile\b)(?=.*(?:\bTablet\b|\bSM-T))|KFAPWI|LG-V909|SM-T|GT-P|SCH-I800|Kindle|Silk.*Accelerated|Android.*(?:\bTablet\b|\bSM-T|\bSCH-I800)/i.test(
        userAgent
      );

    let deviceType = 'desktop';
    if (isTablet) {
      deviceType = 'tablet';
    } else if (isMobile) {
      deviceType = 'mobile';
    }

    // OS Detection
    let device_os = 'unknown';
    if (/Android/i.test(userAgent)) {
      device_os = 'android';
    } else if (/iPhone|iPad|iPod/i.test(userAgent)) {
      device_os = 'ios';
    } else if (/Macintosh|Mac OS X/i.test(userAgent)) {
      device_os = 'macos';
    } else if (/Windows NT/i.test(userAgent)) {
      device_os = 'windows';
    } else if (/Linux/i.test(userAgent) && !/Android/i.test(userAgent)) {
      device_os = 'linux';
    }

    // Browser Detection
    let device_browser = 'unknown';
    if (/Chrome/i.test(userAgent) && !/Edge/i.test(userAgent)) {
      device_browser = 'chrome';
    } else if (/Firefox/i.test(userAgent)) {
      device_browser = 'firefox';
    } else if (/Safari/i.test(userAgent) && !/Chrome/i.test(userAgent)) {
      device_browser = 'safari';
    } else if (/Edge/i.test(userAgent)) {
      device_browser = 'edge';
    } else if (/Opera|OPR/i.test(userAgent)) {
      device_browser = 'opera';
    }

    return {
      device_type: deviceType,
      device_os,
      device_browser,
    };
  }

  const sessionId = getSessionId();
  const deviceInfo = detectDevice();

  function sendEvent(type, name) {
    const payload = {
      session_id: sessionId,
      type,
      name,
      url: window.location.href,
      referrer: document.referrer,
      user_agent: navigator.userAgent,
      timestamp: new Date().toISOString(),
      user_id: getUserId(),
      client_id: clientId,
      ...deviceInfo,
    };
    navigator.sendBeacon(backendUrl, JSON.stringify(payload));
  }

  // initial page view
  sendEvent('page_view');

  // track route changes (Next.js router)
  window.addEventListener('popstate', () => sendEvent('page_view'));

  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;

  history.pushState = function (...args) {
    originalPushState.apply(this, args);
    setTimeout(() => sendEvent('page_view'), 0);
  };

  history.replaceState = function (...args) {
    originalReplaceState.apply(this, args);
    setTimeout(() => sendEvent('page_view'), 0);
  };

  // Expose public API
  window.barelytics = {
    capture: function (name) {
      sendEvent('custom', name);
    },
  };
})();
