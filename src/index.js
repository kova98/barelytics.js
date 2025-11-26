import {record} from '@rrweb/record';
import * as fflate from "fflate";

(function initAnalytics() {
    const currentScript = document.currentScript || document.querySelector('script[data-url]');

    if (!currentScript) {
        console.error('Barelytics: Could not find script tag with data-url');
        return; 
    }
    
    let backendUrl = currentScript.getAttribute('data-url');
    const clientId = currentScript.getAttribute('data-id');
    const disableLocalhost = currentScript.getAttribute('data-disable-localhost') === 'true';

    function isLocalhost() {
        const hostname = window.location.hostname;
        return hostname === 'localhost' ||
               hostname === '127.0.0.1' ||
               hostname === '[::1]' ||
               hostname.startsWith('192.168.') ||
               hostname.startsWith('10.') ||
               hostname.endsWith('.local');
    }

    if (disableLocalhost && isLocalhost()) {
        return;
    }

    if (!backendUrl) backendUrl = 'https://api.barelytics.io/i';

    if (!clientId) {
        console.error('Barelytics: data-id attribute is required');
        return;
    }
   
    // --- Session + User tracking ---
    // Extract root domain for cross-subdomain cookies (e.g., ".barelytics.io")
    function getRootDomain() {
        const hostname = window.location.hostname;
        const parts = hostname.split('.');
        if (parts.length >= 2) {
            return '.' + parts.slice(-2).join('.');
        }
        return hostname; // fallback for localhost
    }

    const rootDomain = getRootDomain();

    function getSessionId() {
        const name = 'barelytics_sess=';
        const match = document.cookie.split('; ').find((row) => row.startsWith(name));
        if (match) return match.split('=')[1];

        // New session, we need to take a snapshot
        window.sessionChanged = true;

        const id = crypto.randomUUID();
        document.cookie = `barelytics_sess=${id}; path=/; max-age=1800; domain=${rootDomain}`;
        return id;
    }

    function getDistinctId() {
        // Try cookie first (works across subdomains)
        const name = 'barelytics_id=';
        const match = document.cookie.split('; ').find((row) => row.startsWith(name));
        if (match) return match.split('=')[1];

        // Fallback to localStorage for backwards compatibility
        let distinctId = localStorage.getItem('barelytics_id');
        if (!distinctId) {
            distinctId = crypto.randomUUID();
        }

        // Store in both cookie (for cross-subdomain) and localStorage (as backup)
        document.cookie = `barelytics_id=${distinctId}; path=/; max-age=31536000; domain=${rootDomain}`; // 1 year
        localStorage.setItem('barelytics_id', distinctId);

        return distinctId;
    }

    const sessionId = getSessionId();
    const distinctId = getDistinctId();

    // --- rrweb recording ---
    let replayEvents = [];
    let recordStopFn = null;

    function startRecording() {
        recordStopFn = record({ 
            maskAllInputs: true,
            recordCanvas: false,
            recordCrossOriginIframes: false,
            emit(event) {
                replayEvents.push(event);
            },
        });

        if (window.sessionChanged) {
            record.takeFullSnapshot();
        }

        return recordStopFn;
    }

    if (document.readyState === 'complete') {
        startRecording();
    } else {
        window.addEventListener('load', startRecording);
    }

    function sendEvent(type, extra = {}) {
        const payload = {
            sessionId: sessionId,
            distinctId: distinctId,
            clientId: clientId,
            type,
            url: window.location.href,
            referrer: document.referrer,
            userAgent: navigator.userAgent,
            timestamp: new Date().toISOString(),
            ...extra,
        };
        const compressed = fflate.gzipSync(new TextEncoder().encode(JSON.stringify(payload)));


        if (type === 'replay') {
            fetch(backendUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: compressed,
            })
        }
        else {
            navigator.sendBeacon(backendUrl, compressed);
        }
    }

    function flushReplays() {
        if (replayEvents.length === 0) return;
        const events = replayEvents.splice(0);
        sendEvent('replay', {events: events});
    }

    setInterval(flushReplays, 5000); // every 5 seconds

    // --- Page views + navigation tracking ---
    function sendPageView() {
        sendEvent('page_view');
    }

    sendPageView();

    // --- Public API ---
    window.barelytics = {
        capture(name) {
            sendEvent('custom', { name });
        },
        flushReplays, // manual trigger if you want
    };
})();
