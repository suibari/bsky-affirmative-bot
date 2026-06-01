export function numberToEnglishWord(num: number): string {
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
