# AI Music Studio

AI Music Studio là project full stack gồm React + Vite frontend, Node.js + Express backend và Python audio worker. App có giao diện dark mode hiện đại, sidebar lịch sử chat, chat bằng Gemini, upload audio, audio player, tách stem bằng Demucs và phân tích BPM/Key/hợp âm bằng librosa.

## Cấu trúc

```text
D:\AI-Music-Studio
├── backend
│   ├── routes
│   ├── utils
│   └── server.js
├── frontend
│   └── src
├── worker
│   ├── separate.py
│   ├── analyze.py
│   └── requirements.txt
├── uploads
├── results
├── logs
├── .env.example
└── package.json
```

## Yêu cầu

- Windows 10/11
- Node.js 20 trở lên
- Python 3.10 hoặc 3.11
- FFmpeg đã được cài và có trong `PATH`
- GPU NVIDIA là tùy chọn, Demucs vẫn chạy được bằng CPU nhưng sẽ chậm hơn

## Cài đặt

Mở PowerShell tại `D:\AI-Music-Studio`.

```powershell
cd D:\AI-Music-Studio
npm install
npm run install:all
```

Tạo môi trường Python:

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r worker\requirements.txt
```

Nếu PowerShell chặn activate script, chạy:

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
```

## Cấu hình API key

Copy file mẫu:

```powershell
Copy-Item .env.example .env
```

Cập nhật:

```text
GEMINI_API_KEY=your_gemini_key
PORT=4000
CLIENT_ORIGIN=http://localhost:5173
PYTHON_BIN=python
TEMP_FILE_TTL_MINUTES=30
CLEANUP_INTERVAL_MINUTES=10
```

Nếu chạy bằng virtual environment, có thể đặt:

```text
PYTHON_BIN=D:\AI-Music-Studio\.venv\Scripts\python.exe
```

Backend cũng tự đọc `.env.local` nếu file này tồn tại.

## Chạy project

Chạy cả frontend và backend:

```powershell
npm run dev
```

Hoặc chạy riêng:

```powershell
npm run dev:backend
npm run dev:frontend
```

Mở trình duyệt:

```text
http://localhost:5173
```

Backend chạy ở:

```text
http://localhost:4000
```

## API

### POST `/api/chat`

Body:

```json
{
  "messages": [
    { "role": "user", "content": "Gợi ý hợp âm cho track pop 120 BPM" }
  ]
}
```

Route này sử dụng Gemini với model mặc định `gemini-1.5-flash`. Nếu Gemini lỗi hoặc thiếu `GEMINI_API_KEY`, backend trả lời bằng fallback local FAQ và ghi lỗi chi tiết vào console backend.

### POST `/api/upload`

Form data:

```text
audio=<mp3|wav|flac file>
```

File upload được lưu tạm tại:

```text
D:\AI-Music-Studio\uploads
```

Giới hạn upload tối đa là 100 MB. File upload tự động hết hạn sau 30 phút.

### POST `/api/audio/separate`

Body:

```json
{
  "fileName": "uploaded-file.wav",
  "stem": "vocals"
}
```

`stem` nhận `vocals`, `instrumental`, `drums`, hoặc `bass`.

Kết quả được lưu tạm theo từng bài tại:

```text
D:\AI-Music-Studio\results\<ten-file-upload>
```

Khi file upload hết hạn, backend xóa cả thư mục kết quả tương ứng của bài hát.

### POST `/api/audio/analyze`

Body:

```json
{
  "fileName": "uploaded-file.wav",
  "action": "bpm"
}
```

`action` nhận `bpm`, `key`, hoặc `chords`.

## Ghi chú Demucs

Lần đầu chạy tách stem, Demucs có thể tải model và mất thời gian. Nếu lỗi liên quan FFmpeg, hãy cài FFmpeg rồi kiểm tra:

```powershell
ffmpeg -version
```

Nếu tách stem bằng CPU quá chậm, nên chạy trên máy có GPU NVIDIA và bản PyTorch hỗ trợ CUDA.

## Cleanup file tạm

Backend chạy cleanup job tự động:

- File upload và file kết quả chỉ được lưu tạm.
- TTL mặc định: 30 phút.
- Cleanup chạy mỗi 10 phút.
- Khi upload hết hạn, toàn bộ thư mục kết quả của bài hát cũng bị xóa.
- Log các file/thư mục đã xóa được ghi tại `logs\deleted-files.log`.

Có thể chỉnh TTL trong `.env`:

```text
TEMP_FILE_TTL_MINUTES=30
CLEANUP_INTERVAL_MINUTES=10
```
