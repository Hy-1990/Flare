#!/bin/zsh
set -e
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
cd "$(dirname "$0")"
FLARE_PORT=${PORT:-4317}
FLARE_URL="http://127.0.0.1:$FLARE_PORT"

if curl --silent --fail "$FLARE_URL/api/health" | node -e 'let s="";process.stdin.on("data",d=>s+=d);process.stdin.on("end",()=>{try{const d=JSON.parse(s);process.exit(d.ok&&d.localOnly?0:1)}catch{process.exit(1)}})' 2>/dev/null; then
  open "$FLARE_URL"
  exit 0
fi

if ! command -v node >/dev/null || ! command -v ffmpeg >/dev/null; then
  echo "需要先安装 Node.js 22.13+ 和 FFmpeg 7+。请查看 README.md。"
  read "?按回车关闭"
  exit 1
fi
if [ ! -d node_modules ]; then npm install; fi
if [ ! -f dist/index.html ]; then npm run build; fi
(sleep 2; open "$FLARE_URL") &
exec npm start
