require('dotenv').config();
const puppeteer = require('puppeteer');
const path = require('path');
const { IncomingWebhook } = require('@slack/webhook');
const url = process.env.SLACK_WEBHOOK_URL;
const webhook = new IncomingWebhook(url);
const sourceURl = process.env.DOMAIN;
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
  await page.screenshot({
    path: path.resolve(__dirname, './temp/graphs.png'),
    type: 'png',
    clip: { x: 0, y: 0, width: 800, height: 800 }
  });
  await browser.close();
}
(async () => {
  await takeScreenshot(sourceURl)
  await webhook.send({
    text: 'Here\'s the daily OnBoard Stats :onboard:',
    attachments: [{
      title: 'OnBoard Stats',
      image_url: `${sourceURl}/graphs.png`
    }]
  });
})();

