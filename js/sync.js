/**
 * Google Sheets sync client.
 * Pushes progress at session end and on page unload.
 * Pulls progress on login (by ONYEN) to restore from another device.
 * Set APPS_SCRIPT_URL after deploying the Apps Script web app.
 */
const Sync = (() => {
    let APPS_SCRIPT_URL = '';
    let _hasUnsavedProgress = false;

    function setUrl(url) {
        APPS_SCRIPT_URL = url;
    }

    function onAnswer() {
        _hasUnsavedProgress = true;
    }

    async function pushProgress() {
        if (!APPS_SCRIPT_URL) return;
        const onyen = Progress.getOnyen();
        if (!onyen) return;
        const payload = Progress.getSyncPayload(ContentLoader.getChapters());
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
        const onyen = Progress.getOnyen();
        if (!onyen) return;
        try {
            const resp = await fetch(APPS_SCRIPT_URL + '?onyen=' + encodeURIComponent(onyen));
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

    function setupUnloadSync() {
        window.addEventListener('beforeunload', () => {
            if (!APPS_SCRIPT_URL || !_hasUnsavedProgress) return;
            const payload = Progress.getSyncPayload(ContentLoader.getChapters());
            navigator.sendBeacon(APPS_SCRIPT_URL, JSON.stringify(payload));
            _hasUnsavedProgress = false;
        });
    }

    return { setUrl, onAnswer, pushProgress, pullProgress, setupUnloadSync };
})();
