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
        req.on('end', async () => {
            try {
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

                const walkingSpeed = parseFloat(p.get('walkingSpeed')) || 80; // m/min

                console.log(`実行コマンド1: ./spfa21 ${p.get('param1')} ${p.get('param2')}`);
                console.log(`実行コマンド2: ./up44 ${args}`);

                const shortest = execSync(`./spfa21 ${p.get('param1')} ${p.get('param2')}`, {
                    encoding: 'utf8',
                    cwd: __dirname,
                });
                console.log(`spfa21実行結果: ${shortest}`);

                const userPrefStdOut = execSync(`./up44 ${args}`, {
                    encoding: 'utf8',
                    cwd: __dirname,
                });
                console.log(`up44実行結果(stdout): ${userPrefStdOut}`);

                const userPref = fs.readFileSync('result2.txt', 'utf8');

                // Calculation logic starts here
                const routeEdges = userPref.split('\n').filter(l => l.trim() !== '').map(l => l.replace('.geojson', ''));

                const routeInfoCsv = fs.readFileSync('oomiya_route_inf_4.csv', 'utf8');
                const signalInfoCsv = fs.readFileSync('signal_inf.csv', 'utf8');

                const routeDataMap = new Map();
                routeInfoCsv.split('\n').slice(1).forEach(line => {
                    if (line.trim() === '') return;
                    const cols = line.trim().split(',');
                    routeDataMap.set(`${cols[0]}-${cols[1]}`, { distance: parseFloat(cols[2]), isSignal: cols[8] === '1' });
                });

                const signalDataMap = new Map();
                signalInfoCsv.split('\n').slice(1).forEach(line => {
                    if (line.trim() === '') return;
                    const cols = line.trim().split(',');
                    signalDataMap.set(`${cols[0]}-${cols[1]}`, { cycle: parseInt(cols[2], 10), green: parseInt(cols[3], 10) });
                });

                let totalDistance = 0;
                routeEdges.forEach(edge => {
                    const edgeData = routeDataMap.get(edge);
                    if (edgeData) {
                        totalDistance += edgeData.distance;
                    }
                });

                let totalTime = totalDistance / walkingSpeed; // in minutes

                let totalExpectedWaitTimeSeconds = 0;
                for (const edge of routeEdges) {
                    const edgeData = routeDataMap.get(edge);
                    if (edgeData && edgeData.isSignal) {
                        const signalData = signalDataMap.get(edge);
                        if (signalData && signalData.cycle > 0) {
                            const redTime = signalData.cycle - signalData.green;
                            if (redTime > 0) {
                                const expectedWaitTime = (redTime * redTime) / (2 * signalData.cycle);
                                totalExpectedWaitTimeSeconds += expectedWaitTime;
                            }
                        }
                    }
                }

                const totalExpectedWaitTimeMinutes = totalExpectedWaitTimeSeconds / 60;
                totalTime += totalExpectedWaitTimeMinutes;

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    shortest,
                    userPref,
                    totalDistance,
                    totalTime
                }));

            } catch (err) {
                console.error(`実行エラー詳細: ${err.message}`);
                console.error(`stderr: ${err.stderr}`);
                console.error(`stdout: ${err.stdout}`);
                console.error(`status: ${err.status}`);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: err.message, stderr: err.stderr, stdout: err.stdout }));
            }
        });
        return;
    }

    /* ===== 特定の信号までの待ち時間計算(ユーザー指定ロジック) ===== */
    if (req.url === '/calculate-wait-time' && req.method === 'POST') {
        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', () => {
            console.log('\n--- [/calculate-wait-time]リクエスト受信 ---');
            try {
                console.log('Request body:', body);
                const { referenceEdge, walkingSpeed } = JSON.parse(body);
                if (!referenceEdge || !walkingSpeed) {
                    throw new Error("referenceEdgeとwalkingSpeedは必須です。");
                }
                console.log(`[OK] パラメータ取得: referenceEdge=${referenceEdge}, walkingSpeed=${walkingSpeed}`);

                // Robustness checks
                if (!fs.existsSync('signal_inf.csv')) throw new Error('サーバーに signal_inf.csv が見つかりません。');
                if (!fs.existsSync('result2.txt')) throw new Error('result2.txt が見つかりません。先に経路を計算してください。');
                console.log('[OK] 必須ファイルの存在を確認');

                // 1. Read data files
                const routeInfoCsv = fs.readFileSync('oomiya_route_inf_4.csv', 'utf8');
                const signalInfoCsv = fs.readFileSync('signal_inf.csv', 'utf8');
                const routeResultTxt = fs.readFileSync('result2.txt', 'utf8');
                console.log('[OK] データファイルの読み込み完了');

                if (signalInfoCsv.trim() === '') throw new Error('signal_inf.csv が空です。');
                if (routeResultTxt.trim() === '') throw new Error('result2.txt が空です。');
                console.log('[OK] ファイルが空でないことを確認');

                // 2. Create lookup maps
                const routeDataMap = new Map();
                routeInfoCsv.split('\n').slice(1).forEach(line => {
                    if (line.trim() === '') return;
                    const cols = line.trim().split(',');
                    routeDataMap.set(`${cols[0]}-${cols[1]}`, { distance: parseFloat(cols[2]), isSignal: cols[8] === '1' });
                });

                const signalDataMap = new Map();
                signalInfoCsv.split('\n').slice(1).forEach(line => {
                    if (line.trim() === '') return;
                    const cols = line.trim().split(',');
                    signalDataMap.set(`${cols[0]}-${cols[1]}`, { cycle: parseInt(cols[2], 10), green: parseInt(cols[3], 10), phase: parseInt(cols[4], 10) });
                });
                console.log('[OK] データマップの作成完了');

                const routeEdges = routeResultTxt.split('\n').filter(l => l.trim() !== '').map(l => l.replace('.geojson', ''));
                const signalizedRouteEdges = routeEdges.filter(edge => routeDataMap.get(edge)?.isSignal);

                // 3. Get reference phase
                const referenceSignalData = signalDataMap.get(referenceEdge);
                if (!referenceSignalData) {
                    throw new Error(`基準信号 ${referenceEdge} が signal_inf.csv に見つかりません。`);
                }
                const referencePhase = referenceSignalData.phase;
                console.log(`[OK] 基準位相を取得: ${referencePhase}`);

                // 4. Simulate and calculate wait time
                console.log('シミュレーションを開始...');
                let totalWaitTime = 0;
                let cumulativeTime = 0; 

                for (const edge of routeEdges) {
                    const edgeData = routeDataMap.get(edge);
                    if (!edgeData) continue;

                    const travelTime = edgeData.distance / walkingSpeed;
                    cumulativeTime += travelTime;

                    if (signalizedRouteEdges.includes(edge)) {
                        const signalData = signalDataMap.get(edge);
                        if (signalData) {
                            const phaseDiff = Math.abs(signalData.phase - referencePhase);
                            const arrivalTime = cumulativeTime;
                            const timeIntoCycle = (arrivalTime - phaseDiff + signalData.cycle) % signalData.cycle;

                            if (timeIntoCycle > signalData.green) {
                                const waitTime = signalData.cycle - timeIntoCycle;
                                totalWaitTime += waitTime;
                                cumulativeTime += waitTime;
                            }
                        }
                    }
                }
                console.log(`[OK] シミュレーション完了。総待ち時間: ${totalWaitTime}秒`);

                const responsePayload = { totalWaitTime: totalWaitTime / 60 };
                console.log('成功レスポンスを送信:', JSON.stringify(responsePayload));
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(responsePayload));

            } catch (err) {
                console.error('!!! /calculate-wait-time でエラー発生 !!!');
                console.error('エラーメッセージ:', err.message);
                console.error('スタックトレース:', err.stack);
                const errorPayload = { error: err.message };
                console.log('エラーレスポンスを送信:', JSON.stringify(errorPayload));
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(errorPayload));
            }
        });
        return;
    }

    /* ===== 信号待ち時間計算用のエンドポイント ===== */
    if (req.url === '/calculate-wait-time' && req.method === 'POST') {
        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', () => {
            try {
                const { startTime = 0 } = JSON.parse(body);

                // 1. 必要なデータを読み込み
                const routeInfoCsv = fs.readFileSync('oomiya_route_inf_4.csv', 'utf8');
                const signalInfoCsv = fs.readFileSync('signal_inf.csv', 'utf8');
                const routeResultTxt = fs.readFileSync('result2.txt', 'utf8');

                // 2. Process data into efficient lookup maps
                const routeDataMap = new Map();
                const routeInfoLines = routeInfoCsv.split('\n').slice(1); // skip header
                for (const line of routeInfoLines) {
                    if (line.trim() === '') continue;
                    const cols = line.trim().split(',');
                    const timeInMinutes = parseFloat(cols[3]);
                    const isSignal = cols[8] === '1';
                    routeDataMap.set(`${cols[0]}-${cols[1]}`, { time: timeInMinutes, isSignal });
                }

                const signalDataMap = new Map();
                const signalInfoLines = signalInfoCsv.split('\n');
                for (const line of signalInfoLines) {
                    if (line.trim() === '') continue;
                    const cols = line.trim().split(',');
                    signalDataMap.set(`${cols[0]}-${cols[1]}`, {
                        cycle: parseInt(cols[2], 10),
                        green: parseInt(cols[3], 10),
                        phase: parseInt(cols[4], 10),
                    });
                }

                // 3. 計算REを取得
                const routeEdges = routeResultTxt
                    .split('\n')
                    .filter((l) => l.trim() !== '')
                    .map((l) => l.replace('.geojson', ''));

                // 4. 総待ち時間を計算
                let totalWaitTime = 0;
                let cumulativeTime = startTime * 60;

                for (const edge of routeEdges) {
                    const edgeData = routeDataMap.get(edge);
                    if (!edgeData) continue;

                    cumulativeTime += edgeData.time * 60;

                    if (edgeData.isSignal) {
                        const signalData = signalDataMap.get(edge);
                        if (signalData) {
                            const { cycle, green, phase } = signalData;
                            const arrivalTime = cumulativeTime;
                            const timeIntoCycle = (arrivalTime - phase + cycle) % cycle;

                            if (timeIntoCycle > green) {
                                const waitTime = cycle - timeIntoCycle;
                                totalWaitTime += waitTime;
                                cumulativeTime += waitTime;
                            }
                        }
                    }
                }

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ totalWaitTime: totalWaitTime / 60 }));
            } catch (err) {
                console.error(`Wait time calculation error: ${err.message}`);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: err.message }));
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

    /* ===== /list_saved_routes への GET ===== */
    if (req.url === '/list_saved_routes' && req.method === 'GET') {
        const saveDir = path.join(__dirname, 'saving_route');
        if (!fs.existsSync(saveDir)) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify([])); // ディレクトリがなければ空配列を返す
            return;
        }
        fs.readdir(saveDir, (err, files) => {
            if (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Failed to list files' }));
                return;
            }
            const csvFiles = files.filter((file) => file.toLowerCase().endsWith('.csv'));
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(csvFiles));
        });
        return;
    }

    /* ===== /get_saved_route への GET ===== */
    if (req.url.startsWith('/get_saved_route') && req.method === 'GET') {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const fileName = url.searchParams.get('fileName');
        if (!fileName) {
            res.writeHead(400, { 'Content-Type': 'text/plain' });
            res.end('File name is required');
            return;
        }

        const filePath = path.join(__dirname, 'saving_route', fileName);
        if (fs.existsSync(filePath)) {
            fs.readFile(filePath, 'utf8', (err, data) => {
                if (err) {
                    res.writeHead(500, { 'Content-Type': 'text/plain' });
                    res.end('Error reading file');
                    return;
                }
                res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8' });
                res.end(data);
            });
        } else {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('File not found');
        }
        return;
    }

    /* ===== /save_route への POST ===== */
    if (req.url.startsWith('/save_route') && req.method === 'POST') {
        let body = '';
        req.on('data', (chunk) => (body += chunk));
        req.on('end', () => {
            try {
                let { fileName, csvContent, overwrite } = JSON.parse(body);

                if (!fileName.toLowerCase().endsWith('.csv')) {
                    fileName += '.csv';
                }

                const saveDir = path.join(__dirname, 'saving_route');
                const filePath = path.join(saveDir, fileName);

                if (!fs.existsSync(saveDir)) {
                    fs.mkdirSync(saveDir, { recursive: true });
                }

                if (fs.existsSync(filePath) && !overwrite) {
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ status: 'exists', finalFileName: fileName }));
                } else {
                    fs.writeFileSync(filePath, csvContent, 'utf8');
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ status: 'success', finalFileName: fileName }));
                }
            } catch (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ status: 'error', message: err.message }));
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
