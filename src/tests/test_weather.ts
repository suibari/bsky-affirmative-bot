import { getYokohamaWeather } from "../api/weather";

async function main() {
    console.log("Fetching Yokohama weather...");
    const weather = await getYokohamaWeather();
    console.log(`Weather: ${weather}`);
}

main();
