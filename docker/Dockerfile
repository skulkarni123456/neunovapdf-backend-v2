FROM node:18-bullseye

# Install libreoffice and other dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    libreoffice-core libreoffice-writer libreoffice-calc libreoffice-impress \
    libreoffice-common libreoffice-java-common poppler-utils ghostscript \
    imagemagick qpdf zip unzip \
  && rm -rf /var/lib/apt/lists/*

# Create app dir
WORKDIR /usr/src/app
COPY backend/package*.json ./
RUN npm ci --production
COPY backend/ ./

ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "src/index.js"]
