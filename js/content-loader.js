/**
 * Fetches chapter data from per-chapter JSON files.
 * Public API unchanged: load(), getChapters(), getChapter(id).
 */
const ContentLoader = (() => {
    let _content = null;

    async function load() {
        if (_content) return _content;
        const manifestResp = await fetch('data/chapters.json');
        if (!manifestResp.ok) throw new Error('Failed to load chapters.json');
        const manifest = await manifestResp.json();

        const chapterPromises = manifest.map(entry =>
            fetch(`data/${entry.id}.json`).then(r => {
                if (!r.ok) throw new Error(`Failed to load ${entry.id}.json`);
                return r.json();
            })
        );
        const chapters = await Promise.all(chapterPromises);

        _content = { chapters };
        return _content;
    }

    function getChapters() {
        return _content ? _content.chapters : [];
    }

    function getChapter(chapterId) {
        return getChapters().find(ch => ch.id === chapterId);
    }

    return { load, getChapters, getChapter };
})();
