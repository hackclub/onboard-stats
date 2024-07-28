import { IncomingWebhook } from "@slack/webhook";
import puppeteer from "puppeteer";
import path from "path";
import { format } from "date-fns";
import cron from "node-cron";
import dotenv from "dotenv";

dotenv.config();

const { SLACK_WEBHOOK_URL, DOMAIN } = process.env;
const webhook = new IncomingWebhook(SLACK_WEBHOOK_URL);

const takeScreenshot = async (url) => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: "networkidle0" });
  
  await page.evaluate(() => {
    const canvasToImage = (element) => {
      const dataUrl = element.toDataURL();
      const image = document.createElement("img");
      image.src = dataUrl;
      ["width", "height", "position", "left", "top"].forEach(
        (key) => (image.style[key] = element.style[key])
      );
      image.className = element.className;
      element.parentNode?.insertBefore(image, element);
      element.remove();
    };
    document.querySelectorAll("canvas").forEach(canvasToImage);
  });

  const timestamp = format(new Date(), "h:mm:ssa_dd-MM-yyyy", {
    timeZone: "America/New_York",
  });

  const screenshotPath = path.resolve(
    path.dirname(""),
    `./public/graphs/graphs_${timestamp}.png`
  );
  
  await page.screenshot({
    path: screenshotPath,
    type: "png",
    clip: { x: 0, y: 0, width: 800, height: 600 },
  });

  await browser.close();
  return timestamp;
};

const sendHook = async () => {
  const timestamp = await takeScreenshot(DOMAIN);
  await webhook.send({
    text: "Here's the daily OnBoard Stats :onboard:",
    attachments: [
      {
        title: `<${DOMAIN}|OnBoard Stats> sent at ${timestamp}`,
        image_url: `${DOMAIN}/graphs/graphs_${timestamp}.png`,
      },
    ],
  });
};

cron.schedule("0 6 * * *", sendHook);

sendHook();
