// keshimasu-server/server.js
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const { rateLimit } = require('express-rate-limit');
const fs = require('fs');
const path = require('path');

const db = require('./db');
const { runMigrations } = require('./init_db');

const {
    hashPasscode,
    comparePasscode,
    consumeDummyComparison,
    generateSessionToken,
    hashSessionToken
} = require('./utils/auth');

const app = express();

app.disable('x-powered-by');
app.set('trust proxy', 1);
// Renderのリバースプロキシを1段だけ信頼する
// express-rate-limitが利用者ごとのIPアドレスを正しく認識するために必要

// API全体に適用する通常のレート制限
const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: {
        message:
            'リクエストが多すぎます。しばらく待ってから再試行してください。'
    }
});

const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: {
        message:
            '新規登録の試行回数が多すぎます。時間を空けて再試行してください。'
    }
});

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    message: {
        message:
            'ログインの試行回数が多すぎます。15分ほど待ってから再試行してください。'
    }
});

const createPuzzleLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    limit: 20,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: {
        message:
            '問題の投稿回数が多すぎます。時間を空けて再試行してください。'
    }
});

const scoreUpdateLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 60,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: {
        message:
            'スコア更新のリクエストが多すぎます。少し待ってから再試行してください。'
    }
});

const PORT = process.env.PORT || 3000;

const SESSION_COOKIE_NAME = 'keshimasu_session';
const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

const NICKNAME_MIN_LENGTH = 1;
const NICKNAME_MAX_LENGTH = 20;

const PASSCODE_MIN_LENGTH = 8;
const PASSCODE_MAX_LENGTH = 72;

const BOARD_ROWS = 8;
const BOARD_COLUMNS = 5;


// ------------------------------
// 辞書データ
// ------------------------------
const COUNTRY_WORDS = require('./data/country_words.json');
const CAPITAL_WORDS = require('./data/capital_words.json');
const POKEMON_WORDS = require('./data/pokemon_words.json');

// ------------------------------
// ミドルウェア
// ------------------------------
const allowedOrigins = new Set([
    'http://localhost:3000',
    'https://kokumei-keshimasu.onrender.com'
]);

app.use(cors({
    origin(origin, callback) {
        // 同一オリジン通信やcurlなど、Originなしの通信を許可
        if (!origin || allowedOrigins.has(origin)) {
            return callback(null, true);
        }

        return callback(new Error('許可されていないオリジンです。'));
    },
    credentials: true,
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type']
}));

app.use(express.json({
    limit: '100kb',
    strict: true
}));

app.use(express.urlencoded({
    extended: false,
    limit: '20kb'
}));

app.use(cookieParser());

// ゲーム画面（index.html / script.js / style.css）は public/ から配信する。
// public/ に置いたファイルはすべて公開されるため、
// .env・data/・server.js などは絶対に入れないこと。
const PUBLIC_DIR = path.join(__dirname, 'public');

if (!fs.existsSync(path.join(PUBLIC_DIR, 'index.html'))) {
    console.warn(
        '⚠️ public/index.html が見つかりません。' +
        ' index.html・script.js・style.css を public/ に置いてください。'
    );
}

app.use(express.static(PUBLIC_DIR));

// 必要なら静的ファイル配信


// ------------------------------
// モード共通ヘルパー
// ------------------------------
const VALID_MODES = ['country', 'capital', 'pokemon'];

function isValidMode(mode) {
    return VALID_MODES.includes(mode);
}

function getClearedColumn(mode) {
    if (mode === 'country') return 'cleared_country_ids';
    if (mode === 'capital') return 'cleared_capital_ids';
    if (mode === 'pokemon') return 'cleared_pokemon_ids';
    return null;
}

function getClearField(mode) {
    if (mode === 'country') return 'country_clears';
    if (mode === 'capital') return 'capital_clears';
    if (mode === 'pokemon') return 'pokemon_clears';
    return null;
}


const RESERVED_NICKNAMES = new Set(['ゲスト', 'guest']);

// ------------------------------
// 問題一覧（clear_count付き）の取得とキャッシュ
// ------------------------------
// プレイヤー全員のクリア済みIDを1回だけ集計して問題に結び付ける。
// （以前は問題ごとに全プレイヤーのJSONBを展開していた）
// 結果は短時間メモリに保存し、問題登録・スコア更新時に破棄する。
const PUZZLE_LIST_CACHE_TTL_MS = 60 * 1000;
const puzzleListCache = new Map();

function invalidatePuzzleListCache(mode) {
    if (mode) {
        puzzleListCache.delete(mode);
    } else {
        puzzleListCache.clear();
    }
}

async function fetchPuzzleList(mode) {
    const cached = puzzleListCache.get(mode);

    if (cached && cached.expiresAt > Date.now()) {
        return cached.rows;
    }

    const clearedColumn = getClearedColumn(mode);

    const result = await db.query(
        `
        WITH clear_counts AS (
            SELECT
                cleared_id.value::integer AS puzzle_id,
                COUNT(DISTINCT pl.id)::integer AS clear_count
            FROM players pl
            CROSS JOIN LATERAL jsonb_array_elements_text(
                CASE
                    WHEN jsonb_typeof(pl.${clearedColumn}) = 'array'
                        THEN pl.${clearedColumn}
                    ELSE '[]'::jsonb
                END
            ) AS cleared_id(value)
            WHERE cleared_id.value ~ '^[0-9]{1,9}$'
            GROUP BY 1
        )
        SELECT
            p.id,
            p.mode,
            p.data,
            p.creator,
            p.created_at,
            COALESCE(c.clear_count, 0) AS clear_count
        FROM puzzles p
        LEFT JOIN clear_counts c
            ON c.puzzle_id = p.id
        WHERE p.mode = $1
        ORDER BY p.id ASC;
        `,
        [mode]
    );

    puzzleListCache.set(mode, {
        rows: result.rows,
        expiresAt: Date.now() + PUZZLE_LIST_CACHE_TTL_MS
    });

    return result.rows;
}

function normalizeNickname(value) {
    if (typeof value !== 'string') {
        return '';
    }

    return value.trim();
}

function validateNickname(nickname) {
    if (!nickname) {
        return 'ニックネームを入力してください。';
    }

    const length = [...nickname].length;

    if (
        length < NICKNAME_MIN_LENGTH ||
        length > NICKNAME_MAX_LENGTH
    ) {
        return `ニックネームは${NICKNAME_MIN_LENGTH}文字以上${NICKNAME_MAX_LENGTH}文字以内で入力してください。`;
    }

    if (/[\u0000-\u001f\u007f]/u.test(nickname)) {
        return 'ニックネームに使用できない文字が含まれています。';
    }

    // ゲスト表示と紛らわしい名前は登録できない
    if (RESERVED_NICKNAMES.has(nickname.normalize('NFKC').toLowerCase())) {
        return 'そのニックネームは使用できません。';
    }

    return null;
}

function validatePasscode(passcode) {
    if (typeof passcode !== 'string') {
        return 'パスコードを入力してください。';
    }

    if (
        passcode.length < PASSCODE_MIN_LENGTH ||
        passcode.length > PASSCODE_MAX_LENGTH
    ) {
        return `パスコードは${PASSCODE_MIN_LENGTH}文字以上${PASSCODE_MAX_LENGTH}文字以内で入力してください。`;
    }

    return null;
}

// 盤面に使える文字
// ・全モード共通: カタカナ1文字（U+30A0〜U+30FF、ただし「・」を除く）と F（ワイルドカード）
// ・ポケモンモードのみ: ♂ ♀ Z 2 ・
// ※クライアントの isValidGameChar と同じ条件にしておくこと
const POKEMON_ONLY_CHARACTERS = new Set(['♂', '♀', 'Z', '2', '・']);

function isValidBoardCharacter(character, mode) {
    if (character === 'F') {
        return true;
    }

    if (POKEMON_ONLY_CHARACTERS.has(character)) {
        return mode === 'pokemon';
    }

    return /^[\u30a0-\u30ff]$/u.test(character);
}

// 空マスの上に浮いた文字を下へ落とす（クライアントの dropBoardLetters と同じ処理）
function dropBoardLetters(board) {
    const rowCount = board.length;
    const result = board.map(row => [...row]);

    for (let column = 0; column < BOARD_COLUMNS; column++) {
        const letters = [];

        for (let row = rowCount - 1; row >= 0; row--) {
            if (board[row][column] !== '') {
                letters.push(board[row][column]);
            }
        }

        for (let row = rowCount - 1; row >= 0; row--) {
            result[row][column] = letters[rowCount - 1 - row] ?? '';
        }
    }

    return result;
}

function normalizeBoardData(boardData, mode) {
    if (!Array.isArray(boardData) || boardData.length !== BOARD_ROWS) {
        return null;
    }

    const normalizedBoard = [];

    for (const row of boardData) {
        if (
            !Array.isArray(row) ||
            row.length !== BOARD_COLUMNS
        ) {
            return null;
        }

        const normalizedRow = [];

        for (const cell of row) {
            if (typeof cell !== 'string') {
                return null;
            }

            // 全角英数・半角カタカナを正規化し、英字は大文字に揃える
            const normalizedCell = cell
                .normalize('NFKC')
                .trim()
                .toUpperCase();

            // 空マスは許可する。入力されている場合は1文字で、かつモードで使える文字のみ
            if (normalizedCell !== '') {
                if ([...normalizedCell].length !== 1) {
                    return null;
                }

                if (!isValidBoardCharacter(normalizedCell, mode)) {
                    return null;
                }
            }

            normalizedRow.push(normalizedCell);
        }

        normalizedBoard.push(normalizedRow);
    }

    // 少なくとも1マスは文字が入っている必要がある
    const hasAnyCharacter = normalizedBoard
        .flat()
        .some(cell => cell !== '');

    if (!hasAnyCharacter) {
        return null;
    }

    // 浮いている文字は下に落とした状態で保存する
    // （重複判定も落とした後の形で行われ、同じ問題の二重登録を防げる）
    return dropBoardLetters(normalizedBoard);
}

function toPublicPlayer(player) {
    return {
        id: player.id,
        nickname: player.nickname,
        country_clears: Number(player.country_clears) || 0,
        capital_clears: Number(player.capital_clears) || 0,
        pokemon_clears: Number(player.pokemon_clears) || 0,
        cleared_country_ids: player.cleared_country_ids || [],
        cleared_capital_ids: player.cleared_capital_ids || [],
        cleared_pokemon_ids: player.cleared_pokemon_ids || []
    };
}

function setSessionCookie(res, token) {
    res.cookie(SESSION_COOKIE_NAME, token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: SESSION_MAX_AGE_MS,
        path: '/'
    });
}

function clearSessionCookie(res) {
    res.clearCookie(SESSION_COOKIE_NAME, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/'
    });
}


// ------------------------------
// 期限切れセッションの削除
// テーブル作成は migrate.js 側で行う。ここでは掃除だけ行い、失敗しても起動を止めない。
// ------------------------------
const SESSION_CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

async function deleteExpiredSessions() {
    try {
        await db.query(`
            DELETE FROM player_sessions
            WHERE expires_at <= NOW();
        `);
    } catch (error) {
        console.error('期限切れセッションの削除に失敗しました。', {
            name: error.name,
            code: error.code
        });
    }
}

// マイグレーション未実行の環境で気付けるように、テーブルの有無だけ確認する
async function warnIfSchemaMissing() {
    try {
        const result = await db.query(`
            SELECT
                to_regclass('public.players') AS players,
                to_regclass('public.puzzles') AS puzzles,
                to_regclass('public.player_sessions') AS player_sessions;
        `);

        const missing = Object.entries(result.rows[0])
            .filter(([, value]) => !value)
            .map(([name]) => name);

        if (missing.length > 0) {
            console.warn(
                '⚠️ テーブルが見つかりません: ' + missing.join(', ') +
                ' / 先に "node migrate.js" を実行してください。'
            );
        }
    } catch (error) {
        console.error('テーブルの確認に失敗しました。', {
            name: error.name,
            code: error.code
        });
    }
}

async function createSession(playerId, res) {
    const token = generateSessionToken();
    const tokenHash = hashSessionToken(token);

    await db.query(
        `
        INSERT INTO player_sessions (
            player_id,
            token_hash,
            expires_at
        )
        VALUES (
            $1,
            $2,
            NOW() + INTERVAL '7 days'
        );
        `,
        [playerId, tokenHash]
    );

    setSessionCookie(res, token);
}

async function getAuthenticatedPlayer(req) {
    const token = req.cookies[SESSION_COOKIE_NAME];

    if (!token || typeof token !== 'string') {
        return null;
    }

    const tokenHash = hashSessionToken(token);

    const result = await db.query(
        `
        SELECT
            p.id,
            p.nickname,
            p.country_clears,
            p.capital_clears,
            p.pokemon_clears,
            p.cleared_country_ids,
            p.cleared_capital_ids,
            p.cleared_pokemon_ids
        FROM player_sessions s
        INNER JOIN players p
            ON p.id = s.player_id
        WHERE
            s.token_hash = $1
            AND s.expires_at > NOW()
        LIMIT 1;
        `,
        [tokenHash]
    );

    return result.rows[0] || null;
}

async function optionalAuth(req, res, next) {
    try {
        const player = await getAuthenticatedPlayer(req);

        req.auth = player
            ? {
                playerId: player.id,
                nickname: player.nickname,
                player
            }
            : null;

        next();
    } catch (error) {
        console.error('任意認証処理に失敗しました。', {
            name: error.name,
            code: error.code
        });

        next();
    }
}

async function requireAuth(req, res, next) {
    try {
        const player = await getAuthenticatedPlayer(req);

        if (!player) {
            clearSessionCookie(res);

            return res.status(401).json({
                message: 'ログインが必要です。'
            });
        }

        req.auth = {
            playerId: player.id,
            nickname: player.nickname,
            player
        };

        return next();
    } catch (error) {
        console.error('認証処理に失敗しました。', {
            name: error.name,
            code: error.code
        });

        return res.status(500).json({
            message: '認証処理中にエラーが発生しました。'
        });
    }
}

// ------------------------------
// APIの案内（ゲーム画面は public/index.html が / で配信される）
// ------------------------------
app.get('/api', (req, res) => {
    res.json({
        status: 'ok',
        message: 'Keshimasu API',
        endpoints: [
            'GET /api/health',
            'GET /api/puzzles/:mode',
            'GET /api/words/:mode',
            'GET /api/rankings/:type',
            'POST /api/player/register',
            'POST /api/player/login',
            'POST /api/player/logout',
            'GET /api/player/me',
            'POST /api/puzzles',
            'POST /api/score/update'
        ]
    });
});

// ------------------------------
// ヘルスチェック
// ------------------------------
app.get('/api/health', (req, res) => {
    res.json({
        status: 'ok',
        message: 'Keshimasu API is running.'
    });
});


app.use('/api', apiLimiter);
// ------------------------------
// ワード一覧取得
// GET /api/words/country
// GET /api/words/capital
// GET /api/words/pokemon
// ------------------------------
const WORD_LISTS = {
    country: COUNTRY_WORDS,
    capital: CAPITAL_WORDS,
    pokemon: POKEMON_WORDS
};

app.get('/api/words/:mode', (req, res) => {
    const { mode } = req.params;

    if (!Object.prototype.hasOwnProperty.call(WORD_LISTS, mode)) {
        return res.status(400).json({
            message: '無効なモードです。'
        });
    }

    // 辞書はデプロイしない限り変わらないので、ブラウザに1時間キャッシュさせる
    res.set('Cache-Control', 'public, max-age=3600');

    return res.json(WORD_LISTS[mode]);
});

// ------------------------------
// プレイヤー新規登録
// POST /api/player/register
// ----------
app.post(
    '/api/player/register',
    registerLimiter,
    async (req, res) => {
        const nickname = normalizeNickname(req.body.nickname);
        const passcode = req.body.passcode;

        const nicknameError = validateNickname(nickname);

        if (nicknameError) {
            return res.status(400).json({
                message: nicknameError
            });
        }

        const passcodeError = validatePasscode(passcode);

        if (passcodeError) {
            return res.status(400).json({
                message: passcodeError
            });
        }

        try {
            const existingResult = await db.query(
                `
                SELECT id
                FROM players
                WHERE LOWER(nickname) = LOWER($1)
                LIMIT 1;
                `,
                [nickname]
            );

            if (existingResult.rows.length > 0) {
                return res.status(409).json({
                    message:
                        'そのニックネームはすでに使用されています。'
                });
            }

            const passcodeHash = await hashPasscode(passcode);

            const insertResult = await db.query(
                `
                INSERT INTO players (
                    nickname,
                    passcode_hash,
                    country_clears,
                    capital_clears,
                    pokemon_clears,
                    cleared_country_ids,
                    cleared_capital_ids,
                    cleared_pokemon_ids
                )
                VALUES (
                    $1,
                    $2,
                    0,
                    0,
                    0,
                    '[]'::jsonb,
                    '[]'::jsonb,
                    '[]'::jsonb
                )
                RETURNING
                    id,
                    nickname,
                    country_clears,
                    capital_clears,
                    pokemon_clears,
                    cleared_country_ids,
                    cleared_capital_ids,
                    cleared_pokemon_ids;
                `,
                [nickname, passcodeHash]
            );

            const player = insertResult.rows[0];

            await createSession(player.id, res);

            return res.status(201).json({
                message: '新規登録しました。',
                player: toPublicPlayer(player)
            });
        } catch (error) {
            console.error('プレイヤー登録に失敗しました。', {
                name: error.name,
                code: error.code
            });

            if (error.code === '23505') {
                return res.status(409).json({
                    message:
                        'そのニックネームはすでに使用されています。'
                });
            }

            return res.status(500).json({
                message:
                    'プレイヤー登録中にエラーが発生しました。'
            });
        }
    }
);

// ------------------------------
// プレイヤーログイン
// POST /api/player/login
// ------------------------------

app.post(
    '/api/player/login',
    loginLimiter,
    async (req, res) => {
        const nickname = normalizeNickname(req.body.nickname);
        const passcode = req.body.passcode;

        if (!nickname || typeof passcode !== 'string') {
            return res.status(400).json({
                message:
                    'ニックネームとパスコードを入力してください。'
            });
        }

        try {
            const result = await db.query(
                `
                SELECT
                    id,
                    nickname,
                    passcode_hash,
                    country_clears,
                    capital_clears,
                    pokemon_clears,
                    cleared_country_ids,
                    cleared_capital_ids,
                    cleared_pokemon_ids
                FROM players
                WHERE LOWER(nickname) = LOWER($1)
                LIMIT 1;
                `,
                [nickname]
            );

            // ニックネームの存在有無を外部から判別しにくくする
            if (result.rows.length === 0) {
                // 存在するアカウントと同じ程度の処理時間にそろえる
                await consumeDummyComparison(passcode);

                return res.status(401).json({
                    message:
                        'ニックネームまたはパスコードが違います。'
                });
            }

            const player = result.rows[0];

            const isMatch = await comparePasscode(
                passcode,
                player.passcode_hash
            );

            if (!isMatch) {
                return res.status(401).json({
                    message:
                        'ニックネームまたはパスコードが違います。'
                });
            }

            await createSession(player.id, res);

            return res.status(200).json({
                message: 'ログインしました。',
                player: toPublicPlayer(player)
            });
        } catch (error) {
            console.error('ログイン処理に失敗しました。', {
                name: error.name,
                code: error.code
            });

            return res.status(500).json({
                message:
                    'ログイン処理中にエラーが発生しました。'
            });
        }
    }
);

app.post(
    '/api/player/logout',
    async (req, res) => {
        const token = req.cookies[SESSION_COOKIE_NAME];

        try {
            if (token && typeof token === 'string') {
                await db.query(
                    `
                    DELETE FROM player_sessions
                    WHERE token_hash = $1;
                    `,
                    [hashSessionToken(token)]
                );
            }

            clearSessionCookie(res);

            return res.status(200).json({
                message: 'ログアウトしました。'
            });
        } catch (error) {
            console.error('ログアウト処理に失敗しました。', {
                name: error.name,
                code: error.code
            });

            clearSessionCookie(res);

            return res.status(500).json({
                message: 'ログアウト処理中にエラーが発生しました。'
            });
        }
    }
);
// ------------------------------
// プレイヤー情報取得
// GET /api/player/me
// ------------------------------
app.get(
    '/api/player/me',
    requireAuth,
    async (req, res) => {
        return res.status(200).json({
            player: toPublicPlayer(req.auth.player)
        });
    }
);

// ------------------------------
// 問題一覧取得
// GET /api/puzzles/country
// GET /api/puzzles/capital
// GET /api/puzzles/pokemon
//
// clear_count を各問題に追加して返す
// ------------------------------
app.get(
    '/api/puzzles/:mode',
    optionalAuth,
    async (req, res) => {
        const { mode } = req.params;

    if (!isValidMode(mode)) {
        return res.status(400).json({
            message: '無効なモードです。'
        });
    }

    const clearedColumn = getClearedColumn(mode);

    try {
        const puzzles = await fetchPuzzleList(mode);

        const player = req.auth?.player || null;

const clearedIds = player
    ? player[clearedColumn] || []
    : [];

const playerIdentified = Boolean(player);

        return res.json({
            puzzles,
            cleared_ids: clearedIds,
            player_identified: playerIdentified
        });

    } catch (error) {
        console.error('問題一覧の取得に失敗しました。', {
    name: error.name,
    code: error.code
});

        return res.status(500).json({
            message: '問題一覧の取得に失敗しました。'
        });
    }
});

// ------------------------------
// 問題登録
// POST /api/puzzles
// country / capital / pokemon 対応
// ------------------------------
app.post(
    '/api/puzzles',
    requireAuth,
    createPuzzleLimiter,
    async (req, res) => {
        const { mode, boardData } = req.body;

        if (!isValidMode(mode)) {
            return res.status(400).json({
                message: '無効なモードです。'
            });
        }

        const normalizedBoardData =
            normalizeBoardData(boardData, mode);

        if (!normalizedBoardData) {
            return res.status(400).json({
                message:
                    '盤面は8行×5列で、1マス以上にカタカナ1文字か「F」を入力してください。（♂ ♀ Z 2 ・ はポケモンモードのみ使えます）'
            });
        }

        try {
            const duplicateResult = await db.query(
                `
                SELECT id
                FROM puzzles
                WHERE
                    mode = $1
                    AND data = $2::jsonb
                LIMIT 1;
                `,
                [
                    mode,
                    JSON.stringify(normalizedBoardData)
                ]
            );

            if (duplicateResult.rows.length > 0) {
                return res.status(409).json({
                    message: '同じ盤面の問題がすでに存在します。'
                });
            }

            const result = await db.query(
                `
                INSERT INTO puzzles (
                    mode,
                    data,
                    creator
                )
                VALUES ($1, $2::jsonb, $3)
                RETURNING
                    id,
                    mode,
                    data,
                    creator,
                    created_at;
                `,
                [
                    mode,
                    JSON.stringify(normalizedBoardData),
                    req.auth.nickname
                ]
            );

            invalidatePuzzleListCache(mode);

            return res.status(201).json({
                message: '問題を登録しました。',
                puzzle: result.rows[0]
            });
        } catch (error) {
            console.error('問題登録に失敗しました。', {
                name: error.name,
                code: error.code
            });

            return res.status(500).json({
                message: '問題の登録に失敗しました。'
            });
        }
    }
);

// ------------------------------
// スコア更新
// POST /api/score/update
// country / capital / pokemon 対応
// ------------------------------
app.post(
    '/api/score/update',
    requireAuth,
    scoreUpdateLimiter,
    async (req, res) => {
        const { mode, puzzleId } = req.body;

        const playerId = req.auth.playerId;

        if (!isValidMode(mode)) {
            return res.status(400).json({
                message: '無効なモードです。'
            });
        }

        const numericPuzzleId = Number(puzzleId);

        if (
            !Number.isSafeInteger(numericPuzzleId) ||
            numericPuzzleId <= 0
        ) {
            return res.status(400).json({
                message: 'puzzleIdが不正です。'
            });
        }

        const clearField = getClearField(mode);
        const idListField = getClearedColumn(mode);

        let client;

        try {
            client = await db.pool.connect();
            await client.query('BEGIN');

            const puzzleResult = await client.query(
                `
                SELECT id
                FROM puzzles
                WHERE id = $1 AND mode = $2
                LIMIT 1;
                `,
                [numericPuzzleId, mode]
            );

            if (puzzleResult.rows.length === 0) {
                await client.query('ROLLBACK');

                return res.status(404).json({
                    message:
                        '指定された問題が見つかりません。'
                });
            }

            const playerResult = await client.query(
                `
                SELECT
                    ${idListField},
                    ${clearField}
                FROM players
                WHERE id = $1
                FOR UPDATE;
                `,
                [playerId]
            );

            if (playerResult.rows.length === 0) {
                await client.query('ROLLBACK');

                clearSessionCookie(res);

                return res.status(401).json({
                    message:
                        'ログイン情報が無効です。再度ログインしてください。'
                });
            }

            const player = playerResult.rows[0];

            const clearedIds = (
                player[idListField] || []
            )
                .map(value => Number(value))
                .filter(value =>
                    Number.isSafeInteger(value)
                );

            if (clearedIds.includes(numericPuzzleId)) {
                await client.query('COMMIT');

                return res.status(200).json({
                    message:
                        'この問題はすでにクリア済みです。',
                    alreadyCleared: true,
                    newScore:
                        Number(player[clearField]) || 0
                });
            }

            clearedIds.push(numericPuzzleId);

            const updateResult = await client.query(
                `
                UPDATE players
                SET
                    ${idListField} = $2::jsonb,
                    ${clearField} =
                        jsonb_array_length($2::jsonb)
                WHERE id = $1
                RETURNING
                    ${clearField} AS "newScore";
                `,
                [
                    playerId,
                    JSON.stringify(clearedIds)
                ]
            );

            await client.query('COMMIT');

            // クリア者数が変わるので、問題一覧のキャッシュを破棄する
            invalidatePuzzleListCache(mode);

            return res.status(200).json({
                message:
                    'スコアとクリア済み問題を更新しました。',
                alreadyCleared: false,
                newScore:
                    Number(
                        updateResult.rows[0].newScore
                    ) || 0
            });
        } catch (error) {
            if (client) {
                try {
                    await client.query('ROLLBACK');
                } catch {
                    // ロールバック失敗時も機密情報を出力しない
                }
            }

            console.error('スコア更新に失敗しました。', {
                name: error.name,
                code: error.code
            });

            return res.status(500).json({
                message:
                    'スコア更新中にエラーが発生しました。'
            });
        } finally {
            if (client) {
                client.release();
            }
        }
    }
);
// ------------------------------
// ランキング取得
// GET /api/rankings/total
// GET /api/rankings/country
// GET /api/rankings/capital
// GET /api/rankings/pokemon
// ------------------------------
app.get('/api/rankings/:type', async (req, res) => {
    const { type } = req.params;

    if (!['total', 'country', 'capital', 'pokemon'].includes(type)) {
        return res.status(400).json({
            message: '無効なランキング種別です。'
        });
    }

    let scoreExpression;

    if (type === 'country') {
        scoreExpression = 'country_clears';
    } else if (type === 'capital') {
        scoreExpression = 'capital_clears';
    } else if (type === 'pokemon') {
        scoreExpression = 'pokemon_clears';
    } else {
        scoreExpression = '(country_clears + capital_clears + pokemon_clears)';
    }

    try {
        const result = await db.query(
            `
            SELECT
                ROW_NUMBER() OVER (
                    ORDER BY ${scoreExpression} DESC, created_at ASC
                ) AS rank,
                nickname,
                ${scoreExpression} AS score
            FROM players
            ORDER BY ${scoreExpression} DESC, created_at ASC
            LIMIT 100;
            `
        );

        return res.json(result.rows);

    } catch (error) {
        console.error('ランキング取得に失敗しました。', {
    name: error.name,
    code: error.code
});

// ------------------------------
// GET /api/rankings/:type/me
// ログイン中プレイヤーの順位（上位100位に入っていなくても取得できる）
// ------------------------------
function getRankingScoreExpression(type, alias) {
    const prefix = alias ? `${alias}.` : '';

    if (type === 'country') return `${prefix}country_clears`;
    if (type === 'capital') return `${prefix}capital_clears`;
    if (type === 'pokemon') return `${prefix}pokemon_clears`;

    return `(${prefix}country_clears + ${prefix}capital_clears + ${prefix}pokemon_clears)`;
}

app.get('/api/rankings/:type/me', requireAuth, async (req, res) => {
    const { type } = req.params;

    if (!['total', 'country', 'capital', 'pokemon'].includes(type)) {
        return res.status(400).json({
            message: '無効なランキング種別です。'
        });
    }

    // type は上で許可リストと照合済みのため、式をそのまま埋め込んでも安全
    const mine = getRankingScoreExpression(type, 'pl');
    const other = getRankingScoreExpression(type, 'p');

    try {
        // 一覧と同じ並び順（スコア降順、同点は登録が早い順）で順位を数える
        const result = await db.query(
            `
            SELECT
                (
                    SELECT COUNT(*)::integer
                    FROM players p
                    WHERE ${other} > ${mine}
                       OR (${other} = ${mine} AND p.created_at < pl.created_at)
                ) + 1 AS rank,
                ${mine} AS score,
                (SELECT COUNT(*)::integer FROM players) AS total
            FROM players pl
            WHERE pl.id = $1;
            `,
            [req.auth.playerId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                message: 'プレイヤーが見つかりません。'
            });
        }

        return res.json(result.rows[0]);
    } catch (error) {
        console.error('自分の順位の取得に失敗しました。', {
            name: error.name,
            code: error.code
        });

        return res.status(500).json({
            message: '順位の取得中にエラーが発生しました。'
        });
    }
});

        return res.status(500).json({
            message: 'ランキングの取得に失敗しました。'
        });
    }
});

// ------------------------------
// 404
// ------------------------------
app.use((req, res) => {
    res.status(404).json({
        message: 'Not Found'
    });
});

// ------------------------------
// 初期化と起動
// ------------------------------
(async () => {
    // テーブル作成・初期問題の投入は migrate.js（デプロイ時）で行う。
    // 移行できていない環境で一時的に使いたい場合のみ、
    // 環境変数 RUN_MIGRATIONS_ON_START=true で起動時にも実行できる。
    if (process.env.RUN_MIGRATIONS_ON_START === 'true') {
        await runMigrations();
    } else {
        await warnIfSchemaMissing();
    }

    // 期限切れセッションを削除（以降は1時間ごと）
    await deleteExpiredSessions();

    setInterval(
        deleteExpiredSessions,
        SESSION_CLEANUP_INTERVAL_MS
    ).unref();

    app.listen(PORT, () => {
        console.log(`Server is running on port ${PORT}`);
    });
})().catch(error => {
    console.error(
        'サーバーを起動できませんでした。',
        {
            name: error.name,
            code: error.code
        }
    );

    process.exit(1);
});