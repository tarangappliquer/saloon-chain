# Stage 1: Build
FROM node:20-alpine AS build
WORKDIR /app

# Install pnpm globally
RUN corepack enable && corepack prepare pnpm@10.33.0 --activate

# Copy full workspace source code
COPY . .

# Install dependencies across workspace
RUN pnpm install --frozen-lockfile

# Build args for Vite
ARG VITE_API_BASE_URL=""
ARG VITE_ENABLE_THEME_TOGGLE="false"
ARG VITE_ADMIN_PORTAL_URL=""
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
ENV VITE_ENABLE_THEME_TOGGLE=${VITE_ENABLE_THEME_TOGGLE}
ENV VITE_ADMIN_PORTAL_URL=${VITE_ADMIN_PORTAL_URL}

# Build clientportal application
RUN pnpm --filter clientportal build

# Stage 2: Production Nginx Server
FROM nginx:alpine AS final

COPY --from=build /app/apps/clientportal/dist /usr/share/nginx/html
COPY apps/clientportal/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
