// TODO: Fix spa navigation not being tracked

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

    function getUserId() {
        let userId = localStorage.getItem('barelytics_user_id');
        if (!userId) {
            userId = crypto.randomUUID();
            localStorage.setItem('barelytics_user_id', userId);
        }
        return userId;
    }

    const sessionId = getSessionId();
    const userId = getUserId();

    // --- rrweb recording ---
    let replayEvents = [];

    function startRecording() {
        if (!window.rrweb) {
            console.error('❌ rrweb not loaded. Did you include the rrweb script?');
            return;
        }

        window.rrweb.record({
            emit(event) {
                console.log('rrweb event:', event.type);
                replayEvents.push(event);
            },
            recordCrossOriginIframes: true,
            recordShadowDom: true,
        });

        if (window.sessionChanged) {
            console.log('🆕 New session detected, taking full snapshot');
            window.rrweb.record.takeFullSnapshot();
        }

        console.log('✅ rrweb recording started');
    }

    if (document.readyState === 'complete') {
        startRecording();
    } else {
        window.addEventListener('load', startRecording);
    } 
 
    function sendEvent(type, extra = {}) {
        const payload = {
            session_id: sessionId,
            user_id: userId,
            clientId: clientId,
            type,
            url: window.location.href,
            referrer: document.referrer,
            user_agent: navigator.userAgent,
            timestamp: new Date().toISOString(),
            ...extra,
        };

        if (type === 'replay') {
            fetch(backendUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            })
                .then(() => {
                    console.log('📤 Sent replay batch with fetch:', events.length, 'events');
                })
                .catch((err) => {
                    console.error('❌ Failed to send replay batch:', err);
                });
        }
        else {
            navigator.sendBeacon(backendUrl, JSON.stringify(payload));
        }
    }

    function flushReplays() {
        if (replayEvents.length === 0) return;
        const events = replayEvents.splice(0);
        console.log('Events size:', new Blob([JSON.stringify(events)]).size / 1024, 'KB');
        sendEvent('replay', {events: events});
    }

    setInterval(flushReplays, 10000);

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
