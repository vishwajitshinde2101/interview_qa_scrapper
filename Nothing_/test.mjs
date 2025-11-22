import puppeteer from "puppeteer";
import * as XLSX from "xlsx";

async function scrapeInterviewQA(searchQuery) {
    const browser = await puppeteer.launch({
        headless: false,
        defaultViewport: null,
        args: ["--start-maximized"],
    });

    const page = await browser.newPage();
    console.log(`🔍 Searching Google for: ${searchQuery}`);

    await page.goto("https://www.google.com/", { waitUntil: "domcontentloaded" });
    await page.waitForSelector("textarea[name='q']", { visible: true });
    await page.type("textarea[name='q']", searchQuery);
    await page.keyboard.press("Enter");

    // ✅ Wait for the search results container
    await page.waitForSelector("div#search", { visible: true, timeout: 20000 });

    const allLinks = new Set();

    // 🔁 Scrape up to 3 pages of Google results
    for (let pageIndex = 0; pageIndex < 3; pageIndex++) {
        console.log(`📄 Collecting results from Google page ${pageIndex + 1}`);

        await new Promise((r) => setTimeout(r, 3000));
        await autoScroll(page);

        const links = await page.$$eval("a h3", (elements) =>
            elements
                .map((el) => el.parentElement?.href)
                .filter((href) => href && href.startsWith("http"))
        );

        links.forEach((l) => allLinks.add(l));

        // Try to go to the next page if available
        const nextButton = await page.$("a#pnnext");
        if (!nextButton) break;
        await Promise.all([
            page.click("a#pnnext"),
            page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 20000 }),
        ]);
        await page.waitForSelector("div#search", { visible: true, timeout: 20000 });
    }

    console.log(`📎 Total unique links collected: ${allLinks.size}`);

    const data = [];
    const linksToVisit = Array.from(allLinks).slice(0, 60); // limit to 60 max

    // 🌐 Visit each result
    for (const [i, url] of linksToVisit.entries()) {
        console.log(`\n🌍 [${i + 1}/${linksToVisit.length}] Visiting: ${url}`);
        const tab = await browser.newPage();

        try {
            await tab.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
            await new Promise((r) => setTimeout(r, 4000));

            const text = await tab.evaluate(() => document.body.innerText);
            const qaPairs = extractQAPairs(text);

            qaPairs.forEach(({ question, answer }) =>
                data.push({ Question: question, Answer: answer, Source: url })
            );

            console.log(`✅ Extracted ${qaPairs.length} Q&A`);
        } catch (err) {
            console.warn(`⚠️ Failed to scrape ${url}: ${err.message}`);
        }

        await tab.close();
    }

    if (data.length > 0) {
        const ws = XLSX.utils.json_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Interview_QA");
        XLSX.writeFile(wb, "Interview_QA.xlsx");
        console.log(`📁 Saved ${data.length} Q&A to Interview_QA.xlsx`);
    } else {
        console.log("No Q&A found.");
    }

    await browser.close();
}

// Helper: Scroll through results
async function autoScroll(page) {
    try {
        await page.evaluate(async () => {
            await new Promise((resolve) => {
                let totalHeight = 0;
                const distance = 500;
                const timer = setInterval(() => {
                    window.scrollBy(0, distance);
                    totalHeight += distance;
                    if (totalHeight >= document.body.scrollHeight) {
                        clearInterval(timer);
                        resolve();
                    }
                }, 200);
            });
        });
    } catch {
        console.warn("⚠️ Scroll interrupted (page navigation). Ignored.");
    }
}

// Helper: Extract Q&A from page text
function extractQAPairs(text) {
    const lines = text.split("\n").map((t) => t.trim()).filter((t) => t);
    const qa = [];

    for (let i = 0; i < lines.length - 1; i++) {
        if (lines[i].endsWith("?")) {
            let answer = "";
            for (let j = i + 1; j < lines.length && answer.length < 700; j++) {
                if (lines[j].endsWith("?")) break;
                answer += lines[j] + " ";
                if (answer.length > 100 && answer.includes(".")) break;
            }
            if (answer && answer.length > 15)
                qa.push({ question: lines[i], answer: answer.trim() });
        }
    }

    return qa;
}

// Entry point
const topic = process.argv[2] || "dot net interview questions";
scrapeInterviewQA(topic);
