import puppeteer from "puppeteer";
import * as XLSX from "xlsx";

async function scrapeInterviewQuestions(searchQuery) {
    const browser = await puppeteer.launch({
        headless: false,
        defaultViewport: null,
    });

    const page = await browser.newPage();
    console.log(`🔍 Searching Google for: ${searchQuery}`);

    await page.goto("https://www.google.com/", { waitUntil: "domcontentloaded" });
    await page.waitForSelector("textarea[name='q']", { visible: true });
    await page.type("textarea[name='q']", searchQuery);
    await page.keyboard.press("Enter");

    // 🧠 Wait for the search results page to fully load
    await page.waitForNavigation({ waitUntil: "networkidle2" });

    // ⏳ Additional safety wait
    await new Promise((r) => setTimeout(r, 5000));

    // ✅ Use a stable selector that appears *after* results load
    await page.waitForSelector("a h3");

    const links = await page.$$eval("a h3", (elements) =>
        elements
            .map((el) => el.parentElement?.href)
            .filter((href) => href && href.startsWith("http"))
    );

    console.log(`📎 Found ${links.length} result links`);
    const data = [];

    for (const url of links.slice(0, 5)) {
        console.log(`🌐 Visiting: ${url}`);
        try {
            const tab = await browser.newPage();
            await tab.goto(url, { waitUntil: "domcontentloaded", timeout: 25000 });
            await new Promise((r) => setTimeout(r, 3000));

            const text = await tab.evaluate(() => document.body.innerText);
            const questions = text
                .split("\n")
                .map((t) => t.trim())
                .filter((t) => t.endsWith("?") && t.length > 10 && t.length < 200);

            questions.forEach((q) => data.push({ Question: q, Source: url }));
            console.log(`✅ Found ${questions.length} questions`);
            await tab.close();
        } catch (err) {
            console.warn(`⚠️ Failed to scrape: ${url} (${err.message})`);
        }
    }

    if (data.length > 0) {
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Questions");
        XLSX.writeFile(wb, "Interview_Questions.xlsx");
        console.log(`📁 Saved results to Interview_Questions.xlsx`);
    } else {
        console.log("No questions found.");
    }

    await browser.close();
}

const topic = process.argv[2] || "Java developer interview questions";
scrapeInterviewQuestions(topic);
