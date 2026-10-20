// Stable message IDs; source wording is owned by the browser locale catalogs.
export function translator(i18n) {
    return (id, substitutions) => i18n.getMessage(id, substitutions) || id;
}
export function localizeDocument(document, i18n) {
    document.documentElement.lang = i18n.getUILanguage().toLowerCase().startsWith('it') ? 'it' : 'en';
    for (const node of document.querySelectorAll('[data-i18n]')) {
        const value = i18n.getMessage(node.dataset.i18n);
        if (value)
            node.textContent = value;
    }
}
