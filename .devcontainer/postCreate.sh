#!/bin/bash

echo "🚀 Starting Codespaces Post-Creation Setup..."

# Install http-server globally to serve static web files
echo "📦 Installing static web server..."
npm install -g http-server

# Install backend dependencies
if [ -d "backend" ]; then
    echo "📦 Installing Backend dependencies..."
    cd backend
    npm install
    cd ..
fi

# Install discord bot dependencies
if [ -d "discord-bot" ]; then
    echo "📦 Installing Discord Bot dependencies..."
    cd discord-bot
    npm install
    cd ..
fi

echo "✅ All dependencies installed successfully!"
echo "💡 To run KromaNodes in your Codespace:"
echo "   1. Run 'npm run dev' inside backend/ to start the Express API."
echo "   2. In a new terminal, run 'http-server landing-website/ -p 8000' to host the landing page."
echo "   3. In a new terminal, run 'http-server panel-website/ -p 8080' to host the client panel."
