#!/bin/bash

# Development server startup script with automatic recovery
# This ensures both frontend and backend are always running

echo "🚀 Starting Development Servers..."
echo "================================"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to check if a port is in use
check_port() {
    lsof -i :$1 > /dev/null 2>&1
}

# Function to kill process on port
kill_port() {
    local port=$1
    local pid=$(lsof -t -i:$port)
    if [ ! -z "$pid" ]; then
        echo -e "${YELLOW}Killing process on port $port (PID: $pid)...${NC}"
        kill -9 $pid 2>/dev/null
        sleep 1
    fi
}

# Function to check if backend is responding
check_backend() {
    curl -s http://localhost:3002/api/health > /dev/null 2>&1 || \
    curl -s http://localhost:3003/api/health > /dev/null 2>&1
}

# Clear any stale processes
echo "🧹 Cleaning up old processes..."
pkill -f "vite" 2>/dev/null
pkill -f "tsx server/index.ts" 2>/dev/null
sleep 2

# Clear Vite cache if needed
if [ -d "node_modules/.vite" ] || [ -d ".vite" ]; then
    echo "🗑️  Clearing Vite cache..."
    rm -rf node_modules/.vite .vite
fi

# Start backend server
echo -e "${GREEN}Starting backend server...${NC}"
npm run dev &
BACKEND_PID=$!

# Wait for backend to be ready
echo "⏳ Waiting for backend to start..."
for i in {1..30}; do
    if check_backend; then
        echo -e "${GREEN}✅ Backend is running!${NC}"
        break
    fi
    if [ $i -eq 30 ]; then
        echo -e "${RED}❌ Backend failed to start after 30 seconds${NC}"
        exit 1
    fi
    sleep 1
done

# Start Vite frontend
echo -e "${GREEN}Starting frontend server...${NC}"
npx vite &
VITE_PID=$!

# Wait for Vite to be ready
echo "⏳ Waiting for frontend to start..."
for i in {1..15}; do
    if check_port 5174 || check_port 5173; then
        echo -e "${GREEN}✅ Frontend is running!${NC}"
        break
    fi
    if [ $i -eq 15 ]; then
        echo -e "${RED}❌ Frontend failed to start after 15 seconds${NC}"
        exit 1
    fi
    sleep 1
done

# Get the actual ports
BACKEND_PORT=3002
if check_port 3003; then
    BACKEND_PORT=3003
fi

FRONTEND_PORT=5174
if ! check_port 5174 && check_port 5173; then
    FRONTEND_PORT=5173
fi

echo ""
echo "================================"
echo -e "${GREEN}🎉 Development servers are running!${NC}"
echo ""
echo "Frontend: http://localhost:$FRONTEND_PORT"
echo "Backend:  http://localhost:$BACKEND_PORT"
echo ""
echo "Press Ctrl+C to stop all servers"
echo "================================"

# Function to cleanup on exit
cleanup() {
    echo -e "\n${YELLOW}Shutting down servers...${NC}"
    kill $BACKEND_PID 2>/dev/null
    kill $VITE_PID 2>/dev/null
    pkill -f "vite" 2>/dev/null
    pkill -f "tsx server/index.ts" 2>/dev/null
    echo -e "${GREEN}Servers stopped.${NC}"
    exit 0
}

# Set up cleanup on script exit
trap cleanup EXIT INT TERM

# Keep script running and monitor processes
while true; do
    # Check if backend is still running
    if ! kill -0 $BACKEND_PID 2>/dev/null; then
        echo -e "${RED}⚠️  Backend crashed! Restarting...${NC}"
        npm run dev &
        BACKEND_PID=$!
    fi
    
    # Check if frontend is still running
    if ! kill -0 $VITE_PID 2>/dev/null; then
        echo -e "${RED}⚠️  Frontend crashed! Restarting...${NC}"
        npx vite &
        VITE_PID=$!
    fi
    
    sleep 5
done
