#!/bin/bash
# scripts/deploy.sh

PROJECT_ROOT="/home/suibari/work/bsky-affirmative-bot"
cd $PROJECT_ROOT

# pull前の最新コミットIDを記録
OLD_COMMIT=$(git rev-parse HEAD)
git pull origin main
NEW_COMMIT=$(git rev-parse HEAD)

# 依存関係のインストールとビルド
pnpm install --frozen-lockfile
pnpm build # 共有ライブラリを含め一括ビルド（差分ビルドなので速いです）

# 変更があった場所を特定
DIFF_FILES=$(git diff --name-only $OLD_COMMIT $NEW_COMMIT)

RESTART_BOT=false
RESTART_BIO=false

# 判定ロジック
if echo "$DIFF_FILES" | grep -q "packages/"; then
    # 共有ライブラリが変わったら両方再起動
    RESTART_BOT=true
    RESTART_BIO=true
fi

if echo "$DIFF_FILES" | grep -q "apps/bsky_bot_server/"; then
    RESTART_BOT=true
fi

if echo "$DIFF_FILES" | grep -q "apps/biorhythm_server/"; then
    RESTART_BIO=true
fi

# 実際の再起動処理
if [ "$RESTART_BIO" = true ]; then
    echo "♻️  Restarting Biorhythm Server..."
    sudo systemctl restart biorhythm-server.service
fi

if [ "$RESTART_BOT" = true ]; then
    echo "♻️  Restarting Bot Server..."
    sudo systemctl restart bsky-bot.service
fi