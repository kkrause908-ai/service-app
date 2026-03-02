FROM node:20-bullseye

WORKDIR /app

# Install dependencies first (cached)
COPY package*.json ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

# Copy source
COPY . .

# Copy wait script for DB readiness
COPY wait-for-db.sh /wait-for-db.sh
RUN chmod +x /wait-for-db.sh

# Expose port
EXPOSE 3000

# Add wait script for DB readiness
COPY wait-for-db.sh /usr/local/bin/wait-for-db.sh
RUN chmod +x /usr/local/bin/wait-for-db.sh

# Default command: wait for DB then start in dev mode for debugging
CMD ["bash","-lc","/wait-for-db.sh && npm run start"]
