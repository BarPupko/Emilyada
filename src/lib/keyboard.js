// Someone typing with the keyboard on Hebrew or Russian gets other letters for the same
// keys: "emily2026" comes out as "קצןךט2026" or "уьшдн2026". toLatinKeys() turns each
// letter back into the English key it sits on, so codes and host keys work either way.
const LAYOUTS = [
  // [English keys, the same keys on that layout]
  ['qwertyuiopasdfghjkl;zxcvbnm,.', "/'קראטוןםפשדגכעיחלךףזסבהנמצתץ"], // Hebrew (Israeli standard)
  ['qwertyuiop[]asdfghjkl;\'zxcvbnm,.', 'йцукенгшщзхъфывапролджэячсмитьбю'], // Russian (ЙЦУКЕН)
]

const TO_LATIN = new Map()
for (const [latin, other] of LAYOUTS) {
  ;[...other].forEach((ch, i) => {
    if (/\p{L}/u.test(ch)) TO_LATIN.set(ch, latin[i])
  })
}

export const toLatinKeys = (s) => [...(s ?? '')].map((ch) => TO_LATIN.get(ch.toLowerCase()) ?? ch).join('')

/** For comparing host keys: same keys pressed, any case, any of those layouts. */
export const sameKeys = (a, b) => toLatinKeys(a).trim().toLowerCase() === toLatinKeys(b).trim().toLowerCase()
