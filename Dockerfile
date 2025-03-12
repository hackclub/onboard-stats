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

# Copy package files
COPY package*.json ./

# Install dependencies with Bun
RUN bun install

# Copy app source
COPY . .

# Expose the port your app runs on
EXPOSE 3030

# Start the application with Bun
CMD ["bun", "run", "server.js"] 