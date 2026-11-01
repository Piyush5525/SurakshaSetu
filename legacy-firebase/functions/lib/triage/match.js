"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalise = normalise;
exports.containsTerm = containsTerm;
exports.findTerms = findTerms;
const DEVANAGARI = /[ऀ-ॿ]/;
function normalise(text) {
    return text.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();
}
function escapeRegExp(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
/** True when `term` occurs in `text`. Latin terms need non-letter boundaries; Devanagari uses substring. */
function containsTerm(text, term) {
    const t = normalise(term);
    if (DEVANAGARI.test(t))
        return text.includes(t);
    return new RegExp(`(?<![a-z])${escapeRegExp(t)}(?![a-z])`).test(text);
}
/** Returns the terms found. Empty/blank text yields no hits (no transcript => no keyword effect). */
function findTerms(transcript, terms) {
    const text = normalise(transcript ?? '');
    if (!text)
        return [];
    return terms.filter((term) => containsTerm(text, term));
}
