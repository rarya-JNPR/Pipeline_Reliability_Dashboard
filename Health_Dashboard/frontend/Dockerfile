FROM node:20-bullseye
WORKDIR /app

ENV npm_config_fetch_retries=5 \
    npm_config_fetch_retry_factor=2 \
    npm_config_fetch_retry_maxtimeout=120000 \
    npm_config_fetch_timeout=60000 \
    npm_config_audit=false \
    npm_config_fund=false

# Optional: use a mirror to avoid npmjs timeouts (uncomment if needed)
# RUN npm config set registry https://registry.npmmirror.com


COPY package.json ./
RUN npm install

# Copy the rest of the app
COPY . .

EXPOSE 5173
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]


