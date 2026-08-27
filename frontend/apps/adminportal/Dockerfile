# Stage 1: Build
FROM node:20-alpine AS build
WORKDIR /app

# Install pnpm globally
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

# Copy full workspace source code
COPY . .

# Install dependencies across workspace.
# --ignore-scripts: the bundle build needs neither the openapi-generator JAR
# nor the Cypress binary; skipping their postinstalls keeps the image lean.
RUN pnpm install --frozen-lockfile --ignore-scripts

# Build args for Vite
ARG VITE_API_BASE_URL=""
ARG VITE_ENABLE_THEME_TOGGLE="false"
ARG VITE_CLIENT_PORTAL_URL=""
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
ENV VITE_ENABLE_THEME_TOGGLE=${VITE_ENABLE_THEME_TOGGLE}
ENV VITE_CLIENT_PORTAL_URL=${VITE_CLIENT_PORTAL_URL}

# Build adminportal application
RUN pnpm --filter adminportal build

# Stage 2: Production Nginx Server
FROM nginx:alpine AS final

COPY --from=build /app/apps/adminportal/dist /usr/share/nginx/html
COPY apps/adminportal/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
