// =============================
// 🚀 高速キャッシュ
// =============================
const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static('.'));
const allWordsCache = {};
const lastCharCache = {};
const firstCharCache = {};
const regexWordCache = {};

function getFirstChar(word) {
    if (!firstCharCache[word]) {
        firstCharCache[word] = normalizeWord(word);
    }
    return firstCharCache[word];
}

function getLastChar(word) {
    if (!lastCharCache[word]) {
        lastCharCache[word] = getShiritoriLastChar(word);
    }
    return lastCharCache[word];
}



// === データとキャッシュ ===
let wordLists = {};
let wordMap = {}; 
let wordsByLength = {}; // 文字数でインデックス化
let wordsByFirstChar = {}; // 最初の文字でインデックス化
const shiritoriCache = {};

const LIST_FILES = ['kokumei.txt', 'shutomei.txt', 'kokumei_shutomei.txt', 'pokemon.txt', 'countries-only.txt', 'capitals-only.txt'];
const KOKUMEI_KEY = 'kokumei.txt';
const SHUTOMEI_KEY = 'shutomei.txt';
const KOKUMEI_SHUTOMEI_KEY = 'kokumei_shutomei.txt';
const POKEMON_KEY = 'pokemon.txt';
const COUNTRIES_ONLY_KEY = 'countries-only.txt';
const CAPITALS_ONLY_KEY = 'capitals-only.txt';

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

    const individualFiles = [KOKUMEI_KEY, SHUTOMEI_KEY, POKEMON_KEY, COUNTRIES_ONLY_KEY, CAPITALS_ONLY_KEY];

    individualFiles.forEach(fileName => {

        try {
            const data = fs.readFileSync(fileName, 'utf8');

            const words = data
                .split('\n')
                .map(w => w.trim())
                .filter(w => w.length > 0)
                .sort();

            wordLists[fileName] = words;

            allWordsCache[fileName] = words;
            
            // 文字数でインデックス化
            wordsByLength[fileName] = {};
            words.forEach(word => {
                const len = word.length;
                if (!wordsByLength[fileName][len]) {
                    wordsByLength[fileName][len] = [];
                }
                wordsByLength[fileName][len].push(word);
            });
            
            // 最初の文字でインデックス化（最後の文字→最初の文字でつなぐため）
            wordsByFirstChar[fileName] = {};
            words.forEach(word => {
                const firstChar = normalizeWord(word);
                if (!wordsByFirstChar[fileName][firstChar]) {
                    wordsByFirstChar[fileName][firstChar] = [];
                }
                wordsByFirstChar[fileName][firstChar].push(word);
            });
        } catch (e) {
            console.warn(`Warning: Could not load ${fileName}:`, e.message);
            wordLists[fileName] = [];
            allWordsCache[fileName] = [];
            wordsByLength[fileName] = {};
            wordsByFirstChar[fileName] = {};
        }
    });

    const combined = [...wordLists[KOKUMEI_KEY], ...wordLists[SHUTOMEI_KEY]];

    wordLists[KOKUMEI_SHUTOMEI_KEY] = [...new Set(combined)].sort();

    allWordsCache[KOKUMEI_SHUTOMEI_KEY] = wordLists[KOKUMEI_SHUTOMEI_KEY];
    
    // 複合リスト用のインデックス化
    wordsByLength[KOKUMEI_SHUTOMEI_KEY] = {};
    wordsByFirstChar[KOKUMEI_SHUTOMEI_KEY] = {};
    wordLists[KOKUMEI_SHUTOMEI_KEY].forEach(word => {
        const len = word.length;
        if (!wordsByLength[KOKUMEI_SHUTOMEI_KEY][len]) {
            wordsByLength[KOKUMEI_SHUTOMEI_KEY][len] = [];
        }
        wordsByLength[KOKUMEI_SHUTOMEI_KEY][len].push(word);
        
        const firstChar = normalizeWord(word);
        if (!wordsByFirstChar[KOKUMEI_SHUTOMEI_KEY][firstChar]) {
            wordsByFirstChar[KOKUMEI_SHUTOMEI_KEY][firstChar] = [];
        }
        wordsByFirstChar[KOKUMEI_SHUTOMEI_KEY][firstChar].push(word);
    });

    Object.keys(wordLists).forEach(listName => {

        wordMap[listName] = {};

        wordLists[listName].forEach(word => {

            const first = getFirstChar(word);

            if (!wordMap[listName][first]) {
                wordMap[listName][first] = [];
            }

            wordMap[listName][first].push(word);

        });

    });

}

/**
 * 単語の文字数がすべて異なる経路のみを抽出
 * 例：3単語の経路が [2,3,4] の組み合わせなら OK、[2,3,3] ならNG
 */
function filterUniqueWordLengths(results) {
    return results.filter(path => {
        const lengths = path.map(word => word.length);
        const uniqueLengths = new Set(lengths);
        return lengths.length === uniqueLengths.size;
    });
}

/**
 * 最初と最後の文字の組み合わせが唯一の経路のみを抽出
 * 例：ア→ド の組み合わせが複数ある場合、そのすべてを除外
 */
function filterUniquePairOnly(results) {
    // 各経路の「開始文字→終了文字」の組み合わせをカウント
    const pairCounts = {};
    
    results.forEach(path => {
        const firstChar = normalizeWord(path[0]);
        const lastChar = getShiritoriLastChar(path[path.length - 1]);
        const pairKey = `${firstChar}→${lastChar}`;
        
        pairCounts[pairKey] = (pairCounts[pairKey] || 0) + 1;
    });
    
    // 組み合わせが1つだけの経路のみをフィルタ
    const filteredResults = results.filter(path => {
        const firstChar = normalizeWord(path[0]);
        const lastChar = getShiritoriLastChar(path[path.length - 1]);
        const pairKey = `${firstChar}→${lastChar}`;
        
        return pairCounts[pairKey] === 1;
    });
    
    return filteredResults;
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
class PriorityQueue {
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
    push(value) {
        this._heap.push(value);
        this._bubbleUp(this._heap.length - 1);
    }
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
function findShiritoriShortestPath(wordMap, firstChar, lastChar, requiredChars, excludeChars, noPrecedingWord, noSucceedingWord, requiredCharMode, listName) {
    const allWords = Object.values(wordMap).flat(); 
    let startingWords = firstChar ? (wordMap[firstChar] || []) : allWords;
    
    const collator = new Intl.Collator('ja', { sensitivity: 'base' });
    
    // noPrecedingWord フィルタリング
    if (noPrecedingWord) {
        const firstCharSet = new Set(startingWords.map(normalizeWord));
        startingWords = startingWords.filter(word => {
            const firstCharOfWord = normalizeWord(word);
            return !allWords.some(prevWord => prevWord !== word && getShiritoriLastChar(prevWord) === firstCharOfWord);
        });
    }
    
    const pq = new PriorityQueue(); 
    const minPathLength = {}; 
    let shortestLength = Infinity;
    let shortestPaths = [];
    const seenPaths = new Set(); // 重複チェック用

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
        
        // 既にこの単語に、より短い文字数で到達しているか確認
        if (currentLength > minPathLength[currentWord]) {
            continue;
        }

        // 確定した最短文字数を超えているか確認
        if (currentLength > shortestLength) {
             continue;
        }

        const usedWords = new Set(path);
        const lastCharOfCurrent = getShiritoriLastChar(currentWord);

        // 終端文字がンまたは無効な文字で、かつそれがゴール条件を満たしていれば、ここでチェック
        const isEndWordCondition = (!lastCharOfCurrent || lastCharOfCurrent === 'ン' || (lastChar !== null && lastCharOfCurrent === lastChar));

        if (isEndWordCondition) {
             if (lastChar === null || lastChar === lastCharOfCurrent) {
                  let isNoSucceeding = true;
                  if (noSucceedingWord) {
                       isNoSucceeding = !allWords.some(word => word !== currentWord && normalizeWord(word) === lastCharOfCurrent);
                  }
                    
                  if (isNoSucceeding && 
                      checkRequiredChars(path, requiredChars, requiredCharMode) && 
                      checkExcludeChars(path, excludeChars)) {
                      
                      const pathKey = path.join(',');
                      if (!seenPaths.has(pathKey)) {
                          seenPaths.add(pathKey);
                          
                          if (currentLength < shortestLength) {
                              shortestLength = currentLength;
                              shortestPaths = [path];
                          } else if (currentLength === shortestLength) {
                              shortestPaths.push(path);
                          }
                      }
                  }
             }

             if (lastCharOfCurrent === 'ン' || currentLength === shortestLength) continue;
        }

        // wordsByFirstChar を使った高速なNext単語取得
        const nextWords = wordsByFirstChar[listName][lastCharOfCurrent] || [];

        for (const nextWord of nextWords) {
            if (!usedWords.has(nextWord)) {
                const nextLength = currentLength + nextWord.length;
                
                if (nextLength > shortestLength) continue;

                const newPath = [...path, nextWord];
                const nextLastChar = getShiritoriLastChar(nextWord);

                if (lastChar === null || nextLastChar === lastChar) {
                    
                    let isNoSucceeding = true;
                    if (noSucceedingWord) {
                         isNoSucceeding = !allWords.some(word => word !== nextWord && normalizeWord(word) === nextLastChar);
                    }
                    
                    if (isNoSucceeding) {
                        if (checkRequiredChars(newPath, requiredChars, requiredCharMode) && checkExcludeChars(newPath, excludeChars)) {
                            
                            const pathKey = newPath.join(',');
                            if (!seenPaths.has(pathKey)) {
                                seenPaths.add(pathKey);
                                
                                if (nextLength < shortestLength) {
                                    shortestLength = nextLength;
                                    shortestPaths = [newPath];
                                } else if (nextLength === shortestLength) {
                                    shortestPaths.push(newPath);
                                }
                            }
                        }
                    }
                }

                if (!minPathLength[nextWord] || nextLength < minPathLength[nextWord]) {
                    minPathLength[nextWord] = nextLength; 
                    pq.push([nextLength, nextWord, newPath]); 
                }
            }
        }
    }
    
    return shortestPaths.sort((a, b) => collator.compare(a.join(''), b.join('')));
}


// 💡 修正: requiredCharModeを引数に追加
function findShiritoriCombinations(wordMap, firstChar, lastChar, wordCount, requiredChars, excludeChars, noPrecedingWord, noSucceedingWord, requiredCharMode, listName) {
    const allResults = [];
    const collator = new Intl.Collator('ja', { sensitivity: 'base' });
    const allWords = Object.values(wordMap).flat(); 

    function backtrack(path, usedWords) {
        if (path.length === wordCount) {
            const lastWord = path[path.length - 1];
            const endChar = getShiritoriLastChar(lastWord);
            
            if (noSucceedingWord) {
                const nextWordList = wordsByFirstChar[listName][endChar] || [];
                const hasNextWord = nextWordList.some(word => !usedWords.has(word));
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
        
        const nextWords = wordsByFirstChar[listName][lastCharOfCurrent] || [];

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
               const nextWordList = wordsByFirstChar[listName][endChar] || [];
               isNoSucceeding = !nextWordList.some(nextWord => nextWord !== word);
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
function findShiritoriByWordCountPatterns(wordMap, wordCountPatterns, requiredChars, allowPermutation, requiredCharMode, listName) {
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
                nextWords = wordsByFirstChar[listName][lastCharOfCurrent] || [];
            }

            // 文字数でフィルタリング（つながっている単語のみ）
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

// 1. 正規表現作成関数の微調整
function patternToRegex(pattern) {
    if (!pattern || pattern.trim() === '') return null;
    let regexString = pattern.replace(/[.*+^${}()|[\]\\]/g, '\\$&'); 
    regexString = regexString.replace(/[?？]/g, '.'); 
    return new RegExp('^' + regexString + '$');
}

// 2. 探索メインロジックの修正
function findWildcardShiritoriCombinations(wordMap, wordPatterns, requiredChars, requiredCharMode, listName) {

    const results=[];
    const collator=new Intl.Collator('ja',{sensitivity:'base'});

    const wordCount=wordPatterns.length;

    const regexes=wordPatterns.map(patternToRegex);

    const allWords=Object.values(wordMap).flat();

    const candidates=regexes.map(regex=>{

        if(!regex)return allWords;

        return allWords.filter(word=>regex.test(word));

    });

    function backtrack(index,path,used){

        if(index===wordCount){

            if(checkRequiredChars(path,requiredChars,requiredCharMode)){

                results.push([...path]);

            }

            return;

        }

        const words=candidates[index];

        for(const word of words){

            if(used.has(word))continue;

            if(index>0){

                const prev=path[path.length-1];

                if(getLastChar(prev)!==getFirstChar(word))continue;

            }

            used.add(word);
            path.push(word);

            backtrack(index+1,path,used);

            path.pop();
            used.delete(word);

        }

    }

    backtrack(0,[],new Set());

    const unique=[];
    const seen=new Set();

    for(const r of results){

        const key=r.join(',');

        if(!seen.has(key)){

            seen.add(key);
            unique.push(r);

        }

    }

    return unique.sort((a,b)=>collator.compare(a.join(''),b.join('')));

}
// === Express エンドポイント ===

// サーバー起動時にデータをロード
console.log('Loading word data...');
loadWordData();
console.log('Word data loaded successfully!');

// 文字指定しりとり検索 (最短パス実装 & 必須文字複数文字列対応)
app.post('/api/shiritori', (req, res) => {
    let { listName, firstChar, lastChar, wordCount, requiredChars, excludeChars, noPrecedingWord, noSucceedingWord, outputType, requiredCharMode, uniqueWordLengths, uniquePairOnly } = req.body;
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
    const startTime = Date.now();
    
    // 💡 最短モードの処理
    if (wordCount === 'shortest') {
        if (outputType !== 'path') {
            return res.status(400).json({ error: '件数カウントは最短モードでは現在サポートされていません。' });
        }
        try {
            results = findShiritoriShortestPath(map, firstChar, lastChar, requiredChars, excludeChars, noPrecedingWord, noSucceedingWord, mode, listName);
            
            if (uniqueWordLengths) {
                results = filterUniqueWordLengths(results);
            }
            
            if (uniquePairOnly) {
                results = filterUniquePairOnly(results);
            }
            
            const elapsed = Date.now() - startTime;
            console.log(`Shiritori search completed in ${elapsed}ms (${results.length} results)`);
            
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
        
        results = findShiritoriCombinations(map, firstChar, lastChar, wordCount, requiredChars, excludeChars, noPrecedingWord, noSucceedingWord, mode, listName);
        
        if (uniqueWordLengths) {
            results = filterUniqueWordLengths(results);
        }
        
        if (uniquePairOnly) {
            results = filterUniquePairOnly(results);
        }
        
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

        const elapsed = Date.now() - startTime;
        console.log(`Shiritori count search completed in ${elapsed}ms`);
        
        if (outputType === 'firstCharCount') {
            return res.json({ firstCharCounts: sortedCounts });
        } else {
            return res.json({ lastCharCounts: sortedCounts });
        }
        
    } else { // outputType === 'path'
        if (Array.isArray(wordCount)) {
            return res.status(400).json({ error: '単語数指定の検索は現在実装されていません。' });
        }
        
        results = findShiritoriCombinations(map, firstChar, lastChar, wordCount, requiredChars, excludeChars, noPrecedingWord, noSucceedingWord, mode, listName);
        
        if (uniqueWordLengths) {
            results = filterUniqueWordLengths(results);
        }
        
        if (uniquePairOnly) {
            results = filterUniquePairOnly(results);
        }
        
        const elapsed = Date.now() - startTime;
        console.log(`Shiritori path search completed in ${elapsed}ms (${results.length} results)`);
        
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

    const startTime = Date.now();

    try {
        const results = findShiritoriByWordCountPatterns(map, wordCountPatterns, requiredChars, allowPermutation, mode, listName);
        const elapsed = Date.now() - startTime;
        console.log(`Word count shiritori search completed in ${elapsed}ms (${results.length} results)`);
        
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

// ？文字指定しりとり検索 (複数位置パターン・必須文字複数文字列対応)
app.post('/api/wildcard_shiritori', (req, res) => {
    let { listName, wordPatterns, firstWordPattern, lastWordPattern, wordCount, requiredChars, requiredCharMode } = req.body;
    const map = wordMap[listName];

    if (!map) {
        return res.status(400).json({ error: '無効なリストです。' });
    }

    if (!wordPatterns) {
        if (isNaN(wordCount) || wordCount < 1) {
            return res.status(400).json({ error: '無効な単語数です。' });
        }
        wordPatterns = new Array(wordCount).fill('');
        if (firstWordPattern) wordPatterns[0] = firstWordPattern;
        if (lastWordPattern && wordCount > 1) wordPatterns[wordCount - 1] = lastWordPattern;
        else if (lastWordPattern && wordCount === 1) wordPatterns[0] = lastWordPattern;
    }

    if (!Array.isArray(wordPatterns) || wordPatterns.length < 1) {
        return res.status(400).json({ error: '無効な入力です。' });
    }
    
    if (requiredChars && requiredChars.length === 0) {
        requiredChars = null;
    } 

    const mode = requiredCharMode === 'exactly' ? 'exactly' : 'atLeast';

    const results = findWildcardShiritoriCombinations(map, wordPatterns, requiredChars, mode, listName);
    
    return res.json({ results });
});

/**
 * 💡 ループしりとり探索ロジック（回転一致対応版）
 */
function findLoopShiritori(wordMap, pattern, listName) {
    const L = pattern.length;
    const regex = patternToRegex(pattern);
    const results = [];
    const allWords = Object.values(wordMap).flat();
    const collator = new Intl.Collator('ja', { sensitivity: 'base' });

    // 効率のため、パターン長以下の単語のみ対象
    const candidateWords = allWords.filter(w => w.length < L);

    function backtrack(path, currentStr) {
        if (currentStr.length === L) {
            const firstWord = path[0];
            const lastWord = path[path.length - 1];
            
            if (getShiritoriLastChar(lastWord) === normalizeWord(firstWord)) {
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
        const nextWords = wordsByFirstChar[listName][lastChar] || [];
        for (const nextWord of nextWords) {
            if (!path.includes(nextWord)) {
                backtrack([...path, nextWord], currentStr + nextWord);
            }
        }
    }

    for (const startWord of candidateWords) {
        backtrack([startWord], startWord);
    }

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

    const startTime = Date.now();

    try {
        const results = findLoopShiritori(map, pattern, listName);
        const elapsed = Date.now() - startTime;
        console.log(`Loop shiritori search completed in ${elapsed}ms (${results.length} results)`);
        
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