/**
 * Google Sheets sync client.
 * Set APPS_SCRIPT_URL after deploying the Apps Script web app.
 */
const Sync = (() => {
    let APPS_SCRIPT_URL = '';  // Set this after deploying
    let _answerCount = 0;
    const SYNC_INTERVAL = 5;

    function setUrl(url) {
        APPS_SCRIPT_URL = url;
    }

    function onAnswer() {
        _answerCount++;
        if (_answerCount % SYNC_INTERVAL === 0) {
            pushProgress();
        }
    }

    async function pushProgress() {
        if (!APPS_SCRIPT_URL) return;
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
        } catch (e) {
            // Silent fail - offline is fine
        }
    }

    async function pullProgress() {
        if (!APPS_SCRIPT_URL) return;
        const name = Progress.getStudentName();
        if (!name) return;
        try {
            const resp = await fetch(`${APPS_SCRIPT_URL}?name=${encodeURIComponent(name)}`);
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
            if (!APPS_SCRIPT_URL) return;
            const payload = Progress.getSyncPayload(ContentLoader.getChapters());
            navigator.sendBeacon(APPS_SCRIPT_URL, JSON.stringify(payload));
        });
    }

    return { setUrl, onAnswer, pushProgress, pullProgress, setupUnloadSync };
})();
