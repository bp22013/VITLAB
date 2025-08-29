# Ubuntu 20.04ベースでコンパイルされた実行ファイルに対応
FROM ubuntu:20.04

# 非対話モードでの実行を設定
ENV DEBIAN_FRONTEND=noninteractive

# 必要なパッケージをインストール
RUN apt-get update && apt-get install -y \
    curl \
    wget \
    gcc-9 \
    g++-9 \
    libc6-dev \
    build-essential \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Node.js 18をインストール
RUN curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
    && apt-get install -y nodejs

# 作業ディレクトリを設定
WORKDIR /app

# package.jsonとpackage-lock.jsonをコピー（存在する場合）
COPY package*.json ./

# 依存関係をインストール（現在は外部依存関係なし）
# RUN npm install

# アプリケーションのファイルをコピー
COPY . .

# ファイルの存在と権限、アーキテクチャを確認
RUN echo "=== System Information ===" && \
    uname -a && \
    gcc --version && \
    ldd --version && \
    echo "=== Files in current directory ===" && \
    ls -la && \
    echo "=== Server files ===" && \
    ls -la html_server_ver*.js && \
    echo "=== Executable files ===" && \
    find . -name "djk21*" -o -name "up44*" -o -name "*.exe" && \
    echo "=== File information ===" && \
    (file djk21 up44 2>/dev/null || echo "Linux executables not found") && \
    (file *.exe 2>/dev/null || echo "Windows executables not found")

# 実行ファイルに実行権限を付与（djk21に変更）
RUN chmod +x djk21 up44 2>/dev/null || echo "Could not set execute permissions for Linux executables"

# 実行ファイルの依存関係を確認（djk21に変更）
RUN echo "=== Checking dependencies ===" && \
    (ldd djk21 2>/dev/null || echo "Cannot check djk21 dependencies") && \
    (ldd up44 2>/dev/null || echo "Cannot check up44 dependencies")

# 再度権限確認（djk21に変更）
RUN echo "=== After chmod ===" && \
    ls -la djk21 up44 2>/dev/null || echo "djk21 or up44 still not found"

# ポート8081を公開
EXPOSE 8081

# アプリケーションを起動（Ubuntu最適化版を優先）
CMD ["node", "html_server_ver6.1.js"]