import { IncomingWebhook } from "@slack/webhook";
import puppeteer from "puppeteer";
import path from "path";
import { format } from "date-fns";

const { SLACK_WEBHOOK_URL, DOMAIN } = process.env;
const webhook = new IncomingWebhook(SLACK_WEBHOOK_URL);

const takeScreenshot = async (url) => {
  const browser = await puppeteer.launch({
    headless: "new",
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage'
    ]
  });
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

const uploadFileToCDN = async (file) => {
  console.log("Uploading file to CDN", file)
  const uploadText = await fetch('https://cdn.hackclub.com/api/v3/new', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer beans',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify([file])
  }).then(res => res.text())
  console.log(uploadText)
  const uploadData = JSON.parse(uploadText)

  return uploadData.files[0].deployedUrl
}

const sendHook = async () => {
  const timestamp = await takeScreenshot(DOMAIN + "/home");
  const imageUrl = await uploadFileToCDN(`${DOMAIN}/graphs/graphs_${timestamp}.png`)
  await webhook.send({
    text: "Here's the daily OnBoard Stats :onboard:",
    attachments: [
      {
        title: `<${DOMAIN}/home|OnBoard Stats> sent at ${timestamp}`,
        image_url: imageUrl,
      },
    ],
  });
};

sendHook();
