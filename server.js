const express = require('express');
const fs = require('fs');
const app = express();
const port = 3000;

app.use(express.json());
app.use(express.static('.')); // index.htmlやscript.jsなどの静的ファイルをホスト

// === データとキャッシュ ===
let wordLists = {};
let wordMap = {}; // {リスト名: {開始文字: [単語, ...]}}
const shiritoriCache = {};

const LIST_FILES = ['kokumei.txt', 'shutomei.txt', 'kokumei_shutomei.txt'];

// === データ読み込みと前処理関数 ===

/**
 * 日本語の単語をノーマライズし、しりとりで使う「カナ」を取得
 * 例: "ベネズエラ" -> "ベ", "日本" -> "ニ"
 * @param {string} word
 * @returns {string} ノーマライズされた最初のカナ
 */
function normalizeWord(word) {
    if (!word) return '';
    // 大文字/小文字を統一、濁点/半濁点を除去する処理を想定
    // 実際の日本語処理ではより複雑なライブラリが必要ですが、ここでは簡略化
    let normalized = word.normalize('NFKC'); 
    return normalized.charAt(0);
}

/**
 * しりとりで使う「カナ」の最後の文字を取得
 * 例: "ベネズエラ" -> "ラ", "日本" -> "ン" (※「ん」で終わる単語はしりとりNGと仮定)
 * @param {string} word
 * @returns {string} 最後のカナ
 */
function getShiritoriLastChar(word) {
    const normalized = word.normalize('NFKC');
    let lastChar = normalized.slice(-1);
    
    // 慣例的な「ん」のチェック。ここでは「ん」で終わる単語は接続不可と仮定
    if (lastChar === 'ン' || lastChar === 'ん') {
        return null; 
    }
    // 拗音（ャュョ）や促音（ッ）の前の文字を返すなどの複雑なルールはここでは省略し、最後の文字を返す
    return lastChar.charAt(0);
}

/**
 * ファイルから単語リストを読み込み、マップを構築
 */
function loadWordData() {
    LIST_FILES.forEach(fileName => {
        try {
            const data = fs.readFileSync(fileName, 'utf8');
            const words = data.split('\n')
                              .map(w => w.trim())
                              .filter(w => w.length > 0)
                              .sort(); // 結果をソートして表示するためにリストも保持
            
            wordLists[fileName] = words;
            wordMap[fileName] = {};

            words.forEach(word => {
                const startChar = normalizeWord(word);
                if (!wordMap[fileName][startChar]) {
                    wordMap[fileName][startChar] = [];
                }
                wordMap[fileName][startChar].push(word);
            });
            shiritoriCache[fileName] = {};
            console.log(`Loaded ${words.length} words from ${fileName}.`);
        } catch (err) {
            console.error(`Error loading file ${fileName}:`, err.message);
        }
    });
}

// === 制約チェック関数 ===

/**
 * パスに必須文字がすべて含まれているかチェック
 * @param {string[]} path - 現在のしりとりパス
 * @param {string[]} requiredChars - 必須文字の配列
 * @returns {boolean} 含まれている場合 true
 */
function checkRequiredChars(path, requiredChars) {
    if (!requiredChars) return true;
    const allCharsInPath = path.join('');
    return requiredChars.every(char => allCharsInPath.includes(char));
}

/**
 * 💡 新規追加: パスに含まれてはいけない文字が含まれていないかチェック
 * @param {string[]} path - 現在のしりとりパス
 * @param {string[]} excludeChars - 含めてはいけない文字の配列
 * @returns {boolean} 含まれていない場合 true
 */
function checkExcludeChars(path, excludeChars) {
    if (!excludeChars || excludeChars.length === 0) return true;
    const allCharsInPath = path.join('');
    return excludeChars.every(char => !allCharsInPath.includes(char));
}


// === 探索関数 ===

/**
 * 文字指定しりとり (全通り探索)
 * @param {object} wordMap - 単語マップ
 * @param {string|null} firstChar - 最初の文字
 * @param {string|null} lastChar - 最後の文字
 * @param {number} wordCount - 単語数
 * @param {string[]|null} requiredChars - 必須文字
 * @param {string[]|null} excludeChars - 💡 新規追加: 除外文字
 * @param {boolean} noPrecedingWord - 💡 新規追加: 最初の単語の前に続かない
 * @param {boolean} noSucceedingWord - 💡 新規追加: 最後の単語の後に続かない
 * @returns {string[][]} 見つかったパスの配列
 */
function findShiritoriCombinations(wordMap, firstChar, lastChar, wordCount, requiredChars, excludeChars, noPrecedingWord, noSucceedingWord) {
    const allResults = [];
    const collator = new Intl.Collator('ja', { sensitivity: 'base' });
    const allWords = Object.values(wordMap).flat(); // すべての単語の配列

    function backtrack(path, usedWords) {
        if (path.length === wordCount) {
            const lastWord = path[path.length - 1];
            const endChar = getShiritoriLastChar(lastWord);
            
            // 💡 最後の単語の後に続かない条件をチェック
            if (noSucceedingWord) {
                const hasNextWord = (wordMap[endChar] || []).some(word => !usedWords.has(word));
                if (hasNextWord) {
                    return; // 最後に続く単語があるためNG
                }
            }

            if ((lastChar === null || endChar === lastChar) && 
                checkRequiredChars(path, requiredChars) && 
                checkExcludeChars(path, excludeChars)) { // 💡 除外文字チェック
                allResults.push([...path]);
            }
            return;
        }
        
        const lastCharOfCurrent = getShiritoriLastChar(path[path.length - 1]);
        if (!lastCharOfCurrent) return; // 「ん」で終わるなど、接続不可の場合は終了
        
        const nextWords = wordMap[lastCharOfCurrent] || [];

        for (const word of nextWords) {
            if (!usedWords.has(word)) {
                path.push(word);
                usedWords.add(word);
                backtrack(path, usedWords);
                usedWords.delete(word);
                path.pop();
            }
        }
    }

    // 最初の単語の候補を絞り込む
    let startingWords = firstChar ? (wordMap[firstChar] || []) : allWords;
    
    // 💡 最初の単語の前に続かない条件をチェック
    if (noPrecedingWord) {
        startingWords = startingWords.filter(word => {
            const firstCharOfWord = normalizeWord(word);
            
            // この単語で終わる（つまりこの単語の最初の文字を最後の文字とする）単語が存在しないか確認
            const hasPrecedingWord = allWords.some(prevWord => {
                if (prevWord === word) return false; // 自分自身を除く
                return getShiritoriLastChar(prevWord) === firstCharOfWord;
            });
            return !hasPrecedingWord;
        });
    }

    for (const word of startingWords) {
        // wordCountが1の場合は、単語自体が条件を満たすかチェック
        if (wordCount === 1) {
             const endChar = getShiritoriLastChar(word);
             
             // 💡 接続制約をチェック
             let isNoSucceeding = true;
             if (noSucceedingWord) {
                isNoSucceeding = !(wordMap[endChar] || []).some(nextWord => nextWord !== word);
             }
             
             let isNoPreceding = true;
             if (noPrecedingWord) {
                const firstCharOfWord = normalizeWord(word);
                isNoPreceding = !allWords.some(prevWord => {
                    if (prevWord === word) return false;
                    return getShiritoriLastChar(prevWord) === firstCharOfWord;
                });
             }

             if (isNoPreceding && isNoSucceeding && (lastChar === null || endChar === lastChar) && 
                 checkRequiredChars([word], requiredChars) && 
                 checkExcludeChars([word], excludeChars)) { // 💡 除外文字チェック
                 allResults.push([word]);
             }
             continue;
        }
        
        backtrack([word], new Set([word]));
    }

    return allResults.sort((a, b) => collator.compare(a.join(''), b.join('')));
}


// 💡 ワイルドカード（？）を正規表現に変換するヘルパー関数
function patternToRegex(pattern) {
    // 〇は.に変換、その他の正規表現記号をエスケープ
    let regexString = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // 正規表現文字をエスケープ
    regexString = regexString.replace(/？/g, '.'); // 💡 ワイルドカード '？' を '.' に変換
    return new RegExp('^' + regexString + '$');
}

/**
 * ？文字指定しりとり (A*アルゴリズムなどでの最短パス探索はここでは省略し、全探索の機能のみを簡略化して実装)
 * @param {object} wordMap - 単語マップ
 * @param {string} firstWordPattern - 最初の単語のパターン
 * @param {string} lastWordPattern - 最後の単語のパターン
 * @param {number} wordCount - 単語数
 * @param {string[]|null} requiredChars - 必須文字
 * @returns {string[][]} 見つかったパスの配列
 */
function findWildcardShiritoriCombinations(wordMap, firstWordPattern, lastWordPattern, wordCount, requiredChars) {
    const allResults = [];
    const collator = new Intl.Collator('ja', { sensitivity: 'base' });
    
    // 💡 ワイルドカード '？' を '〇' で受け取っていると仮定し、正規表現に変換
    const firstRegex = patternToRegex(firstWordPattern.replace(/〇/g, '？')); // APIの都合上、？を〇で受け取り、ここで？に戻して正規表現変換

    let lastRegex = null;
    if (lastWordPattern && lastWordPattern.trim() !== '') {
        lastRegex = patternToRegex(lastWordPattern.replace(/〇/g, '？'));
    }
    
    // 最初に全単語リストを作成
    const allWords = Object.values(wordMap).flat();

    // 最初の単語候補を絞り込み
    const startingWords = allWords.filter(word => firstRegex.test(word));

    function backtrack(path, usedWords) {
        if (path.length === wordCount) {
            const lastWord = path[path.length - 1];
            
            // 最後の単語のパターンチェック
            if ((!lastRegex || lastRegex.test(lastWord)) && 
                checkRequiredChars(path, requiredChars)) {
                allResults.push([...path]);
            }
            return;
        }
        
        const lastCharOfCurrent = getShiritoriLastChar(path[path.length - 1]);
        if (!lastCharOfCurrent) return;
        
        const nextWords = wordMap[lastCharOfCurrent] || [];

        for (const word of nextWords) {
            if (!usedWords.has(word)) {
                path.push(word);
                usedWords.add(word);
                backtrack(path, usedWords);
                usedWords.delete(word);
                path.pop();
            }
        }
    }

    for (const word of startingWords) {
        if (wordCount === 1) {
            if ((!lastRegex || lastRegex.test(word)) && checkRequiredChars([word], requiredChars)) {
                allResults.push([word]);
            }
            continue;
        }
        backtrack([word], new Set([word]));
    }

    return allResults.sort((a, b) => collator.compare(a.join(''), b.join('')));
}


// === Express エンドポイント ===

// サーバー起動時にデータをロード
loadWordData();

// 文字指定しりとり検索
app.post('/api/shiritori', (req, res) => {
    let { listName, firstChar, lastChar, wordCount, requiredChars, excludeChars, noPrecedingWord, noSucceedingWord, outputType } = req.body;
    const words = wordLists[listName];
    const map = wordMap[listName];

    if (!map || !words) {
        return res.status(400).json({ error: '無効な単語リストです。' });
    }

    if (typeof wordCount === 'string' && wordCount !== 'shortest' && !Array.isArray(wordCount)) {
        wordCount = parseInt(wordCount, 10);
    }
    if (typeof wordCount === 'number' && (isNaN(wordCount) || wordCount < 1)) {
         return res.status(400).json({ error: '単語数は1以上の数字である必要があります。' });
    }
    
    // 💡 必須文字と除外文字の処理
    if (requiredChars && requiredChars.length === 0) {
        requiredChars = null;
    }
    if (excludeChars && excludeChars.trim() !== '') {
        excludeChars = excludeChars.split('');
    } else {
        excludeChars = null;
    }

    let results = [];
    
    // 出力形式が件数カウントの場合は、専用の関数を使う（ここでは省略し、パス探索後に集計するロジックに置き換えます）
    if (outputType === 'firstCharCount' || outputType === 'lastCharCount') {
        // パス探索は必須
        if (wordCount === 'shortest' || Array.isArray(wordCount)) {
            return res.status(400).json({ error: '件数カウントは最短または単語数指定モードでは現在サポートされていません。' });
        }
        
        results = findShiritoriCombinations(map, firstChar, lastChar, wordCount, requiredChars, excludeChars, noPrecedingWord, noSucceedingWord);
        
        const counts = {};
        results.forEach(path => {
            const char = outputType === 'firstCharCount' 
                       ? normalizeWord(path[0]) 
                       : getShiritoriLastChar(path[path.length - 1]);
            
            if (char) {
                counts[char] = (counts[char] || 0) + 1;
            }
        });
        
        if (outputType === 'firstCharCount') {
            return res.json({ firstCharCounts: counts });
        } else {
            return res.json({ lastCharCounts: counts });
        }
        
    } else { // outputType === 'path'
        // 最短パス探索はここでは省略し、wordCountが'shortest'または配列の場合はエラーを返す
        if (wordCount === 'shortest' || Array.isArray(wordCount)) {
             return res.status(400).json({ error: '最短パスまたは単語数指定の検索は現在実装されていません。' });
        }
        
        // 全通り探索
        results = findShiritoriCombinations(map, firstChar, lastChar, wordCount, requiredChars, excludeChars, noPrecedingWord, noSucceedingWord);
        return res.json({ results });
    }
});


// ？文字検索
app.post('/api/wildcard_search', (req, res) => {
    const { listName, searchText } = req.body;
    const words = wordLists[listName];

    if (!words || !searchText) {
        return res.status(400).json({ error: '無効な入力です。' });
    }

    // 💡 以前「〇」に変換していたワイルドカードを「？」に戻して、正規表現に変換
    const regex = patternToRegex(searchText.replace(/〇/g, '？'));
    
    const matches = words.filter(word => regex.test(word));
    return res.json({ wildcardMatches: matches });
});

// 部分文字列検索
app.post('/api/substring_search', (req, res) => {
    const { listName, searchText } = req.body;
    const words = wordLists[listName];

    if (!words || !searchText) {
        return res.status(400).json({ error: '無効な入力です。' });
    }

    const matches = words.filter(word => word.includes(searchText));
    return res.json({ substringMatches: matches });
});

// ？文字指定しりとり検索
app.post('/api/wildcard_shiritori', (req, res) => {
    let { listName, firstWordPattern, lastWordPattern, wordCount, requiredChars } = req.body;
    const map = wordMap[listName];

    if (!map || !firstWordPattern || isNaN(wordCount) || wordCount < 1) {
        return res.status(400).json({ error: '無効な入力です。' });
    }
    
    if (requiredChars && requiredChars.length === 0) {
        requiredChars = null;
    }

    // 💡 以前「〇」に変換していたワイルドカードを「？」に戻して、パターン処理に渡す
    const results = findWildcardShiritoriCombinations(map, firstWordPattern, lastWordPattern, wordCount, requiredChars);
    
    return res.json({ results });
});


// サーバー起動
app.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}`);
});