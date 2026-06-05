FROM node:22-bookworm

RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

RUN pip3 install --break-system-packages \
    torch torchvision torchaudio \
    --index-url https://download.pytorch.org/whl/cpu

RUN pip3 install --break-system-packages \
    yt-dlp \
    demucs \
    librosa \
    soundfile \
    numpy \
    scipy

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 4000

CMD ["npm", "start"]