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
    // ひらがな・カタカナを統一し、濁点・半濁点を考慮しない比較のためのノーマライズ（ここでは簡略化）
    let normalized = word.normalize('NFKC'); 
    return normalized.charAt(0);
}

/**
 * 💡 修正: しりとりで使う「カナ」の最後の文字を取得。
 * 長音符('-')と小さい文字(ゃゅょっ)のルールを適用します。
 * * 💡 「ン」で終わる単語は「ン」を返します（接続可能）。
 * * @param {string} word
 * @returns {string|null} 最後のカナ（接続可能な場合）、または null（接続不可な場合、ここでは発生しない想定）
 */
function getShiritoriLastChar(word) {
    const normalized = word.normalize('NFKC');
    let lastChar = normalized.slice(-1);
    let effectiveLastChar = lastChar;
    
    // 1. 長音符「ー」の処理
    if (lastChar === 'ー' && normalized.length > 1) {
        effectiveLastChar = normalized.slice(-2, -1);
    }
    
    // 2. 💡 「ン」の処理: 「ン」で終わる場合は「ン」を返す
    if (effectiveLastChar === 'ン' || effectiveLastChar === 'ん') {
        return 'ン'; 
    }
    
    // 3. 小さい文字の処理 (ゃゅょっ -> ゃゅょっ)
    switch (effectiveLastChar) {
        case 'ゃ':
        case 'ャ':
            return 'ヤ';
        case 'ゅ':
        case 'ュ':
            return 'ユ';
        case 'ょ':
        case 'ョ':
            return 'ヨ';
        case 'っ':
        case 'ッ':
            // 促音は「ツ」に変換
            return 'ツ';
        case 'ぁ':
        case 'ァ':
            return 'ア';
        case 'ぃ':
        case 'ィ':
            return 'イ';
        case 'ぅ':
        case 'ゥ':
            return 'ウ';
        case 'ぇ':
        case 'ェ':
            return 'エ';
        case 'ぉ':
        case 'ォ':
            return 'オ';
        default:
            // 最後の文字をカタカナ大文字で返す（例: ラ, マ, ベ）
            return effectiveLastChar.toUpperCase();
    }
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
                              .sort(); 
            
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
 * パスに含まれてはいけない文字が含まれていないかチェック
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
 */
function findShiritoriCombinations(wordMap, firstChar, lastChar, wordCount, requiredChars, excludeChars, noPrecedingWord, noSucceedingWord) {
    const allResults = [];
    const collator = new Intl.Collator('ja', { sensitivity: 'base' });
    const allWords = Object.values(wordMap).flat(); 

    function backtrack(path, usedWords) {
        if (path.length === wordCount) {
            const lastWord = path[path.length - 1];
            const endChar = getShiritoriLastChar(lastWord);
            
            // 最後の単語の後に続かない条件をチェック
            if (noSucceedingWord) {
                const hasNextWord = (wordMap[endChar] || []).some(word => !usedWords.has(word));
                if (hasNextWord) {
                    return; // 最後に続く単語があるためNG
                }
            }

            if ((lastChar === null || endChar === lastChar) && 
                checkRequiredChars(path, requiredChars) && 
                checkExcludeChars(path, excludeChars)) {
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

    // 最初の単語の候補を絞り込む
    let startingWords = firstChar ? (wordMap[firstChar] || []) : allWords;
    
    // 最初の単語の前に続かない条件をチェック
    if (noPrecedingWord) {
        startingWords = startingWords.filter(word => {
            const firstCharOfWord = normalizeWord(word);
            
            // この単語で終わる単語が存在しないか確認
            const hasPrecedingWord = allWords.some(prevWord => {
                if (prevWord === word) return false; 
                return getShiritoriLastChar(prevWord) === firstCharOfWord;
            });
            return !hasPrecedingWord;
        });
    }

    for (const word of startingWords) {
        // wordCountが1の場合は、単語自体が条件を満たすかチェック
        if (wordCount === 1) {
             const endChar = getShiritoriLastChar(word);
             
             // 接続制約をチェック
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
                 checkExcludeChars([word], excludeChars)) { 
                 allResults.push([word]);
             }
             continue;
        }
        
        backtrack([word], new Set([word]));
    }

    return allResults.sort((a, b) => collator.compare(a.join(''), b.join('')));
}


// ワイルドカード（？）を正規表現に変換するヘルパー関数
function patternToRegex(pattern) {
    // 〇は.に変換、その他の正規表現記号をエスケープ
    let regexString = pattern.replace(/[.*+^${}()|[\]\\]/g, '\\$&'); // 正規表現文字をエスケープ
    regexString = regexString.replace(/？/g, '.'); // ワイルドカード '？' を '.' に変換
    return new RegExp('^' + regexString + '$');
}

/**
 * ？文字指定しりとり
 */
function findWildcardShiritoriCombinations(wordMap, firstWordPattern, lastWordPattern, wordCount, requiredChars) {
    const allResults = [];
    const collator = new Intl.Collator('ja', { sensitivity: 'base' });
    
    // 正規表現に変換
    const firstRegex = patternToRegex(firstWordPattern); 

    let lastRegex = null;
    if (lastWordPattern && lastWordPattern.trim() !== '') {
        lastRegex = patternToRegex(lastWordPattern);
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
    
    // 必須文字と除外文字の処理
    if (requiredChars && requiredChars.length === 0) {
        requiredChars = null;
    }
    if (excludeChars && excludeChars.trim() !== '') {
        excludeChars = excludeChars.split('');
    } else {
        excludeChars = null;
    }

    let results = [];
    
    if (outputType === 'firstCharCount' || outputType === 'lastCharCount') {
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

    const regex = patternToRegex(searchText);
    
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

    const results = findWildcardShiritoriCombinations(map, firstWordPattern, lastWordPattern, wordCount, requiredChars);
    
    return res.json({ results });
});


// サーバー起動
app.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}`);
});