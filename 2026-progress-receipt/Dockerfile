FROM node:20-bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY 2026-progress-receipt/package.json ./
RUN npm install --omit=dev
COPY 2026-progress-receipt/ .

ENV PORT=3000
EXPOSE 3000
CMD ["npm", "start"]
# rebuild 2026-08-04
