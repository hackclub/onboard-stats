# Use Bun base image
FROM oven/bun:1-debian

# Install Chrome dependencies and Puppeteer requirements
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-ipafont-gothic \
    fonts-wqy-zenhei \
    fonts-thai-tlwg \
    fonts-kacst \
    fonts-freefont-ttf \
    curl \
    wget \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Set Puppeteer environment variables
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Create app directory
WORKDIR /usr/src/app

# Create a non-root user
RUN groupadd -r pptruser && useradd -r -g pptruser -G audio,video pptruser \
    && mkdir -p /home/pptruser/Downloads \
    && mkdir -p /usr/src/app/public/graphs \
    && chown -R pptruser:pptruser /home/pptruser \
    && chown -R pptruser:pptruser /usr/src/app

# Copy package files
COPY package*.json ./

# Install dependencies with Bun, ensuring Puppeteer doesn't download Chrome
RUN PUPPETEER_SKIP_DOWNLOAD=true bun install && \
    bun add puppeteer --no-install-deps

# Copy app source
COPY . .

# Fix permissions
RUN chown -R pptruser:pptruser /usr/src/app

# Switch to non-root user
USER pptruser

# Expose the port your app runs on
EXPOSE 3030

# Start the application with Bun
CMD ["bun", "run", "server.js"]