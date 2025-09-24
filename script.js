// TODO: Fix spa navigation not being tracked

(function initAnalytics() {
    const currentScript = document.currentScript || document.querySelector('script[data-url]');

    if (!currentScript) {
        console.error('Barelytics: Could not find script tag with data-url');
        return;
    }

    let backendUrl = currentScript.getAttribute('data-url');
    const clientId = currentScript.getAttribute('data-id');

    if (!backendUrl) backendUrl = 'https://api.barelytics.com/event';

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

    // --- Send analytics events to /event ---
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
        navigator.sendBeacon(backendUrl, JSON.stringify(payload));
    }

    // --- Send replay batches to /replays ---
    function flushReplays() {
        if (replayEvents.length === 0) return;

        const events = replayEvents.splice(0);
        const sessionUrl = backendUrl.replace('/event', '/replays');

        const payload = {
            sessionId,
            clientId,
            events,
            timestamp: new Date().toISOString(),
        };

        console.log('Payload size:', new Blob([JSON.stringify(payload)]).size / 1024, 'KB');

        fetch(sessionUrl, {
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

        //localStorage.setItem('rrweb-events', JSON.stringify(events));
    }

    setInterval(flushReplays, 10000);

    // --- Page views + navigation tracking ---
    function sendPageView() {
        sendEvent('page_view');
    }

    sendPageView();

    window.addEventListener('popstate', sendPageView);

    const origPushState = history.pushState;
    const origReplaceState = history.replaceState;

    history.pushState = function (...args) {
        origPushState.apply(this, args);
        setTimeout(sendPageView, 0);
    };

    history.replaceState = function (...args) {
        origReplaceState.apply(this, args);
        setTimeout(sendPageView, 0);
    };

    // --- Public API ---
    window.barelytics = {
        capture(name) {
            sendEvent('custom', { name });
        },
        flushReplays, // manual trigger if you want
    };
})();
