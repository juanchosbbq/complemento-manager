# Fase 1: compila la interfaz con todas las dependencias (Vite, TypeScript…).
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Fase 2: solo lo necesario para ejecutar. Sin herramientas de desarrollo.
# Se ejecuta como root a propósito: el volumen de Railway (/data, donde vive la base) se monta como root.
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY engine ./engine
COPY data ./data
COPY server ./server
COPY tsconfig.json ./
COPY --from=build /app/ui/dist ./ui/dist
EXPOSE 8787
CMD ["sh", "-c", "npm run seed && npm start"]
