# Use Node.js 18 Alpine image for smaller size
FROM node:18-alpine

# Install build dependencies
RUN apk add --no-cache python3 make g++

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install ALL dependencies (including dev dependencies for build)
RUN npm ci

# Copy the rest of the application
COPY . .

# Build the application
RUN npm run build

# Note: We keep all dependencies including tsx which is needed for production

# Expose the port the app runs on
EXPOSE 3002

# Start the application
CMD ["npm", "start"]
