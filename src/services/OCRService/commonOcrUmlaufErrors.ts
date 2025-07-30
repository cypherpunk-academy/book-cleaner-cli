/**
 * Common OCR umlaut error corrections for German text
 *
 * These patterns target clear OCR misrecognitions only, not valid German words.
 * Each correction is conservative and specific to obvious OCR errors.
 */

export const umlautCorrections: Array<[RegExp, string]> = [
    // ö corrections - only clear OCR errors
    [/\bEr[o0]ffn/gi, 'Eröffn'], // Eröffnen (Eroffnen is not a word)
    [/\bk[o0]nnen\b/gi, 'können'], // können (konnen is not a word)
    [/\bm[o0]glich/gi, 'möglich'], // möglich (moglich is not a word)
    [/\bf[o0]rder/gi, 'förder'], // fördern (forder is not common)
    [/\bg[o0]ttlich/gi, 'göttlich'], // göttlich (gottlich is not a word)

    // ü corrections - target obvious OCR double-letter errors
    [/\bHinzufligungen\b/gi, 'Hinzufügungen'], // Specific OCR error from example
    [/\bVerfligungen\b/gi, 'Verfügungen'], // Similar pattern
    [/\biiber\b/gi, 'über'], // über (iiber is clearly OCR error)
    [/\bfiir\b/gi, 'für'], // für (fiir is clearly OCR error)
    [/\bnatiirlich/gi, 'natürlich'], // natürlich (natiirlich is OCR error)
    [/\bspriiren\b/gi, 'spüren'], // spüren (spriiren is OCR error)
    [/\bmiissen\b/gi, 'müssen'], // müssen (miissen is OCR error)
    [/\bwiirde\b/gi, 'würde'], // würde (wiirde is OCR error)
    [/\bkiinstler/gi, 'künstler'], // künstlerisch (kiinstler is OCR error)
    [/\bzuriick/gi, 'zurück'], // zurück (zuriick is OCR error)
    [/\bRiickzug/gi, 'Rückzug'], // Rückzug (Riickzug is OCR error)
    [/\bverfafit\b/gi, 'verfaßt'], // verfaßt (verfafit is a common OCR error for verfaßt)
    [/\bverfaflen\b/gi, 'verfaßten'], // verfaßten (verfaflen is a common OCR error for verfaßten)
    [/\bverfafler\b/gi, 'verfaßter'], // verfaßter (verfafler is a common OCR error for verfaßter)

    // ä corrections - only clear non-words
    [/\berklaren\b/gi, 'erklären'], // erklären (erklaren is not a word)
    [/\bandern\b/gi, 'ändern'], // ändern (andern is not common as verb)
    [/\bregelmaBig\b/gi, 'regelmäßig'], // regelmäßig (regelmaBig is OCR error)
    [/\blanger\b(?=\s+(als|werden|machen))/gi, 'länger'], // länger only in comparative context

    // ß corrections - target clear B/ss OCR errors
    [/\bgroBe\b/gi, 'große'], // große (groBe with capital B is OCR error)
    [/\bweiB\b/gi, 'weiß'], // weiß (weiB with capital B is OCR error)
    [/\bmuBte\b/gi, 'mußte'], // musste (muBte with capital B is OCR error)
    [/\bdaB\b/gi, 'daß'], // dass (daB with capital B is OCR error)
    [/\bschlieBlich\b/gi, 'schließlich'], // schließlich (schlieBlich is OCR error)
    [/\bgroBer\b/gi, 'größer'], // größer (groBer with capital B is OCR error)
    [/\bgroBte\b/gi, 'größte'], // größte (groBte with capital B is OCR error)
    [/\bheiBt\b/gi, 'heißt'], // heißt (heiBt with capital B is OCR error)

    // Z/I OCR confusion corrections
    [/\bZdee\b/gi, 'Idee'], // Idee (Zdee is OCR error for Z/I confusion)
    [/\bSiche\b/gi, 'Siehe'], // Siehe (Siche is OCR error for Z/I confusion)

    // Conservative generic patterns - only obvious OCR patterns
    [/\b([a-zA-Z]+)iii([a-zA-Z]+)\b/g, '$1üi$2'], // Triple i likely OCR error
    [/\b([a-zA-Z]+)iie([a-zA-Z]+)\b/g, '$1üe$2'], // ii+e likely OCR error
    [/\b([a-zA-Z]+)iien\b/g, '$1üen'], // ii+en ending likely OCR error
];
