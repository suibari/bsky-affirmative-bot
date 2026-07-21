// ラベラーに登録するレベルバッジの上限。
// 超ポジティブLvの内部値（followers.positivity_level）はこれを超えて伸びるが、
// Bluesky側のラベルは MAX_LEVEL にクリップして登録する（Nagiは実値を表示する）。
export const MAX_LEVEL = 100;

/** 超ポジティブLvが加算されるスコアの閾値。 */
export const SUPER_POSITIVE_SCORE_THRESHOLD = 95;

export function numberToEnglishWord(num: number): string {
    if (num === MAX_LEVEL) return "max";
    const words = [
        "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
        "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"
    ];
    if (num < 20) {
        return words[num] || "unknown";
    }
    const tens = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
    if (num < 100) {
        const tenVal = Math.floor(num / 10);
        const rest = num % 10;
        return tens[tenVal] + (rest > 0 ? `-${words[rest]}` : "");
    }
    return `lv-${num}`;
}

export function sanitizeDidToLexiconValue(did: string): string {
    const sanitized = did.toLowerCase().replace(/:/g, "-");
    const numMap: { [key: string]: string } = {
        "0": "a", "1": "b", "2": "c", "3": "d", "4": "e",
        "5": "f", "6": "g", "7": "h", "8": "i", "9": "j"
    };
    return sanitized.replace(/[0-9]/g, (m) => numMap[m]);
}
