/**
 * Fetches and caches content.json.
 */
const ContentLoader = (() => {
    let _content = null;

    async function load() {
        if (_content) return _content;
        const resp = await fetch('data/content.json');
        if (!resp.ok) throw new Error('Failed to load content.json');
        _content = await resp.json();
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
