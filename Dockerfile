FROM node:20-bullseye

WORKDIR /app

# Copy all folders
COPY . .

# Install backend dependencies
WORKDIR /app/backend
RUN npm install

# Set port to Hugging Face default
ENV PORT=7860
EXPOSE 7860

# Run Express server
CMD ["node", "server.js"]
