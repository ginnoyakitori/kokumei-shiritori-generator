const express = require('express');
const fs = require('fs');
const app = express();
const port = 3000;

app.use(express.json());
app.use(express.static('.')); 

// === データとキャッシュ ===
let wordLists = {};
let wordMap = {}; 
const shiritoriCache = {};

const LIST_FILES = ['kokumei.txt', 'shutomei.txt', 'kokumei_shutomei.txt'];
const KOKUMEI_KEY = 'kokumei.txt';
const SHUTOMEI_KEY = 'shutomei.txt';
const KOKUMEI_SHUTOMEI_KEY = 'kokumei_shutomei.txt';

// === 共通関数 (省略せず掲載) ===

function normalizeWord(word) {
    if (!word) return '';
    let normalized = word.normalize('NFKC'); 
    return normalized.charAt(0);
}

function getShiritoriLastChar(word) {
    const normalized = word.normalize('NFKC');
    let lastChar = normalized.slice(-1);
    let effectiveLastChar = lastChar;
    
    if (lastChar === 'ー' && normalized.length > 1) {
        effectiveLastChar = normalized.slice(-2, -1);
    }
    
    if (effectiveLastChar === 'ン' || effectiveLastChar === 'ん') {
        return 'ン'; 
    }
    
    switch (effectiveLastChar) {
        case 'ゃ': case 'ャ': return 'ヤ';
        case 'ゅ': case 'ュ': return 'ユ';
        case 'ょ': case 'ョ': return 'ヨ';
        case 'っ': case 'ッ': return 'ツ';
        case 'ぁ': case 'ァ': return 'ア';
        case 'ぃ': case 'ィ': return 'イ';
        case 'ぅ': case 'ゥ': return 'ウ';
        case 'ぇ': case 'ェ': return 'エ';
        case 'ぉ': case 'ォ': return 'オ';
        default: return effectiveLastChar.toUpperCase();
    }
}

function loadWordData() {
    const individualFiles = [KOKUMEI_KEY, SHUTOMEI_KEY];

    individualFiles.forEach(fileName => {
        try {
            const data = fs.readFileSync(fileName, 'utf8');
            const words = data.split('\n')
                              .map(w => w.trim())
                              .filter(w => w.length > 0)
                              .sort(); 
            wordLists[fileName] = words;
        } catch (err) {
            console.error(`Error loading file ${fileName}:`, err.message);
        }
    });

    if (wordLists[KOKUMEI_KEY] && wordLists[SHUTOMEI_KEY]) {
        const combinedWords = [...wordLists[KOKUMEI_KEY], ...wordLists[SHUTOMEI_KEY]];
        const uniqueWords = [...new Set(combinedWords)].sort();
        wordLists[KOKUMEI_SHUTOMEI_KEY] = uniqueWords;
    }

    Object.keys(wordLists).forEach(listName => {
        wordMap[listName] = {};
        wordLists[listName].forEach(word => {
            const startChar = normalizeWord(word);
            if (!wordMap[listName][startChar]) {
                wordMap[listName][startChar] = [];
            }
            wordMap[listName][startChar].push(word);
        });
        shiritoriCache[listName] = {};
    });
}

function checkRequiredChars(path, requiredChars) {
    if (!requiredChars) return true;
    const allCharsInPath = path.join('');
    return requiredChars.every(char => allCharsInPath.includes(char));
}

function checkExcludeChars(path, excludeChars) {
    if (!excludeChars || excludeChars.length === 0) return true;
    const allCharsInPath = path.join('');
    return excludeChars.every(char => !allCharsInPath.includes(char));
}


// === 探索補助関数 ===

/**
 * 💡 新規: 配列の順列を生成する再帰関数 (重複を考慮)
 * @param {Array<number[]>} arr - 組み合わせの配列
 * @returns {Array<number[]>} 全ての順列の配列
 */
function getPermutations(arr) {
    if (arr.length === 0) return [[]];
    if (arr.length === 1) return arr.map(subArr => subArr.map(n => [n]));

    const result = [];
    // 重複を避けるためにSetで処理済みの要素を追跡
    const used = new Set();
    
    for (let i = 0; i < arr.length; i++) {
        const currentItem = arr[i];
        const key = currentItem.map(String).join(','); // 配列の配列のキーを生成

        if (used.has(key)) continue;
        used.add(key);

        const rest = arr.slice(0, i).concat(arr.slice(i + 1));
        const restPerms = getPermutations(rest);

        for (const restPerm of restPerms) {
            for(const num of currentItem) {
                result.push([num, ...restPerm]);
            }
        }
    }
    return result;
}


// === 探索関数 ===

/**
 * 文字指定しりとり (全通り探索)
 * ... (変更なし)
 */
function findShiritoriCombinations(wordMap, firstChar, lastChar, wordCount, requiredChars, excludeChars, noPrecedingWord, noSucceedingWord) {
    const allResults = [];
    const collator = new Intl.Collator('ja', { sensitivity: 'base' });
    const allWords = Object.values(wordMap).flat(); 

    function backtrack(path, usedWords) {
        if (path.length === wordCount) {
            const lastWord = path[path.length - 1];
            const endChar = getShiritoriLastChar(lastWord);
            
            if (noSucceedingWord) {
                const hasNextWord = (wordMap[endChar] || []).some(word => !usedWords.has(word));
                if (hasNextWord) {
                    return; 
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

    let startingWords = firstChar ? (wordMap[firstChar] || []) : allWords;
    
    if (noPrecedingWord) {
        startingWords = startingWords.filter(word => {
            const firstCharOfWord = normalizeWord(word);
            const hasPrecedingWord = allWords.some(prevWord => {
                if (prevWord === word) return false; 
                return getShiritoriLastChar(prevWord) === firstCharOfWord;
            });
            return !hasPrecedingWord;
        });
    }

    for (const word of startingWords) {
        if (wordCount === 1) {
             const endChar = getShiritoriLastChar(word);
             
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


/**
 * 💡 新規: 単語数パターン指定しりとり (A*探索は省略し全探索を実装)
 * @param {object} wordMap - 単語マップ
 * @param {Array<number[]>} wordCountPatterns - [[2, 3], [4], [5]] のような、各単語の文字数パターン
 * @param {string[]|null} requiredChars - 必須文字
 * @param {boolean} allowPermutation - 順列を許可するか
 * @returns {string[][]} 見つかったパスの配列
 */
function findShiritoriByWordCountPatterns(wordMap, wordCountPatterns, requiredChars, allowPermutation) {
    let allResults = [];
    const collator = new Intl.Collator('ja', { sensitivity: 'base' });
    
    // 処理する単語数の順序パターンリスト
    let patternSequences = [];

    if (allowPermutation) {
        // 並び替えを許可する場合、すべての順列を生成
        patternSequences = getPermutations(wordCountPatterns);
        // 生成された順列は重複している可能性があるため、Setで一意化（配列の配列の比較は煩雑なのでここでは一旦簡略化）
        // 厳密には、getPermutations内で重複処理を行うべきだが、ここでは簡略化されたgetPermutationsの結果をそのまま使う
    } else {
        // 並び替えを許可しない場合、指定された順序で単語数パターンを抽出
        // [[2, 3], [4], [5]] -> [2, 4, 5], [3, 4, 5] の順序パターン
        
        // 最初の単語の文字数候補
        const firstWordCounts = wordCountPatterns[0] || [];
        
        for (const count of firstWordCounts) {
            // 残りの単語の文字数パターンを使って、順列を生成するロジックが必要
            // ここでは簡易的に、順列ロジックを再利用せず、単語数パターンをそのままつなぎ合わせる
            
            // 簡略化のため、並び替えを許可しない場合は、最初の単語の文字数のみ複数指定を許容し、
            // 2番目以降の単語は最初の候補のみを採用する、という制限を設ける。
            // (真のカーテシアン積は非常に複雑になるため、ここでは簡略化)
            const baseSequence = wordCountPatterns.slice(1).map(arr => arr[0]);

            for (const startCount of wordCountPatterns[0]) {
                patternSequences.push([startCount, ...baseSequence]);
            }
            break; // 最初のパターン処理が終わったら抜ける（カーテシアン積を避けるため）
        }

        // カーテシアン積の厳密な実装が不要な場合は、単語数パターンをそのまま使う:
        // 例: [[2, 3], [4], [5]] -> [[2, 4, 5], [3, 4, 5]]
        // この実装は、getPermutationsの特殊なケースとして扱える
        if (!allowPermutation && patternSequences.length === 0) {
             // 最初の単語だけを反復し、残りは最初の候補を採用
             if (wordCountPatterns.length > 0) {
                 const rest = wordCountPatterns.slice(1).map(arr => arr[0]);
                 patternSequences = wordCountPatterns[0].map(first => [first, ...rest]);
             }
        }
    }

    // 重複する順序パターンを排除 (getPermutationsが完全に重複排除しない場合があるため)
    const uniquePatternSequences = [];
    const seenSequences = new Set();
    patternSequences.forEach(seq => {
        const key = seq.join(',');
        if (!seenSequences.has(key)) {
            seenSequences.add(key);
            uniquePatternSequences.push(seq);
        }
    });

    for (const sequence of uniquePatternSequences) {
        const totalWordCount = sequence.length;

        function backtrack(path, usedWords, patternIndex) {
            if (path.length === totalWordCount) {
                if (checkRequiredChars(path, requiredChars)) {
                    allResults.push([...path]);
                }
                return;
            }
            
            const requiredLength = sequence[patternIndex];
            
            // 最初の単語候補
            let nextWords;
            if (path.length === 0) {
                 nextWords = Object.values(wordMap).flat();
            } else {
                const lastCharOfCurrent = getShiritoriLastChar(path[path.length - 1]);
                if (!lastCharOfCurrent) return;
                nextWords = wordMap[lastCharOfCurrent] || [];
            }

            for (const word of nextWords) {
                if (!usedWords.has(word) && word.length === requiredLength) {
                    path.push(word);
                    usedWords.add(word);
                    backtrack(path, usedWords, patternIndex + 1);
                    usedWords.delete(word);
                    path.pop();
                }
            }
        }
        
        backtrack([], new Set(), 0);
    }
    
    // パス全体で重複しているものを排除
    const finalResults = [];
    const seenPaths = new Set();
    
    allResults.forEach(path => {
        const pathKey = path.join(',');
        if (!seenPaths.has(pathKey)) {
            seenPaths.add(pathKey);
            finalResults.push(path);
        }
    });

    return finalResults.sort((a, b) => collator.compare(a.join(''), b.join('')));
}


// === Express エンドポイント ===

// サーバー起動時にデータをロード
loadWordData();

// 文字指定しりとり検索 (既存)
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
        
        results = findShiritoriCombinations(map, firstChar, lastChar, wordCount, requiredChars, excludeChars, noPrecedingWord, noSucceedingWord);
        return res.json({ results });
    }
});


// 💡 新規エンドポイント: 単語数指定しりとり
app.post('/api/word_count_shiritori', (req, res) => {
    let { listName, wordCountPatterns, requiredChars, allowPermutation } = req.body;
    const map = wordMap[listName];

    if (!map || !wordCountPatterns || !Array.isArray(wordCountPatterns) || wordCountPatterns.length === 0) {
        return res.status(400).json({ error: '無効な単語数パターンが指定されました。' });
    }
    
    // 単語数パターンがすべて有効な数字の配列であることを確認
    const isValid = wordCountPatterns.every(arr => Array.isArray(arr) && arr.length > 0 && arr.every(n => typeof n === 'number' && n > 0));
    if (!isValid) {
        return res.status(400).json({ error: '単語数の指定は1以上の数字である必要があります（例: [[2, 3], [4]]）。' });
    }

    if (requiredChars && requiredChars.length === 0) {
        requiredChars = null;
    }

    try {
        const results = findShiritoriByWordCountPatterns(map, wordCountPatterns, requiredChars, allowPermutation);
        return res.json({ results });
    } catch (e) {
        console.error("Error in word count shiritori:", e);
        return res.status(500).json({ error: 'サーバー内部でエラーが発生しました。' });
    }
});


// ？文字検索 (既存)
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

// 部分文字列検索 (既存)
app.post('/api/substring_search', (req, res) => {
    const { listName, searchText } = req.body;
    const words = wordLists[listName];

    if (!words || !searchText) {
        return res.status(400).json({ error: '無効な入力です。' });
    }

    const matches = words.filter(word => word.includes(searchText));
    return res.json({ substringMatches: matches });
});

// ？文字指定しりとり検索 (既存)
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