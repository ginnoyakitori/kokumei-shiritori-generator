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

/**
 * 必須文字のチェックを部分文字列の出現回数ベースで実行
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


// === 探索補助関数 (順列・直積) ===

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

// 💡 最小ヒープを模したシンプルな優先度付きキュー (ダイクストラ法用)
// [totalLength, word, path] の配列を管理
class PriorityQueue {
    // 比較関数: totalLength (a[0]) が小さい方を優先
    constructor(comparator = (a, b) => a[0] < b[0]) {
        this._heap = [];
        this._comparator = comparator;
    }
    size() {
        return this._heap.length;
    }
    isEmpty() {
        return this.size() === 0;
    }
    // キューの末尾に追加し、バブルアップして順序を維持
    push(value) {
        this._heap.push(value);
        this._bubbleUp(this._heap.length - 1);
    }
    // 最小要素を取り出し、バブルダウンして順序を維持
    pop() {
        if (this.isEmpty()) return undefined;
        const top = this._heap[0];
        const bottom = this._heap.pop();
        if (!this.isEmpty()) {
            this._heap[0] = bottom;
            this._bubbleDown(0);
        }
        return top;
    }
    _bubbleUp(index) {
        while (index > 0) {
            const parentIndex = Math.floor((index - 1) / 2);
            if (this._comparator(this._heap[index], this._heap[parentIndex])) {
                [this._heap[index], this._heap[parentIndex]] = [this._heap[parentIndex], this._heap[index]];
                index = parentIndex;
            } else {
                break;
            }
        }
    }
    _bubbleDown(index) {
        let lastIndex = this.size() - 1;
        while (true) {
            let leftIndex = index * 2 + 1;
            let rightIndex = index * 2 + 2;
            let swapIndex = index;

            if (leftIndex <= lastIndex && this._comparator(this._heap[leftIndex], this._heap[swapIndex])) {
                swapIndex = leftIndex;
            }
            if (rightIndex <= lastIndex && this._comparator(this._heap[rightIndex], this._heap[swapIndex])) {
                swapIndex = rightIndex;
            }

            if (swapIndex !== index) {
                [this._heap[index], this._heap[swapIndex]] = [this._heap[swapIndex], this._heap[index]];
                index = swapIndex;
            } else {
                break;
            }
        }
    }
}


/**
 * 💡 最短「文字数」で到達するすべてのパスを探索 (ダイクストラ法)
 */
function findShiritoriShortestPath(wordMap, firstChar, lastChar, requiredChars, excludeChars, noPrecedingWord, noSucceedingWord, requiredCharMode) {
    const allWords = Object.values(wordMap).flat(); 
    let startingWords = firstChar ? (wordMap[firstChar] || []) : allWords;
    
    const collator = new Intl.Collator('ja', { sensitivity: 'base' });
    
    // noPrecedingWord フィルタリング
    if (noPrecedingWord) {
        startingWords = startingWords.filter(word => {
            const firstCharOfWord = normalizeWord(word);
            return !allWords.some(prevWord => prevWord !== word && getShiritoriLastChar(prevWord) === firstCharOfWord);
        });
    }
    
    // 💡 PriorityQueue: [合計文字数, 最後の単語, パスの配列]
    const pq = new PriorityQueue(); 
    
    // Key: word, Value: minLength (その単語に到達したときの最小文字数)
    const minPathLength = {}; 
    let shortestLength = Infinity; // 最短の文字数を追跡
    let shortestPaths = [];

    // 1. 初期キュー投入
    for (const word of startingWords) {
        const length = word.length;
        if (!minPathLength[word] || length < minPathLength[word]) {
            minPathLength[word] = length;
            pq.push([length, word, [word]]);
        }
    }

    // 2. ダイクストラ法実行
    while (pq.size() > 0) {
        const [currentLength, currentWord, path] = pq.pop();
        
        // 🚨 既にこの単語に、より短い文字数で到達しているか確認
        if (currentLength > minPathLength[currentWord]) {
            continue;
        }

        // 確定した最短文字数を超えているか確認 (最短文字数を見つけたらそれ以上の探索は行わない)
        if (currentLength > shortestLength) {
             continue;
        }

        const usedWords = new Set(path);
        const lastCharOfCurrent = getShiritoriLastChar(currentWord);

        // 終端文字がンまたは無効な文字で、かつそれがゴール条件を満たしていれば、ここでチェック
        const isEndWordCondition = (!lastCharOfCurrent || lastCharOfCurrent === 'ン' || (lastChar !== null && lastCharOfCurrent === lastChar));

        if (isEndWordCondition) {
             // 終端文字がンでも、それがゴール条件を満たしていれば、ここでチェックが必要
             if (lastChar === null || lastChar === lastCharOfCurrent) {
                  // ゴール条件チェック (文字数とフィルタリング)
                  let isNoSucceeding = true;
                  if (noSucceedingWord) {
                       // currentWord以外に、lastCharOfCurrentで始まる単語が存在しないか確認
                       isNoSucceeding = !allWords.some(word => word !== currentWord && normalizeWord(word) === lastCharOfCurrent);
                  }
                    
                  if (isNoSucceeding && 
                      checkRequiredChars(path, requiredChars, requiredCharMode) && 
                      checkExcludeChars(path, excludeChars)) {
                     
                     if (currentLength < shortestLength) {
                         shortestLength = currentLength;
                         shortestPaths = [path];
                     } else if (currentLength === shortestLength) {
                         shortestPaths.push(path);
                     }
                  }
             }

             // 終端文字がン、またはゴールに到達した場合、ここから次の探索は行わない
             if (lastCharOfCurrent === 'ン' || currentLength === shortestLength) continue;
        }


        const nextWords = wordMap[lastCharOfCurrent] || [];

        for (const nextWord of nextWords) {
            if (!usedWords.has(nextWord)) {
                const nextLength = currentLength + nextWord.length;
                
                // 次のパス長が確定した最短長を超えていればスキップ
                if (nextLength > shortestLength) continue;

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
                // 既にこの単語に、より短い文字数で到達していなければ更新
                if (!minPathLength[nextWord] || nextLength < minPathLength[nextWord]) {
                    minPathLength[nextWord] = nextLength; 
                    pq.push([nextLength, nextWord, newPath]); 
                }
            }
        }
    }
    
    // 🚨 重複排除のロジックをここに追加 🚨
    const uniquePaths = [];
    const seenPaths = new Set();
    
    shortestPaths.forEach(path => {
        const pathKey = path.join(',');
        if (!seenPaths.has(pathKey)) {
            seenPaths.add(pathKey);
            uniquePaths.push(path);
        }
    });
    
    // ソートして返却
    return uniquePaths.sort((a, b) => collator.compare(a.join(''), b.join('')));
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
                const hasNextWord = (wordMap[endChar] || []).some(word => !usedWords.has(word));
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
    
    if (requiredChars && requiredChars.length === 0) {
        requiredChars = null;
    } 

    const mode = requiredCharMode === 'exactly' ? 'exactly' : 'atLeast';


    if (excludeChars && excludeChars.trim() !== '') {
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
            // 🚨 文字数最短を検索するダイクストラ法ベースの関数を呼び出し 🚨
            results = findShiritoriShortestPath(map, firstChar, lastChar, requiredChars, excludeChars, noPrecedingWord, noSucceedingWord, mode);
            return res.json({ results });
        } catch (e) {
            console.error("Error in shortest path (Dijkstra) shiritori:", e);
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
/**
 * 💡 ループしりとり探索ロジック
 */
/**
 * 💡 ループしりとり探索ロジック（回転一致対応版）
 */
function findLoopShiritori(wordMap, pattern) {
    const L = pattern.length;
    const regex = patternToRegex(pattern);
    const results = [];
    const allWords = Object.values(wordMap).flat();
    const collator = new Intl.Collator('ja', { sensitivity: 'base' });

    // 効率のため、パターン長以下の単語のみ対象
    const candidateWords = allWords.filter(w => w.length < L);

    function backtrack(path, currentStr) {
        // 現在の文字列長が目標に達したかチェック
        if (currentStr.length === L) {
            const firstWord = path[0];
            const lastWord = path[path.length - 1];
            
            // 1. ループ構造（最後と最初が繋がるか）を確認
            if (getShiritoriLastChar(lastWord) === normalizeWord(firstWord)) {
                // 2. 回転一致のチェック
                // 文字列を1文字ずつずらして、どれかがパターンに合うかチェック
                for (let i = 0; i < L; i++) {
                    const rotatedStr = currentStr.slice(i) + currentStr.slice(0, i);
                    if (regex.test(rotatedStr)) {
                        results.push([...path]);
                        break; 
                    }
                }
            }
            return;
        }

        if (currentStr.length > L) return;

        const lastChar = getShiritoriLastChar(path[path.length - 1]);
        const nextWords = wordMap[lastChar] || [];
        for (const nextWord of nextWords) {
            if (!path.includes(nextWord)) {
                backtrack([...path, nextWord], currentStr + nextWord);
            }
        }
    }

    // すべての単語を開始地点として試行
    for (const startWord of candidateWords) {
        backtrack([startWord], startWord);
    }

    // 重複排除（同じ単語の組み合わせによる輪を1つにまとめる）
    const uniquePaths = [];
    const seenLoops = new Set();

    results.forEach(path => {
        const loopId = [...path].sort().join(',');
        if (!seenLoops.has(loopId)) {
            seenLoops.add(loopId);
            uniquePaths.push(path);
        }
    });

    return uniquePaths.sort((a, b) => collator.compare(a.join(''), b.join('')));
}

// 🚨 【追加】フロントエンドからのリクエストを受けるエンドポイント
app.post('/api/loop_shiritori', (req, res) => {
    const { listName, pattern } = req.body;
    const map = wordMap[listName];
    
    if (!map || !pattern) {
        return res.status(400).json({ error: 'リスト名またはパターンが指定されていません。' });
    }

    try {
        const results = findLoopShiritori(map, pattern);
        res.json({ results });
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: '探索中にエラーが発生しました。' });
    }
});
// サーバー起動
app.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}`);
});