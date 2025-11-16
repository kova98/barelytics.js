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

    if (!backendUrl) backendUrl = 'https://api.barelytics.com/i';

    if (!clientId) {
        console.error('Barelytics: data-id attribute is required');
        return;
    }
   
    // --- Session + User tracking ---
    function getSessionId() { 
        const name = 'analytics_session=';
        const match = document.cookie.split('; ').find((row) => row.startsWith(name));
        if (match) return match.split('=')[1];

        // New session, we need to take a snapshot
        window.sessionChanged = true;
 
        const id = crypto.randomUUID();
        document.cookie = `analytics_session=${id}; path=/; max-age=1800`;
        return id;
    }

    function getDistinctId() {
        let distinctId = localStorage.getItem('barelytics_id');
        if (!distinctId) {
            distinctId = crypto.randomUUID();
            localStorage.setItem('barelytics_id', distinctId);
        }
        return distinctId;
    }

    const sessionId = getSessionId();
    const distinctId = getDistinctId();

    // --- rrweb recording ---
    let replayEvents = [];
    let recordStopFn = null;

    function startRecording() {
        recordStopFn = record({ 
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
