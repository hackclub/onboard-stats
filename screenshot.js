const { IncomingWebhook } = require('@slack/webhook');
const puppeteer = require('puppeteer');
const path = require('path');
const { format } = require('date-fns');
const cron = require('node-cron');
require('dotenv').config();

const slackWebhookUrl = process.env.SLACK_WEBHOOK_URL;
const sourceURl = process.env.DOMAIN;

const webhook = new IncomingWebhook(slackWebhookUrl);

async function takeScreenshot(url) {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'networkidle0' });
  await page.evaluate(() => {
    function canvasToImage(element) {
      const dataUrl = element.toDataURL();
      const image = document.createElement('img');
      image.src = dataUrl;

      const properties = ['width', 'height', 'position', 'left', 'top'];
      properties.forEach(key => image.style[key] = element.style[key])
      image.className = element.className;

      element.parentNode?.insertBefore(image, element);
      element.parentNode?.removeChild(element);
    }

    [].forEach.call(document.getElementsByTagName('canvas'), canvasToImage)
  })  
  const timestamp = format(new Date(), 'h:mm:ssa_dd-MM-yyyy', { timeZone: 'America/New_York' });

  const screenshotPath = path.resolve(__dirname, `./public/graphs/graphs_${timestamp}.png`);
  await page.screenshot({
    path: screenshotPath,
    type: 'png',
    clip: { x: 0, y: 0, width: 800, height: 600 }
  });
  await browser.close();
  return timestamp;
}
async sendHook => (async () => {
  const timestamp = await takeScreenshot(sourceURl)
  await webhook.send({
    text: 'Here\'s the daily OnBoard Stats :onboard:',
    attachments: [{
      title: `OnBoard Stats sent at ${timestamp}`,
      image_url: `${sourceURl}/graphs/graphs_${timestamp}.png`
    }]
  });
})();

cron.schedule('0 18 * * *', async () => {
  try {
    sendHook();
  } catch (error) {
      console.error('Error capturing screenshot or sending to Slack:', error);
  }
});

cron.schedule('0 6 * * *', async () => {
  try {
    sendHook();
  } catch (error) {
      console.error('Error capturing screenshot or sending to Slack:', error);
  }
});

sendHook();