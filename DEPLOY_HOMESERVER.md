# Hướng dẫn Deploy Backend Battleship trên Home Server qua Cloudflare Tunnels & Frontend trên Vercel

Tài liệu này cung cấp hướng dẫn chi tiết từng bước để triển khai hệ thống game Battleship theo mô hình phân tách:
*   **Backend (NestJS API, PostgreSQL, Redis)**: Chạy trên Home Server cá nhân bằng Docker Compose, expose ra internet thông qua Cloudflare Tunnels.
*   **Frontend (React + Vite)**: Triển khai trực tiếp lên Vercel để tối ưu tốc độ tải và phân phối tĩnh.

---

## Tổng quan kiến trúc hệ thống

```mermaid
graph TD
    User([Người chơi]) -->|HTTPS/WSS| ClientVercel[Frontend: battleship.vercel.app]
    User -->|HTTPS/WSS| CFTunnel[Cloudflare Edge / Tunnel]
    CFTunnel -->|Local HTTP| HomeServer[Home Server: localhost:3000]
    subgraph Home Server (Docker Compose)
        HomeServer -->|3000| ServerContainer[NestJS Server Container]
        ServerContainer -->|Internal:5432| PostgresContainer[(PostgreSQL Container)]
        ServerContainer -->|Internal:6379| RedisContainer[(Redis Container)]
    end
```

---

## BƯỚC 1: Cấu hình và chạy Backend trên Home Server

### 1. Chuẩn bị file Docker Compose cho Backend
Ở thư mục gốc của dự án trên Home Server, tạo file [docker-compose.backend.yml](file:///e:/codingStorage/Projects/battleship-game/docker-compose.backend.yml) (đã lược bỏ service client vì client sẽ deploy trên Vercel):

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    container_name: battleship-postgres
    restart: unless-stopped
    environment:
      POSTGRES_DB: ${DB_NAME}
      POSTGRES_USER: ${DB_USER}
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    ports:
      - '${DB_PORT}:5432'
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U ${DB_USER} -d ${DB_NAME}']
      interval: 5s
      timeout: 5s
      retries: 10

  redis:
    image: redis:7-alpine
    container_name: battleship-redis
    restart: unless-stopped
    command: ["redis-server", "--appendonly", "yes", "--requirepass", "${REDIS_PASSWORD}"]
    ports:
      - '${REDIS_PORT}:6379'
    healthcheck:
      test: ["CMD-SHELL", "redis-cli -a ${REDIS_PASSWORD} ping | grep PONG"]
      interval: 5s
      timeout: 5s
      retries: 10

  server:
    build:
      context: ./server
      dockerfile: Dockerfile
    container_name: battleship-server
    restart: unless-stopped
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    environment:
      PORT: 3000
      NODE_ENV: production
      CLIENT_URL: ${CLIENT_URL}
      JWT_SECRET: ${JWT_SECRET}
      JWT_REFRESH_SECRET: ${JWT_REFRESH_SECRET}
      ACCESS_TOKEN_EXPIRES_IN: ${ACCESS_TOKEN_EXPIRES_IN}
      REFRESH_TOKEN_EXPIRES_IN: ${REFRESH_TOKEN_EXPIRES_IN}
      REFRESH_TOKEN_ABSOLUTE_TTL_DAYS: ${REFRESH_TOKEN_ABSOLUTE_TTL_DAYS}
      REFRESH_TOKEN_COOKIE_NAME: ${REFRESH_TOKEN_COOKIE_NAME}
      REFRESH_TOKEN_COOKIE_MAX_AGE_MS: ${REFRESH_TOKEN_COOKIE_MAX_AGE_MS}
      COOKIE_SECURE: ${COOKIE_SECURE}
      COOKIE_SAME_SITE: ${COOKIE_SAME_SITE}
      COOKIE_PATH: ${COOKIE_PATH}
      COOKIE_DOMAIN: ${COOKIE_DOMAIN}
      DB_HOST: postgres
      DB_PORT: 5432
      DB_NAME: ${DB_NAME}
      DB_USER: ${DB_USER}
      DB_PASSWORD: ${DB_PASSWORD}
      DB_SYNCHRONIZE: ${DB_SYNCHRONIZE}
      DB_LOGGING: ${DB_LOGGING}
      REDIS_HOST: redis
      REDIS_PORT: 6379
      REDIS_DB: ${REDIS_DB}
      REDIS_PASSWORD: ${REDIS_PASSWORD}
      CHAT_HISTORY_LIMIT: ${CHAT_HISTORY_LIMIT}
      CHAT_HISTORY_TTL_SECONDS: ${CHAT_HISTORY_TTL_SECONDS}
      SHOPAIKEY_API_KEY: ${SHOPAIKEY_API_KEY}
      SHOPAIKEY_GENAI_BASE_URL: ${SHOPAIKEY_GENAI_BASE_URL}
      SHOPAIKEY_GENAI_MODEL: ${SHOPAIKEY_GENAI_MODEL}
      CLOUDINARY_CLOUD_NAME: ${CLOUDINARY_CLOUD_NAME}
      CLOUDINARY_API_KEY: ${CLOUDINARY_API_KEY}
      CLOUDINARY_API_SECRET: ${CLOUDINARY_API_SECRET}
    ports:
      - '${PORT}:3000'
    volumes:
      - uploads_data:/app/uploads

volumes:
  postgres_data:
  uploads_data:
```

### 2. Chuẩn bị file `.env` cho Backend
Tạo file `.env` ở thư mục gốc trên Home Server bằng cách sao chép từ [.env.backend.example](file:///e:/codingStorage/Projects/battleship-game/.env.backend.example) và cấu hình lại.

> [!IMPORTANT]
> **Cấu hình Cookie chéo tên miền (Cross-Site Cookies):**
> Vì frontend chạy trên tên miền Vercel (ví dụ: `https://battleship-game.vercel.app`) và backend chạy trên tên miền tunnel của bạn (ví dụ: `https://api.yourdomain.com`), trình duyệt sẽ chặn cookie nếu cấu hình không đúng.
> Bạn **BẮT BUỘC** phải thiết lập các biến sau:
> *   `COOKIE_SECURE=true` (Chỉ truyền cookie qua HTTPS - Cloudflare Tunnel sẽ cung cấp HTTPS).
> *   `COOKIE_SAME_SITE=none` (Cho phép truyền cookie cross-site từ Vercel sang Home Server).
> *   `CLIENT_URL=https://<your-vercel-project>.vercel.app` (Link web Vercel sau khi deploy, dùng để cấp quyền CORS).

Ví dụ `.env` hoàn chỉnh trên Home Server:
```env
PORT=3000
CLIENT_URL=https://battleship-game-yourname.vercel.app

DB_PORT=5432
DB_NAME=battleship
DB_USER=postgres
DB_PASSWORD=MậtKhẩuDatabaseSiêuMạnh123@
DB_SYNCHRONIZE=false
DB_LOGGING=false

REDIS_PORT=6379
REDIS_DB=0
REDIS_PASSWORD=MậtKhẩuRedisSiêuMạnh456@
CHAT_HISTORY_LIMIT=80
CHAT_HISTORY_TTL_SECONDS=43200

JWT_SECRET=ChuoiJWTSecretSieuDaiVaKhongTheDoanDuoc1122
JWT_REFRESH_SECRET=ChuoiJWTRefreshSecretKhacNuaNhe9988
ACCESS_TOKEN_EXPIRES_IN=1h
REFRESH_TOKEN_EXPIRES_IN=30d
REFRESH_TOKEN_ABSOLUTE_TTL_DAYS=180

# CẤU HÌNH QUAN TRỌNG ĐỂ CHẠY CHÉO DOMAIN VỚI VERCEL
COOKIE_SECURE=true
COOKIE_SAME_SITE=none
COOKIE_PATH=/
COOKIE_DOMAIN=
REFRESH_TOKEN_COOKIE_NAME=refresh_token
REFRESH_TOKEN_COOKIE_MAX_AGE_MS=2592000000

# Cấu hình AI & Cloudinary nếu dùng
SHOPAIKEY_API_KEY=
SHOPAIKEY_GENAI_BASE_URL=https://api.shopaikey.com
SHOPAIKEY_GENAI_MODEL=gemini-2.5-flash
CLOUDINARY_CLOUD_NAME=name
CLOUDINARY_API_KEY=key
CLOUDINARY_API_SECRET=secret
```

### 3. Khởi động các container trên Home Server
Sử dụng lệnh sau để khởi chạy:
```bash
docker compose -f docker-compose.backend.yml up -d --build
```

### 4. Chạy Database Migrations bên trong container
Do backend trong container production không chứa các thư viện hỗ trợ dev như `ts-node`, bạn cần chạy database migrations sử dụng trực tiếp engine TypeORM CLI trỏ tới file JS đã build:

```bash
docker compose -f docker-compose.backend.yml exec server npx typeorm migration:run -d dist/database/data-source.js
```
*Sau khi chạy, bạn sẽ thấy log thông báo toàn bộ bảng được khởi tạo thành công.*

---

## BƯỚC 2: Cấu hình Cloudflare Tunnels để kết nối ra Internet

Để frontend trên Vercel có thể kết nối tới backend trên Home Server một cách an toàn thông qua giao thức HTTPS và WebSockets mà không cần mở port modem (Port Forwarding), chúng ta sử dụng Cloudflare Tunnels.

Dưới đây là hướng dẫn thiết lập từng bước chi tiết để cấu hình tên miền phụ `api.battleship.namkhuc.id.vn` trỏ về Backend NestJS chạy trên Home Server.

---

### PHẦN A: Tạo Tunnel & Lấy Token từ Cloudflare Zero Trust

1.  **Truy cập Dashboard**: Đăng nhập vào tài khoản Cloudflare của bạn, click chọn **Zero Trust** ở menu bên trái (hoặc truy cập trực tiếp **[Cloudflare Zero Trust Dashboard](https://one.dash.cloudflare.com/)**).
2.  **Tạo Tunnel**:
    *   Truy cập **Networks** > **Tunnels** trên thanh menu bên trái.
    *   Bấm nút **Add a tunnel** hoặc **Create a tunnel**.
    *   Chọn loại **Cloudflared** (mặc định) và bấm **Next**.
    *   **Name your tunnel**: Nhập một tên dễ nhớ, ví dụ: `battleship-home-tunnel` và nhấn **Save tunnel**.
3.  **Lấy Tunnel Token**:
    *   Sau khi bấm lưu, bạn sẽ chuyển đến màn hình cài đặt tác nhân (`cloudflared`).
    *   Tại phần **Choose environment**, bạn sẽ thấy các lựa chọn như Windows, macOS, Debian, Redhat, Docker.
    *   Chọn tab **Docker**. Bạn sẽ nhìn thấy một câu lệnh chạy container mẫu, ví dụ:
        ```bash
        docker run cloudflare/cloudflared:latest tunnel --no-autoupdate run --token eyJhIjoi...
        ```
    *   **Hãy copy đoạn mã token dài phía sau `--token`** (đoạn token bắt đầu bằng `ey...`). Đây chính là `CLOUDFLARE_TUNNEL_TOKEN` của bạn.

---

### PHẦN B: Khởi chạy Cloudflared Daemon trên Home Server

Có hai cách phổ biến để chạy dịch vụ tunnel này trên máy chủ của bạn:

#### Cách 1: Tích hợp trực tiếp vào Docker Compose (Khuyên dùng - Tiện lợi nhất)
Cách này giúp bạn chạy dịch vụ Tunnel chung với Database, Redis và API Server mà không cần cài đặt thêm phần mềm nào lên hệ điều hành chính của Home Server.

1.  Mở file `.env` ở thư mục gốc của bạn trên Home Server và thêm biến token vừa copy vào:
    ```env
    # Token Cloudflare Tunnel bạn vừa lấy ở PHẦN A
    CLOUDFLARE_TUNNEL_TOKEN=eyJhIjoicmVjb3JkX2lk...
    ```
2.  Mở file `docker-compose.backend.yml` ra và **bỏ dấu comment (`#`)** của service `cloudflared` ở cuối file để kích hoạt nó:
    ```yaml
      cloudflared:
        image: cloudflare/cloudflared:latest
        container_name: battleship-tunnel
        restart: unless-stopped
        command: tunnel --no-autoupdate run
        environment:
          - TUNNEL_TOKEN=${CLOUDFLARE_TUNNEL_TOKEN}
        depends_on:
          - server
    ```
3.  Chạy lại Docker Compose để khởi động container Tunnel:
    ```bash
    docker compose -f docker-compose.backend.yml up -d
    ```

#### Cách 2: Cài đặt dịch vụ trực tiếp trên Hệ điều hành Host (Windows/Linux)
*   **Nếu Home Server chạy Linux (Ubuntu/Debian)**: 
    Chọn tab **Debian** hoặc **Ubuntu** trên Cloudflare dashboard, copy câu lệnh cài đặt tự động (bao gồm `curl -L` tải gói `.deb`, `dpkg -i` để cài đặt, và `cloudflared service install ey...` để cài daemon hệ thống).
*   **Nếu Home Server chạy Windows**:
    Tải `cloudflared` exe về máy, chạy PowerShell quyền Admin và thực thi lệnh đăng ký dịch vụ hệ thống:
    ```powershell
    .\cloudflared.exe service install <TOKEN_CỦA_BẠN>
    ```

*Sau khi chạy thành công bằng một trong hai cách trên, trên màn hình Cloudflare Tunnel Dashboard sẽ chuyển trạng thái của Tunnel sang màu xanh lá cây **Connected** (đã kết nối).*

---

### PHẦN C: Định tuyến Tên miền (Public Hostnames) & Kết nối Frontend - Backend

Sau khi tác nhân tunnel trên Home Server đã kết nối thành công tới Cloudflare, chúng ta cần định tuyến tên miền phụ về ứng dụng NestJS.

1.  **Cấu hình Public Hostname**:
    *   Tại trang cấu hình Tunnel trên Cloudflare, bấm **Next** (hoặc bấm Edit Tunnel > chọn tab **Public Hostname**).
    *   Bấm **Add a public hostname**.
    *   Điền thông số định tuyến như sau:
        *   **Subdomain**: `api.battleship`
        *   **Domain**: Chọn tên miền của bạn (`namkhuc.id.vn`).
        *   **Path**: Để trống.
        *   **Service**:
            *   **Type**: Chọn `HTTP`.
            *   **URL**: Cấu hình phụ thuộc vào cách bạn chạy Tunnel ở PHẦN B:
                *   *Nếu dùng Cách 1 (Docker Compose)*: Điền **`battleship-server:3000`** (vì trong mạng Docker, `cloudflared` có thể truy cập trực tiếp container API thông qua hostname của nó là `battleship-server` trên cổng nội bộ `3000`).
                *   *Nếu dùng Cách 2 (Cài trực tiếp lên OS)*: Điền **`localhost:3000`** hoặc **`127.0.0.1:3000`**.
    *   Bấm **Save hostname**. Lúc này Cloudflare sẽ tự động tạo một bản ghi DNS CNAME trỏ `api.battleship.namkhuc.id.vn` về tunnel của bạn.

2.  **Kích hoạt WebSockets trên Cloudflare (Bắt buộc cho game chạy Realtime)**:
    *   Mặc định, Cloudflare Tunnel đã hỗ trợ WebSockets. Để chắc chắn, bạn hãy mở **Cloudflare Dashboard chính** (phần quản lý DNS/Website thông thường).
    *   Chọn Domain `namkhuc.id.vn` > Vào mục **Network** ở menu trái.
    *   Đảm bảo công tắc **WebSockets** đang ở trạng thái **On** (Màu xanh).

3.  **Cấu hình SSL/TLS**:
    *   Trong menu trái của Cloudflare Dashboard, vào **SSL/TLS** > **Overview**.
    *   Chọn chế độ mã hóa là **Full** hoặc **Full (strict)**. Điều này đảm bảo toàn bộ luồng truyền tải giữa Trình duyệt $\rightarrow$ Cloudflare $\rightarrow$ Home Server đều được mã hóa HTTPS/WSS an toàn.

---

### PHẦN D: Kiểm tra giao tiếp giữa Frontend và Backend

Sau khi hoàn thành cấu hình ở PHẦN C, quy trình giao tiếp sẽ như sau:

1.  **Frontend (Vercel)** sẽ gọi API tới: `https://api.battleship.namkhuc.id.vn/api`.
2.  **Cloudflare** nhận request $\rightarrow$ chuyển tiếp mã hóa qua Tunnel an toàn về máy chủ Home Server của bạn.
3.  **Tác nhân cloudflared** trên Home Server nhận dữ liệu từ tunnel $\rightarrow$ bắn request tới cổng `3000` của container `battleship-server`.
4.  **Backend (NestJS)** kiểm tra xem request đến từ origin nào $\rightarrow$ Nếu trùng khớp với biến môi trường `CLIENT_URL` (ví dụ: `https://battleship-game.vercel.app`), backend sẽ trả dữ liệu về kèm theo cookie Refresh Token được cấu hình chéo domain (`SameSite=None; Secure`).

> [!TIP]
> **Cách kiểm tra nhanh kết nối:**
> Mở trình duyệt trên điện thoại hoặc máy tính cá nhân (không chung mạng LAN với Home Server để đảm bảo tính khách quan), truy cập vào đường dẫn:
> `https://api.battleship.namkhuc.id.vn/api`
> Nếu nhận được phản hồi JSON dạng `{"statusCode": 404, "message": "Cannot GET /api"}` từ NestJS, tức là Tunnel đã kết nối thông suốt từ internet vào tận bên trong container backend của bạn! (Lỗi 404 này là bình thường vì không có route nào xử lý riêng cho `/api`).

---

## BƯỚC 3: Deploy Frontend lên Vercel

### 1. Import repository lên Vercel
1.  Đăng nhập vào **[Vercel](https://vercel.com/)** và nhấn **Add New** > **Project**.
2.  Import repository chứa mã nguồn Battleship từ GitHub/GitLab của bạn.

### 2. Cấu hình dự án (Project Settings)
Khi tiến hành cấu hình build, bạn cần chú ý các thông số sau:
*   **Framework Preset**: Chọn **Vite** (hoặc `Other` nếu Vercel tự nhận diện).
*   **Root Directory**: Nhấp vào **Edit** và chọn thư mục [client](file:///e:/codingStorage/Projects/battleship-game/client) (vì dự án của chúng ta là dạng monorepo chứa cả client và server).
*   **Build & Development Settings**:
    *   **Build Command**: Giữ nguyên mặc định `npm run build` (hoặc `vite build`).
    *   **Output Directory**: Giữ nguyên mặc định `dist`.
    *   **Install Command**: Giữ nguyên mặc định `npm install`.

### 3. Cấu hình Environment Variables (Biến môi trường)
Ở phần **Environment Variables**, thêm biến môi trường bắt buộc sau:

| Tên biến (Key) | Giá trị (Value) | Mô tả |
| :--- | :--- | :--- |
| `VITE_API_BASE_URL` | `https://api.yourdomain.com/api` | Đường dẫn API public đã expose qua Cloudflare Tunnel (phải bắt đầu bằng `https://` và kết thúc bằng `/api`) |

*Sau khi cấu hình xong, bấm **Deploy**.*

---

## BƯỚC 4: Kiểm tra và Khắc phục sự cố

### 1. Kiểm tra CORS
Nếu bạn truy cập ứng dụng trên Vercel và thấy màn hình trắng hoặc không gọi được API đăng nhập/đăng ký kèm lỗi CORS trong Console F12:
*   **Nguyên nhân:** Tên miền của Vercel (ví dụ: `https://battleship-game-yourname.vercel.app`) không trùng khớp hoàn toàn với biến `CLIENT_URL` được cấu hình trong file `.env` ở Home Server.
*   **Cách khắc phục:**
    1.  Mở `.env` của backend trên Home Server.
    2.  Kiểm tra và sửa lại `CLIENT_URL` cho khớp chính xác tên miền Vercel (chú ý không được có dấu `/` ở cuối domain).
    3.  Restart lại server: `docker compose -f docker-compose.backend.yml restart server`.

### 2. Kiểm tra Cookie & Xác thực (Authentication)
Nếu bạn đăng nhập thành công nhưng khi tải lại trang bị mất trạng thái đăng nhập, hoặc API lấy thông tin cá nhân `/api/auth/me` trả về lỗi 401:
*   **Nguyên nhân:** Cookie chứa Refresh Token không được trình duyệt gửi kèm trong các request tiếp theo.
*   **Cách khắc phục:**
    *   Đảm bảo đã set `COOKIE_SECURE=true` và `COOKIE_SAME_SITE=none` trong file `.env` của backend.
    *   Kiểm tra tab **Network** trong DevTools (F12) > Click vào request `/api/auth/login` > Kiểm tra xem response header `Set-Cookie` có thuộc tính `Secure; SameSite=None` hay không.

### 3. Kiểm tra kết nối WebSockets (Real-time Match)
Nếu bạn vào phòng game nhưng không thấy thông báo đối thủ sẵn sàng hoặc trạng thái kết nối socket thất bại:
*   **Cách khắc phục:**
    *   Mở DevTools F12 > Chọn tab **Network** > Chọn bộ lọc **WS** (WebSockets).
    *   Kiểm tra dòng kết nối `socket.io` xem có báo đỏ hay không.
    *   Nếu có lỗi kết nối, hãy đảm bảo tính năng WebSockets tại tab **Network** trên Dashboard quản lý domain của Cloudflare đã được kích hoạt.
    *   Đảm bảo cổng WebSocket Gateway trong mã nguồn backend cho phép origin kết nối (mã nguồn game hiện tại đang để `origin: '*'` nên kết nối sẽ thông suốt không bị chặn).

### 4. Xem log trực tiếp của Backend để debug
Để biết chính xác NestJS đang hoạt động thế nào hoặc có lỗi phát sinh gì khi kết nối DB/Redis:
```bash
# Xem log trực tiếp thời gian thực
docker compose -f docker-compose.backend.yml logs -f server

# Xem log của DB
docker compose -f docker-compose.backend.yml logs -f postgres
```
