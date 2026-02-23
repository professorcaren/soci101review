/**
 * Google Sheets sync client.
 * Set APPS_SCRIPT_URL after deploying the Apps Script web app.
 */
const Sync = (() => {
    let APPS_SCRIPT_URL = '';
    let _hasUnsavedProgress = false;
    let _leaderboardCache = null;

    function setUrl(url) {
        APPS_SCRIPT_URL = url;
    }

    function onAnswer() {
        _hasUnsavedProgress = true;
    }

    async function pushProgress() {
        if (!APPS_SCRIPT_URL) return;
        const chapters = ContentLoader.getChapters();
        const payload = Progress.getSyncPayload(chapters);
        payload.analytics = Progress.getAnalyticsPayload(chapters);
        try {
            await fetch(APPS_SCRIPT_URL, {
                method: 'POST',
                mode: 'no-cors',
                headers: { 'Content-Type': 'text/plain' },
                body: JSON.stringify(payload),
            });
            Progress.getData().lastSync = Date.now();
            Progress.save();
            _hasUnsavedProgress = false;
        } catch (e) {
            // Silent fail - offline is fine
        }
    }

    async function pullProgress() {
        if (!APPS_SCRIPT_URL) return;
        const name = Progress.getStudentName();
        if (!name) return;
        try {
            const resp = await fetch(APPS_SCRIPT_URL + '?name=' + encodeURIComponent(name));
            if (resp.ok) {
                const remote = await resp.json();
                if (remote && remote.concepts) {
                    Progress.mergeRemoteData(remote);
                }
            }
        } catch (e) {
            // Silent fail
        }
    }

    async function fetchLeaderboard() {
        if (!APPS_SCRIPT_URL) return [];
        if (_leaderboardCache) return _leaderboardCache;
        try {
            const resp = await fetch(APPS_SCRIPT_URL + '?action=leaderboard');
            if (resp.ok) {
                _leaderboardCache = await resp.json();
                return _leaderboardCache;
            }
        } catch (e) {
            // Silent fail
        }
        return [];
    }

    function clearLeaderboardCache() {
        _leaderboardCache = null;
    }

    function setupUnloadSync() {
        window.addEventListener('beforeunload', () => {
            if (!APPS_SCRIPT_URL || !_hasUnsavedProgress) return;
            const payload = Progress.getSyncPayload(ContentLoader.getChapters());
            navigator.sendBeacon(APPS_SCRIPT_URL, JSON.stringify(payload));
            _hasUnsavedProgress = false;
        });
    }

    return { setUrl, onAnswer, pushProgress, pullProgress, fetchLeaderboard, clearLeaderboardCache, setupUnloadSync };
})();
