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

// === 共通関数 ===

function normalizeWord(word) {
    if (!word) return '';
    let normalized = word.normalize('NFKC'); 
    return normalized.charAt(0);
}

function getShiritoriLastChar(word) {
    const normalized = word.normalize('NFKC');
    let lastChar = normalized.slice(-1);
    let effectiveLastChar = lastChar;
    
    // 長音符処理
    if (lastChar === 'ー' && normalized.length > 1) {
        effectiveLastChar = normalized.slice(-2, -1);
    }
    
    // 撥音「ン」の処理
    if (effectiveLastChar === 'ン' || effectiveLastChar === 'ん') {
        return 'ン'; 
    }
    
    // 拗音・促音の親文字化
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
            // ファイルが存在しない場合は警告のみ
            console.warn(`Warning: Could not load file ${fileName}. Please ensure it exists.`);
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

/**
 * 💡 必須文字のチェックを部分文字列の出現回数ベースで実行
 */
function checkRequiredChars(path, requiredChars, requiredCharMode) {
    if (!requiredChars || requiredChars.length === 0) return true;
    
    const allWordsInPath = path.join(''); 
    
    const requiredCounts = requiredChars.reduce((acc, char) => {
        acc[char] = (acc[char] || 0) + 1;
        return acc;
    }, {});
    
    for (const requiredStr in requiredCounts) {
        const requiredCount = requiredCounts[requiredStr];
        
        let actualCount = 0;
        let startIndex = -1;
        while ((startIndex = allWordsInPath.indexOf(requiredStr, startIndex + 1)) !== -1) {
            actualCount++;
        }
        
        if (requiredCharMode === 'exactly') {
            if (actualCount !== requiredCount) {
                return false;
            }
        } else { // 'atLeast' (デフォルト)
            if (actualCount < requiredCount) {
                return false;
            }
        }
    }
    
    return true;
}


function checkExcludeChars(path, excludeChars) {
    if (!excludeChars || excludeChars.length === 0) return true;
    const allWordsInPath = path.join(''); 
    return excludeChars.every(char => !allWordsInPath.includes(char));
}


// === 探索補助関数 (中略) ===

function getPermutations(arr) {
    if (arr.length === 0) return [[]];
    if (arr.length === 1) return arr[0].map(n => [n]);

    const result = [];
    
    for (let i = 0; i < arr.length; i++) {
        const currentItem = arr[i];
        
        const rest = arr.slice(0, i).concat(arr.slice(i + 1));
        const restPerms = getPermutations(rest);

        for (const restPerm of restPerms) {
            for(const num of currentItem) {
                result.push([num, ...restPerm]);
            }
        }
    }
    
    const uniquePerms = [];
    const seen = new Set();
    result.forEach(perm => {
        const key = perm.join(',');
        if (!seen.has(key)) {
            seen.add(key);
            uniquePerms.push(perm);
        }
    });
    
    return uniquePerms;
}

function generateCartesianProduct(arr) {
    return arr.reduce((a, b) => {
        return a.map(x => {
            return b.map(y => x.concat(y));
        }).reduce((c, d) => c.concat(d), []);
    }, [[]]).filter(arr => arr.length > 0);
}


// === 探索関数 ===

/**
 * 💡 最短単語数で到達するすべてのパスを探索 (BFS) - 最終安定化修正
 */
function findShiritoriShortestPath(wordMap, firstChar, lastChar, requiredChars, excludeChars, noPrecedingWord, noSucceedingWord, requiredCharMode) {
    const allWords = Object.values(wordMap).flat(); 
    let startingWords = firstChar ? (wordMap[firstChar] || []) : allWords;
    
    // noPrecedingWord フィルタリング (単語数1も含む)
    if (noPrecedingWord) {
        startingWords = startingWords.filter(word => {
            const firstCharOfWord = normalizeWord(word);
            return !allWords.some(prevWord => prevWord !== word && getShiritoriLastChar(prevWord) === firstCharOfWord);
        });
    }

    const queue = [];
    // Key: word, Value: minLength (その単語に到達したときの最短の単語数)
    const minPathLength = {}; 
    let shortestLength = Infinity;
    let shortestPaths = [];
    
    // 1. 初期キュー投入と単語数1の処理
    for (const word of startingWords) {
        // パス長1のゴールチェック
        const last = getShiritoriLastChar(word);
        if (lastChar === null || last === lastChar) {
            
            let isNoSucceeding = true;
            if (noSucceedingWord) {
                 // word以外に、lastで始まる単語が存在しないか確認
                 isNoSucceeding = !allWords.some(nextWord => nextWord !== word && normalizeWord(nextWord) === last);
            }
            
            if (isNoSucceeding && 
                checkRequiredChars([word], requiredChars, requiredCharMode) && 
                checkExcludeChars([word], excludeChars)) {
                 
                 // 最短長が1であれば、更新して追加
                 if (shortestLength > 1) {
                     shortestLength = 1;
                     shortestPaths = []; // リセット
                 }
                 if (shortestLength === 1) {
                     shortestPaths.push([word]); 
                 }
            }
        }
        
        // BFSの探索のためにキューに投入
        if (!minPathLength[word]) {
            minPathLength[word] = 1;
            queue.push({ path: [word], used: new Set([word]) });
        }
    }
    
    // 2. BFS実行
    while (queue.length > 0) {
        const { path, used } = queue.shift();
        const currentLength = path.length;

        // 既に最短長以上であればスキップ
        if (currentLength >= shortestLength) continue;

        const lastWord = path[currentLength - 1];
        const lastCharOfCurrent = getShiritoriLastChar(lastWord);
        // 「ン」で終わる単語は探索をここで打ち切る
        if (!lastCharOfCurrent || lastCharOfCurrent === 'ン') continue;

        const nextWords = wordMap[lastCharOfCurrent] || [];

        for (const nextWord of nextWords) {
            if (!used.has(nextWord)) {
                const nextLength = currentLength + 1;
                
                // 次のパス長が既存の最短長と同じか超えていればスキップ
                if (nextLength > shortestLength) continue;

                // 経路の重複チェック（この単語に、より短い/同じ長さで既に到達しているか）
                // ただし、最短長のパスを収集するため、同じ長さの場合は次の探索に進む余地を残す
                if (minPathLength[nextWord] && minPathLength[nextWord] <= nextLength) {
                    // より短いか同じ長さで既に到達している場合、新しいパスが最短でない可能性が高いのでスキップ
                    if(minPathLength[nextWord] < nextLength) continue;
                    // 同じ長さの場合は、一旦キューには追加せず、ゴール条件のみチェック（メモリ/パフォーマンスのため）
                    // ここでは、最短長を更新した場合にのみminPathLengthを更新し、キューに追加する
                }
                
                const newPath = [...path, nextWord];
                const nextLastChar = getShiritoriLastChar(nextWord);
                
                // 3. ゴール条件チェック
                if (lastChar === null || nextLastChar === lastChar) {
                    
                    // noSucceedingWordのチェック (最終単語の場合のみ)
                    let isNoSucceeding = true;
                    if (noSucceedingWord) {
                         // nextWord以外に、nextLastCharで始まる単語が存在しないか確認
                         isNoSucceeding = !allWords.some(word => word !== nextWord && normalizeWord(word) === nextLastChar);
                    }
                    
                    if (isNoSucceeding) {
                        // 必須文字/除外文字のチェック
                        if (checkRequiredChars(newPath, requiredChars, requiredCharMode) && checkExcludeChars(newPath, excludeChars)) {
                            
                            if (nextLength < shortestLength) {
                                // 新しい最短パスを発見
                                shortestLength = nextLength;
                                shortestPaths = [newPath];
                            } else if (nextLength === shortestLength) {
                                // 同じ最短長のパスを追加
                                shortestPaths.push(newPath);
                            }
                        }
                    }
                }

                // 4. 次の探索のためにキューに追加
                // 次の長さが、現在の最短長より短い場合にのみ探索を続ける
                if (nextLength < shortestLength) {
                    // この単語への最短到達ステップを記録
                    minPathLength[nextWord] = nextLength; 
                    queue.push({ path: newPath, used: new Set(newPath) });
                }
            }
        }
    }
    
    // ソートして返却
    const collator = new Intl.Collator('ja', { sensitivity: 'base' });
    return shortestPaths.sort((a, b) => collator.compare(a.join(''), b.join('')));
}


// 💡 修正: requiredCharModeを引数に追加
function findShiritoriCombinations(wordMap, firstChar, lastChar, wordCount, requiredChars, excludeChars, noPrecedingWord, noSucceedingWord, requiredCharMode) {
    const allResults = [];
    const collator = new Intl.Collator('ja', { sensitivity: 'base' });
    const allWords = Object.values(wordMap).flat(); 

    function backtrack(path, usedWords) {
        if (path.length === wordCount) {
            const lastWord = path[path.length - 1];
            const endChar = getShiritoriLastChar(lastWord);
            
            if (noSucceedingWord) {
                const hasNextWord = (wordMap[endChar] || []).some(word => word !== lastWord && !usedWords.has(word));
                if (hasNextWord) {
                    return; 
                }
            }

            if ((lastChar === null || endChar === lastChar) && 
                checkRequiredChars(path, requiredChars, requiredCharMode) && 
                checkExcludeChars(path, excludeChars)) {
                allResults.push([...path]);
            }
            return;
        }
        
        const lastCharOfCurrent = getShiritoriLastChar(path[path.length - 1]);
        if (!lastCharOfCurrent || lastCharOfCurrent === 'ン') return;
        
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
               // 次の単語が、同じ単語自身でないことを確認
               isNoSucceeding = !(wordMap[endChar] || []).some(nextWord => nextWord !== word);
             }
             
             // noPrecedingWordのチェックはstartingWordsのフィルタリングで既に済んでいる
             
             if (isNoSucceeding && (lastChar === null || endChar === lastChar) && 
                 checkRequiredChars([word], requiredChars, requiredCharMode) && 
                 checkExcludeChars([word], excludeChars)) { 
                 allResults.push([word]);
             }
             continue;
        }
        
        backtrack([word], new Set([word]));
    }

    return allResults.sort((a, b) => collator.compare(a.join(''), b.join('')));
}


// 💡 修正: requiredCharModeを引数に追加
function findShiritoriByWordCountPatterns(wordMap, wordCountPatterns, requiredChars, allowPermutation, requiredCharMode) {
    let allResults = [];
    const collator = new Intl.Collator('ja', { sensitivity: 'base' });
    
    let patternSequences = [];

    if (allowPermutation) {
        patternSequences = getPermutations(wordCountPatterns);
    } else {
        patternSequences = generateCartesianProduct(wordCountPatterns);
    }
    
    if (patternSequences.length === 0 && wordCountPatterns.length > 0 && wordCountPatterns.every(arr => arr.length > 0)) {
        console.warn("No sequence generated. Check pattern input.");
        return [];
    }

    for (const sequence of patternSequences) {
        const totalWordCount = sequence.length;

        function backtrack(path, usedWords, patternIndex) {
            if (path.length === totalWordCount) {
                if (checkRequiredChars(path, requiredChars, requiredCharMode)) { 
                    allResults.push([...path]);
                }
                return;
            }
            
            const requiredLength = sequence[patternIndex];
            
            let nextWords;
            if (path.length === 0) {
                 nextWords = Object.values(wordMap).flat();
            } else {
                const lastCharOfCurrent = getShiritoriLastChar(path[path.length - 1]);
                if (!lastCharOfCurrent || lastCharOfCurrent === 'ン') return;
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


function patternToRegex(pattern) {
    let regexString = pattern.replace(/[.*+^${}()|[\]\\]/g, '\\$&'); 
    regexString = regexString.replace(/？/g, '.'); 
    return new RegExp('^' + regexString + '$');
}

// 💡 修正: requiredCharModeを引数に追加
function findWildcardShiritoriCombinations(wordMap, firstWordPattern, lastWordPattern, wordCount, requiredChars, requiredCharMode) {
    const allResults = [];
    const collator = new Intl.Collator('ja', { sensitivity: 'base' });
    
    const firstRegex = patternToRegex(firstWordPattern); 

    let lastRegex = null;
    if (lastWordPattern && lastWordPattern.trim() !== '') {
        lastRegex = patternToRegex(lastWordPattern);
    }
    
    const allWords = Object.values(wordMap).flat();

    const startingWords = allWords.filter(word => firstRegex.test(word));

    function backtrack(path, usedWords) {
        if (path.length === wordCount) {
            const lastWord = path[path.length - 1];
            
            if ((!lastRegex || lastRegex.test(lastWord)) && 
                checkRequiredChars(path, requiredChars, requiredCharMode)) { 
                allResults.push([...path]);
            }
            return;
        }
        
        const lastCharOfCurrent = getShiritoriLastChar(path[path.length - 1]);
        if (!lastCharOfCurrent || lastCharOfCurrent === 'ン') return;
        
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
            if ((!lastRegex || lastRegex.test(word)) && checkRequiredChars([word], requiredChars, requiredCharMode)) { 
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

// 文字指定しりとり検索 (最短パス実装 & 必須文字複数文字列対応)
app.post('/api/shiritori', (req, res) => {
    let { listName, firstChar, lastChar, wordCount, requiredChars, excludeChars, noPrecedingWord, noSucceedingWord, outputType, requiredCharMode } = req.body;
    const words = wordLists[listName];
    const map = wordMap[listName];

    if (!map || !words) {
        return res.status(400).json({ error: '無効な単語リストです。' });
    }

    if (typeof wordCount === 'string' && wordCount !== 'shortest') {
        wordCount = parseInt(wordCount, 10);
    }
    if (typeof wordCount === 'number' && (isNaN(wordCount) || wordCount < 1)) {
        return res.status(400).json({ error: '単語数は1以上の数字である必要があります。' });
    }
    
    // requiredChars の処理
    if (requiredChars && requiredChars.length === 0) {
        requiredChars = null;
    } 

    const mode = requiredCharMode === 'exactly' ? 'exactly' : 'atLeast';

    // excludeChars の処理
    if (excludeChars && typeof excludeChars === 'string' && excludeChars.trim() !== '') {
        excludeChars = excludeChars.split('');
    } else {
        excludeChars = null;
    }


    let results = [];
    
    // 💡 最短モードの処理
    if (wordCount === 'shortest') {
        if (outputType !== 'path') {
            return res.status(400).json({ error: '件数カウントは最短モードでは現在サポートされていません。' });
        }
        try {
            results = findShiritoriShortestPath(map, firstChar, lastChar, requiredChars, excludeChars, noPrecedingWord, noSucceedingWord, mode);
            return res.json({ results });
        } catch (e) {
            console.error("Error in shortest path shiritori:", e);
            return res.status(500).json({ error: 'サーバー内部で最短パス検索中にエラーが発生しました。詳細はサーバーログを確認してください。' });
        }
    }
    
    // 💡 固定単語数/カウントモードの処理
    if (outputType === 'firstCharCount' || outputType === 'lastCharCount') {
        if (Array.isArray(wordCount)) {
            return res.status(400).json({ error: '件数カウントは単語数指定モードでは現在サポートされていません。' });
        }
        
        results = findShiritoriCombinations(map, firstChar, lastChar, wordCount, requiredChars, excludeChars, noPrecedingWord, noSucceedingWord, mode);
        
        const counts = {};
        results.forEach(path => {
            const char = outputType === 'firstCharCount' 
                        ? normalizeWord(path[0]) 
                        : getShiritoriLastChar(path[path.length - 1]);
            
            if (char) {
                counts[char] = (counts[char] || 0) + 1;
            }
        });
        
        const collator = new Intl.Collator('ja', { sensitivity: 'base' });
        
        const sortedCounts = Object.entries(counts)
            .sort(([charA], [charB]) => collator.compare(charA, charB))
            .reduce((obj, [key, value]) => {
                obj[key] = value;
                return obj;
            }, {});

        
        if (outputType === 'firstCharCount') {
            return res.json({ firstCharCounts: sortedCounts });
        } else {
            return res.json({ lastCharCounts: sortedCounts });
        }
        
    } else { // outputType === 'path'
        if (Array.isArray(wordCount)) {
            return res.status(400).json({ error: '単語数指定の検索は現在実装されていません。' });
        }
        
        results = findShiritoriCombinations(map, firstChar, lastChar, wordCount, requiredChars, excludeChars, noPrecedingWord, noSucceedingWord, mode);
        return res.json({ results });
    }
});


// 単語数指定しりとり (必須文字複数文字列対応)
app.post('/api/word_count_shiritori', (req, res) => {
    let { listName, wordCountPatterns, requiredChars, allowPermutation, requiredCharMode } = req.body;
    const map = wordMap[listName];

    if (!map || !wordCountPatterns || !Array.isArray(wordCountPatterns) || wordCountPatterns.length === 0) {
        return res.status(400).json({ error: '無効な単語数パターンが指定されました。' });
    }
    
    const isValid = wordCountPatterns.every(arr => Array.isArray(arr) && arr.length > 0 && arr.every(n => typeof n === 'number' && n > 0));
    if (!isValid) {
        return res.status(400).json({ error: '単語数の指定は1以上の数字である必要があります（例: [[2, 3], [4]]）。' });
    }

    if (requiredChars && requiredChars.length === 0) {
        requiredChars = null;
    } 

    const mode = requiredCharMode === 'exactly' ? 'exactly' : 'atLeast';


    try {
        const results = findShiritoriByWordCountPatterns(map, wordCountPatterns, requiredChars, allowPermutation, mode);
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

// ？文字指定しりとり検索 (必須文字複数文字列対応)
app.post('/api/wildcard_shiritori', (req, res) => {
    let { listName, firstWordPattern, lastWordPattern, wordCount, requiredChars, requiredCharMode } = req.body;
    const map = wordMap[listName];

    if (!map || !firstWordPattern || isNaN(wordCount) || wordCount < 1) {
        return res.status(400).json({ error: '無効な入力です。' });
    }
    
    if (requiredChars && requiredChars.length === 0) {
        requiredChars = null;
    } 

    const mode = requiredCharMode === 'exactly' ? 'exactly' : 'atLeast';


    const results = findWildcardShiritoriCombinations(map, firstWordPattern, lastWordPattern, wordCount, requiredChars, mode);
    
    return res.json({ results });
});


// サーバー起動
app.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}`);
});