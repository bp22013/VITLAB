// 機能統合用サーバー（mimeパッケージを使用する場合）
const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// mimeパッケージの正しい使用方法
let mime;
try {
    mime = require('mime-types'); // mime-types パッケージを使用
} catch (e) {
    try {
        const mimeLib = require('mime');
        // 新しいバージョンのmimeパッケージの場合
        mime = {
            lookup: mimeLib.lookup || mimeLib.getType,
        };
    } catch (e2) {
        // フォールバック
        mime = {
            lookup: (filePath) => {
                const ext = path.extname(filePath).toLowerCase();
                const mimeTypes = {
                    '.html': 'text/html',
                    '.css': 'text/css',
                    '.js': 'text/javascript',
                    '.json': 'application/json',
                    '.png': 'image/png',
                    '.jpg': 'image/jpeg',
                    '.jpeg': 'image/jpeg',
                    '.gif': 'image/gif',
                    '.svg': 'image/svg+xml',
                    '.txt': 'text/plain',
                    '.csv': 'text/csv',
                    '.geojson': 'application/geo+json',
                };
                return mimeTypes[ext] || 'application/octet-stream';
            },
        };
    }
}

const server = http.createServer(async (req, res) => {
    /* ===== ① すべてのレスポンスに CORS ヘッダーを付与 ===== */
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    /* ===== ② プリフライトなら何もせず返す ===== */
    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        return res.end();
    }

    /* ===== ③ /calc への POST ===== */
    if (req.url === '/calc' && req.method === 'POST') {
        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', () => {
            const p = new URLSearchParams(body);

            const args = [
                p.get('weight0'),
                p.get('weight1'),
                p.get('weight2'),
                p.get('weight3'),
                p.get('weight4'),
                p.get('weight5'),
                p.get('weight6'),
                p.get('weight7'),
                p.get('weight8'),
                p.get('weight9'),
                p.get('weight10'),
                p.get('weight11'),
                p.get('weight12'),
                p.get('param1'),
                p.get('param2'),
            ].join(' ');

            try {
                console.log(`実行コマンド1: ./spfa21 ${p.get('param1')} ${p.get('param2')}`);
                console.log(`実行コマンド2: ./up44 ${args}`);

                const shortest = execSync(`./spfa21 ${p.get('param1')} ${p.get('param2')}`, {
                    encoding: 'utf8',
                    cwd: __dirname,
                });
                console.log(`spfa21実行結果: ${shortest}`);

                const userPref = execSync(`./up44 ${args}`, {
                    encoding: 'utf8',
                    cwd: __dirname,
                });
                console.log(`up44実行結果: ${userPref}`);

                res.writeHead(200, { 'Content-Type': 'text/plain' });
                res.end(`最短経路結果:\n${shortest}\n\nユーザー好み結果:\n${userPref}`);
            } catch (err) {
                console.error(`実行エラー詳細: ${err.message}`);
                console.error(`stderr: ${err.stderr}`);
                console.error(`stdout: ${err.stdout}`);
                console.error(`status: ${err.status}`);
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end(`Error: ${err.message}\nstderr: ${err.stderr}\nstdout: ${err.stdout}`);
            }
        });
        return;
    }

    /* ===== ④ /csv-data への GET - CSVデータを返す ===== */
    if (req.url === '/csv-data' && req.method === 'GET') {
        try {
            const csvPath = path.join(__dirname, 'oomiya_route_inf_4.csv');
            const csvData = fs.readFileSync(csvPath, 'utf8');
            res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8' });
            res.end(csvData);
        } catch (err) {
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end(`CSV Error: ${err.message}`);
        }
        return;
    }

    /* ===== ⑤ /route-analysis への POST - ルート解析 ===== */
    if (req.url === '/route-analysis' && req.method === 'POST') {
        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', () => {
            try {
                const requestData = JSON.parse(body);
                const { startNode, endNode, weights } = requestData;

                const csvPath = path.join(__dirname, 'oomiya_route_inf_4.csv');
                const csvData = fs.readFileSync(csvPath, 'utf8');

                const routes = analyzeRoutes(csvData, startNode, endNode, weights);

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true, routes: routes }));
            } catch (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: err.message }));
            }
        });
        return;
    }

    /* ===== 通常ファイルの配信 ===== */
    const filePath = path.join(__dirname, req.url === '/' ? 'min_map_ver4.1.html' : req.url);

    const actualFilePath = fs.existsSync(filePath)
        ? filePath
        : path.join(__dirname, req.url === '/' ? 'min_map_ver4.0.html' : req.url);

    fs.readFile(actualFilePath, (err, data) => {
        if (err) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            return res.end('Not Found');
        }
        // mime.lookup() を使用
        res.writeHead(200, {
            'Content-Type': mime.lookup(actualFilePath) || 'application/octet-stream',
        });
        res.end(data);
    });
});

// ルート解析関数（サンプル実装）
function analyzeRoutes(csvData, startNode, endNode, weights) {
    const lines = csvData.split('\n');
    const headers = lines[0].split(',');
    const routes = [];

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const values = line.split(',');
        const route = {};

        headers.forEach((header, index) => {
            route[header.trim()] = values[index];
        });

        if (
            route.node1 == startNode ||
            route.node2 == startNode ||
            route.node1 == endNode ||
            route.node2 == endNode
        ) {
            routes.push(route);
        }
    }

    return routes;
}

/* ===== ポート 8081 で待ち受け ===== */
server.listen(8081, () => {
    console.log('Server is running at http://localhost:8081');
});