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
const listIndexes = {};
const searchResultCache = new Map();
const MAX_SEARCH_CACHE_ENTRIES = 200;

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
let wordsByFirstCharAndLength = {}; // 最初の文字 + 文字数でインデックス化
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

function getCachedRegex(pattern) {
    if (!pattern || pattern.trim() === '') return null;
    if (!regexWordCache[pattern]) {
        regexWordCache[pattern] = patternToRegex(pattern);
    }
    return regexWordCache[pattern];
}

function getSearchCacheKey(name, payload) {
    return `${name}:${JSON.stringify(payload)}`;
}

function getSearchCache(name, payload) {
    return searchResultCache.get(getSearchCacheKey(name, payload));
}

function setSearchCache(name, payload, value) {
    const key = getSearchCacheKey(name, payload);
    if (searchResultCache.has(key)) {
        searchResultCache.delete(key);
    } else if (searchResultCache.size >= MAX_SEARCH_CACHE_ENTRIES) {
        searchResultCache.delete(searchResultCache.keys().next().value);
    }
    searchResultCache.set(key, value);
}

function buildListIndexes(listName) {
    const words = wordLists[listName] || [];
    const byLength = {};
    const byFirstChar = {};
    const byFirstCharAndLength = {};
    const wordsByLastChar = {};
    const firstChars = new Set();
    const lastChars = new Set();
    const normalizedWords = {};
    const lastCharsByWord = {};
    const wordsWithRepeatedChars = new Set();

    words.forEach(word => {
        const firstChar = getFirstChar(word);
        const lastChar = getLastChar(word);
        const len = word.length;

        normalizedWords[word] = firstChar;
        lastCharsByWord[word] = lastChar;
        firstChars.add(firstChar);
        lastChars.add(lastChar);

        if (!byLength[len]) byLength[len] = [];
        byLength[len].push(word);

        if (!byFirstChar[firstChar]) byFirstChar[firstChar] = [];
        byFirstChar[firstChar].push(word);

        if (!byFirstCharAndLength[firstChar]) byFirstCharAndLength[firstChar] = {};
        if (!byFirstCharAndLength[firstChar][len]) byFirstCharAndLength[firstChar][len] = [];
        byFirstCharAndLength[firstChar][len].push(word);

        if (!wordsByLastChar[lastChar]) wordsByLastChar[lastChar] = [];
        wordsByLastChar[lastChar].push(word);

        if (hasRepeatedChar(word)) {
            wordsWithRepeatedChars.add(word);
        }
    });

    const noPrecedingWords = new Set(words.filter(word => {
        const precedingWords = wordsByLastChar[normalizedWords[word]] || [];
        return !precedingWords.some(prevWord => prevWord !== word);
    }));

    listIndexes[listName] = {
        allWords: words,
        byLength,
        byFirstChar,
        byFirstCharAndLength,
        wordsByLastChar,
        firstChars: [...firstChars],
        lastChars: [...lastChars],
        noPrecedingWords,
        normalizedWords,
        lastCharsByWord,
        wordsWithRepeatedChars
    };

    wordsByLength[listName] = byLength;
    wordsByFirstChar[listName] = byFirstChar;
    wordsByFirstCharAndLength[listName] = byFirstCharAndLength;
}

function getAllWords(listName) {
    return listIndexes[listName]?.allWords || allWordsCache[listName] || [];
}

function getWordsByFirstCharAndLength(listName, firstChar, length) {
    return wordsByFirstCharAndLength[listName]?.[firstChar]?.[length] || [];
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

        buildListIndexes(listName);
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
        const firstChar = getFirstChar(path[0]);
        const lastChar = getLastChar(path[path.length - 1]);
        const pairKey = `${firstChar}→${lastChar}`;
        
        pairCounts[pairKey] = (pairCounts[pairKey] || 0) + 1;
    });
    
    // 組み合わせが1つだけの経路のみをフィルタ
    const filteredResults = results.filter(path => {
        const firstChar = getFirstChar(path[0]);
        const lastChar = getLastChar(path[path.length - 1]);
        const pairKey = `${firstChar}→${lastChar}`;
        
        return pairCounts[pairKey] === 1;
    });
    
    return filteredResults;
}

/**
 * 合計文字数でフィルタリング
 */
function filterByTotalLength(results, totalLength) {
    if (!totalLength) return results;
    
    return results.filter(path => {
        const totalChars = path.reduce((sum, word) => sum + word.length, 0);
        return totalChars === totalLength;
    });
}

const DAKUTEN_CHARS = new Set('ガギグゲゴザジズゼゾダヂヅデドバビブベボヴがぎぐげござじずぜぞだぢづでどばびぶべぼゔ');
const HANDAKUTEN_CHARS = new Set('パピプペポぱぴぷぺぽ');
const SMALL_KANA_CHARS = new Set('ァィゥェォッャュョヮぁぃぅぇぉっゃゅょゎ');

function countCharsInPath(path, charSet) {
    return path.join('').split('').filter(char => charSet.has(char)).length;
}

function hasRepeatedChar(word) {
    const seen = new Set();
    for (const char of word.normalize('NFKC')) {
        if (seen.has(char)) return true;
        seen.add(char);
    }
    return false;
}

function countWordsWithRepeatedChars(path) {
    let count = 0;
    for (const word of path) {
        if (hasRepeatedChar(word)) count++;
    }
    return count;
}

function hasPrecedingWord(path, listName) {
    if (!path.length) return false;
    const firstWord = path[0];
    const firstChar = getFirstChar(firstWord);
    const precedingWords = listIndexes[listName]?.wordsByLastChar?.[firstChar] || [];
    return precedingWords.some(word => word !== firstWord);
}

function hasSucceedingWord(path, listName) {
    if (!path.length) return false;
    const lastWord = path[path.length - 1];
    const lastChar = getLastChar(lastWord);
    const nextWords = wordsByFirstChar[listName]?.[lastChar] || [];
    const usedWords = new Set(path);
    return nextWords.some(word => word !== lastWord && !usedWords.has(word));
}

function matchesNumberRule(actual, rule) {
    if (rule === undefined || rule === null || rule === '') return true;
    if (typeof rule === 'number') return actual === rule;
    if (typeof rule !== 'object') return true;

    const mode = rule.mode || 'exact';
    const value = Number(rule.value);
    if (Number.isNaN(value)) return true;

    if (mode === 'min') return actual >= value;
    if (mode === 'max') return actual <= value;
    return actual === value;
}

function matchesLengthPattern(path, pattern) {
    if (!pattern) return true;
    const lengths = path.map(word => word.length);
    if (lengths.length <= 1) return true;

    if (pattern === 'increasing') {
        return lengths.every((length, index) => index === 0 || length > lengths[index - 1]);
    }

    if (pattern === 'nondecreasing') {
        return lengths.every((length, index) => index === 0 || length >= lengths[index - 1]);
    }

    if (pattern === 'decreasing') {
        return lengths.every((length, index) => index === 0 || length < lengths[index - 1]);
    }

    if (pattern === 'nonincreasing') {
        return lengths.every((length, index) => index === 0 || length <= lengths[index - 1]);
    }

    if (pattern === 'arithmetic') {
        if (lengths.length <= 2) return true;
        const diff = lengths[1] - lengths[0];
        return lengths.every((length, index) => index < 2 || length - lengths[index - 1] === diff);
    }

    if (pattern === 'geometric') {
        if (lengths.length <= 2) return true;
        if (lengths[0] === 0) return false;
        const ratio = lengths[1] / lengths[0];
        return lengths.every((length, index) => {
            if (index < 2) return true;
            return Math.abs(lengths[index - 1] * ratio - length) < 1e-9;
        });
    }

    return true;
}

function filterByAdvancedConditions(results, advancedConditions, listName) {
    if (!advancedConditions || Object.keys(advancedConditions).length === 0) {
        return results;
    }

    const needsDakuten = advancedConditions.dakutenCount !== undefined;
    const needsHandakuten = advancedConditions.handakutenCount !== undefined;
    const needsSmallKana = advancedConditions.smallKanaCount !== undefined;
    const needsRepeated = advancedConditions.repeatedCharWordCount !== undefined;
    const repeatedWords = listIndexes[listName]?.wordsWithRepeatedChars;

    return results.filter(path => {
        let pathText = null;

        if (needsDakuten || needsHandakuten || needsSmallKana) {
            pathText = path.join('');
        }

        if (needsDakuten && !matchesNumberRule([...pathText].filter(char => DAKUTEN_CHARS.has(char)).length, advancedConditions.dakutenCount)) return false;
        if (needsHandakuten && !matchesNumberRule([...pathText].filter(char => HANDAKUTEN_CHARS.has(char)).length, advancedConditions.handakutenCount)) return false;
        if (needsSmallKana && !matchesNumberRule([...pathText].filter(char => SMALL_KANA_CHARS.has(char)).length, advancedConditions.smallKanaCount)) return false;
        if (needsRepeated) {
            const repeatedCount = repeatedWords
                ? path.reduce((count, word) => count + (repeatedWords.has(word) ? 1 : 0), 0)
                : countWordsWithRepeatedChars(path);
            if (!matchesNumberRule(repeatedCount, advancedConditions.repeatedCharWordCount)) return false;
        }

        if (advancedConditions.hasPrecedingWord !== undefined &&
            hasPrecedingWord(path, listName) !== advancedConditions.hasPrecedingWord) {
            return false;
        }

        if (advancedConditions.hasSucceedingWord !== undefined &&
            hasSucceedingWord(path, listName) !== advancedConditions.hasSucceedingWord) {
            return false;
        }

        if (!matchesLengthPattern(path, advancedConditions.lengthPattern)) return false;

        return true;
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
    const allWords = getAllWords(listName);
    let startingWords = firstChar ? (wordMap[firstChar] || []) : allWords;
    
    const collator = new Intl.Collator('ja', { sensitivity: 'base' });
    
    // noPrecedingWord フィルタリング
    if (noPrecedingWord) {
        const noPrecedingWords = listIndexes[listName]?.noPrecedingWords;
        startingWords = startingWords.filter(word => {
            if (noPrecedingWords) return noPrecedingWords.has(word);
            const firstCharOfWord = getFirstChar(word);
            return !allWords.some(prevWord => prevWord !== word && getLastChar(prevWord) === firstCharOfWord);
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
        const lastCharOfCurrent = getLastChar(currentWord);

        // 終端文字がンまたは無効な文字で、かつそれがゴール条件を満たしていれば、ここでチェック
        const isEndWordCondition = (!lastCharOfCurrent || lastCharOfCurrent === 'ン' || (lastChar !== null && lastCharOfCurrent === lastChar));

        if (isEndWordCondition) {
             if (lastChar === null || lastChar === lastCharOfCurrent) {
                   let isNoSucceeding = true;
                   if (noSucceedingWord) {
                        const nextWordList = wordsByFirstChar[listName][lastCharOfCurrent] || [];
                        isNoSucceeding = !nextWordList.some(word => word !== currentWord);
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
                const nextLastChar = getLastChar(nextWord);

                if (lastChar === null || nextLastChar === lastChar) {
                    
                    let isNoSucceeding = true;
                    if (noSucceedingWord) {
                         const nextWordList = wordsByFirstChar[listName][nextLastChar] || [];
                         isNoSucceeding = !nextWordList.some(word => word !== nextWord);
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
    const allWords = getAllWords(listName);

    function backtrack(path, usedWords) {
        if (path.length === wordCount) {
            const lastWord = path[path.length - 1];
            const endChar = getLastChar(lastWord);
            
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
        
        const lastCharOfCurrent = getLastChar(path[path.length - 1]);
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
        const noPrecedingWords = listIndexes[listName]?.noPrecedingWords;
        startingWords = startingWords.filter(word => {
            if (noPrecedingWords) return noPrecedingWords.has(word);
            const firstCharOfWord = getFirstChar(word);
            const hasPrecedingWord = allWords.some(prevWord => {
                if (prevWord === word) return false; 
                return getLastChar(prevWord) === firstCharOfWord;
            });
            return !hasPrecedingWord;
        });
    }

    for (const word of startingWords) {
        if (wordCount === 1) {
             const endChar = getLastChar(word);
             
             let isNoSucceeding = true;
             if (noSucceedingWord) {
                const nextWordList = wordsByFirstChar[listName][endChar] || [];
                isNoSucceeding = !nextWordList.some(nextWord => nextWord !== word);
             }
             
             let isNoPreceding = true;
             if (noPrecedingWord) {
                const firstCharOfWord = getFirstChar(word);
                isNoPreceding = !allWords.some(prevWord => {
                    if (prevWord === word) return false;
                    return getLastChar(prevWord) === firstCharOfWord;
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
                 nextWords = wordsByLength[listName]?.[requiredLength] || [];
            } else {
                const lastCharOfCurrent = getLastChar(path[path.length - 1]);
                if (!lastCharOfCurrent) return;
                nextWords = getWordsByFirstCharAndLength(listName, lastCharOfCurrent, requiredLength);
            }

            for (const word of nextWords) {
                if (!usedWords.has(word)) {
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

// 1. 正規表現作成関数の修正
function patternToRegex(pattern) {
    if (!pattern || pattern.trim() === '') return null;
    // ?と？を.に置き換える
    let regexString = pattern.replace(/[?？]/g, '.');
    // その他の特殊文字をエスケープ
    regexString = regexString.replace(/[.*+^${}()|[\]\\]/g, (match) => {
        // すでに.になっているものはそのまま
        if (match === '.') return match;
        return '\\' + match;
    });
    return new RegExp('^' + regexString + '$');
}

// 2. 探索メインロジックの修正
function findWildcardShiritoriCombinations(wordMap, wordPatterns, requiredChars, requiredCharMode, listName) {

    const results=[];
    const collator=new Intl.Collator('ja',{sensitivity:'base'});

    const wordCount=wordPatterns.length;

    const regexes=wordPatterns.map(getCachedRegex);

    const allWords=getAllWords(listName);

    const candidates=regexes.map((regex,index)=>{

        if(!regex)return allWords;

        const patternLength = wordPatterns[index].length;
        const pool = patternLength > 0 ? (wordsByLength[listName]?.[patternLength] || []) : allWords;
        return pool.filter(word=>regex.test(word));

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
    let { listName, firstChar, lastChar, wordCount, requiredChars, excludeChars, noPrecedingWord, noSucceedingWord, outputType, requiredCharMode, uniqueWordLengths, uniquePairOnly, totalLength, advancedConditions } = req.body;
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

    const cachePayload = {
        listName, firstChar, lastChar, wordCount, requiredChars, excludeChars,
        noPrecedingWord, noSucceedingWord, outputType, mode,
        uniqueWordLengths, uniquePairOnly, totalLength, advancedConditions
    };
    const cached = getSearchCache('shiritori', cachePayload);
    if (cached) return res.json(cached);

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
            
            // 合計文字数でフィルタリング
            if (totalLength) {
                results = filterByTotalLength(results, totalLength);
            }

            results = filterByAdvancedConditions(results, advancedConditions, listName);
            
            const elapsed = Date.now() - startTime;
            console.log(`Shiritori search completed in ${elapsed}ms (${results.length} results)`);
            
            const response = { results };
            setSearchCache('shiritori', cachePayload, response);
            return res.json(response);
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
        
        // 合計文字数でフィルタリング
        if (totalLength) {
            results = filterByTotalLength(results, totalLength);
        }

        results = filterByAdvancedConditions(results, advancedConditions, listName);
        
        const counts = {};
        results.forEach(path => {
            const char = outputType === 'firstCharCount' 
                        ? getFirstChar(path[0]) 
                        : getLastChar(path[path.length - 1]);
            
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
            const response = { firstCharCounts: sortedCounts };
            setSearchCache('shiritori', cachePayload, response);
            return res.json(response);
        } else {
            const response = { lastCharCounts: sortedCounts };
            setSearchCache('shiritori', cachePayload, response);
            return res.json(response);
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
        
        // 合計文字数でフィルタリング
        if (totalLength) {
            results = filterByTotalLength(results, totalLength);
        }

        results = filterByAdvancedConditions(results, advancedConditions, listName);
        
        const elapsed = Date.now() - startTime;
        console.log(`Shiritori path search completed in ${elapsed}ms (${results.length} results)`);
        
        const response = { results };
        setSearchCache('shiritori', cachePayload, response);
        return res.json(response);
    }
});


// 単語数指定しりとり (必須文字複数文字列対応)
app.post('/api/word_count_shiritori', (req, res) => {
    let { listName, wordCountPatterns, allowPermutation, uniqueWordLengths, totalLength, advancedConditions } = req.body;
    const map = wordMap[listName];

    if (!map) {
        return res.status(400).json({ error: '無効な単語リストです。' });
    }

    // wordCountPatternsが指定されていない場合、totalLengthで検索
    if (!wordCountPatterns || !Array.isArray(wordCountPatterns) || wordCountPatterns.length === 0) {
        if (!totalLength || totalLength < 1) {
            return res.status(400).json({ error: '単語数パターンまたは合計文字数を指定してください。' });
        }
        
        // 合計文字数のみで検索する処理
        const startTime = Date.now();
        const cachePayload = { listName, wordCountPatterns: [], allowPermutation, uniqueWordLengths, totalLength, advancedConditions };
        const cached = getSearchCache('word_count_shiritori', cachePayload);
        if (cached) return res.json(cached);

        try {
            let results = [];
            const allWords = getAllWords(listName);
            
            // 合計文字数に応じた可能性のある単語数を試す（1〜totalLength）
            for (let wordCount = 1; wordCount <= totalLength; wordCount++) {
                const combos = findShiritoriCombinations(map, null, null, wordCount, null, null, false, false, 'atLeast', listName);
                results = results.concat(combos);
            }

            if (uniqueWordLengths) {
                results = filterUniqueWordLengths(results);
            }
            
            // 合計文字数でフィルタリング
            if (totalLength) {
                results = filterByTotalLength(results, totalLength);
            }

            results = filterByAdvancedConditions(results, advancedConditions, listName);
            
            // 重複を削除
            const seen = new Set();
            const uniqueResults = [];
            results.forEach(path => {
                const key = path.join(',');
                if (!seen.has(key)) {
                    seen.add(key);
                    uniqueResults.push(path);
                }
            });
            
            const elapsed = Date.now() - startTime;
            console.log(`Word count shiritori search (totalLength only) completed in ${elapsed}ms (${uniqueResults.length} results)`);
            
            const response = { results: uniqueResults };
            setSearchCache('word_count_shiritori', cachePayload, response);
            return res.json(response);
        } catch (e) {
            console.error("Error in word count shiritori (totalLength search):", e);
            return res.status(500).json({ error: 'サーバー内部でエラーが発生しました。' });
        }
    }
    
    const isValid = wordCountPatterns.every(arr => Array.isArray(arr) && arr.length > 0 && arr.every(n => typeof n === 'number' && n > 0));
    if (!isValid) {
        return res.status(400).json({ error: '単語数の指定は1以上の数字である必要があります（例: [[2, 3], [4]]）。' });
    }

    const startTime = Date.now();
    const cachePayload = { listName, wordCountPatterns, allowPermutation, uniqueWordLengths, totalLength, advancedConditions };
    const cached = getSearchCache('word_count_shiritori', cachePayload);
    if (cached) return res.json(cached);

    try {
        let results = findShiritoriByWordCountPatterns(map, wordCountPatterns, null, allowPermutation, 'atLeast', listName);
        
        if (uniqueWordLengths) {
            results = filterUniqueWordLengths(results);
        }
        
        // 合計文字数でフィルタリング
        if (totalLength) {
            results = filterByTotalLength(results, totalLength);
        }

        results = filterByAdvancedConditions(results, advancedConditions, listName);
        
        const elapsed = Date.now() - startTime;
        console.log(`Word count shiritori search completed in ${elapsed}ms (${results.length} results)`);
        
        const response = { results };
        setSearchCache('word_count_shiritori', cachePayload, response);
        return res.json(response);
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

    const cached = getSearchCache('wildcard_search', { listName, searchText });
    if (cached) return res.json(cached);

    const regex = getCachedRegex(searchText);
    const pool = searchText.length > 0 ? (wordsByLength[listName]?.[searchText.length] || []) : words;
    
    const response = { wildcardMatches: pool.filter(word => regex.test(word)) };
    setSearchCache('wildcard_search', { listName, searchText }, response);
    return res.json(response);
});

// 部分文字列検索 (既存)
app.post('/api/substring_search', (req, res) => {
    const { listName, searchText } = req.body;
    const words = wordLists[listName];

    if (!words || !searchText) {
        return res.status(400).json({ error: '無効な入力です。' });
    }

    const cached = getSearchCache('substring_search', { listName, searchText });
    if (cached) return res.json(cached);

    const response = { substringMatches: words.filter(word => word.includes(searchText)) };
    setSearchCache('substring_search', { listName, searchText }, response);
    return res.json(response);
});

// ？文字指定しりとり検索 (複数位置パターン・必須文字複数文字列対応)
app.post('/api/wildcard_shiritori', (req, res) => {
    let { listName, wordPatterns, firstWordPattern, lastWordPattern, wordCount, requiredChars, requiredCharMode, totalLength, advancedConditions } = req.body;
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
    const cachePayload = { listName, wordPatterns, requiredChars, mode, totalLength, advancedConditions };
    const cached = getSearchCache('wildcard_shiritori', cachePayload);
    if (cached) return res.json(cached);

    let results = findWildcardShiritoriCombinations(map, wordPatterns, requiredChars, mode, listName);
    
    // 合計文字数でフィルタリング
    if (totalLength) {
        results = filterByTotalLength(results, totalLength);
    }

    results = filterByAdvancedConditions(results, advancedConditions, listName);
    
    const response = { results };
    setSearchCache('wildcard_shiritori', cachePayload, response);
    return res.json(response);
});

/**
 * 💡 ループしりとり探索ロジック（回転一致対応版）
 */
function findLoopShiritori(wordMap, pattern, listName) {
    const L = pattern.length;
    const regex = getCachedRegex(pattern);
    const results = [];
    const allWords = getAllWords(listName);
    const collator = new Intl.Collator('ja', { sensitivity: 'base' });

    // 効率のため、パターン長以下の単語のみ対象
    const candidateWords = allWords.filter(w => w.length < L);

    function backtrack(path, usedWords, currentStr) {
        if (currentStr.length === L) {
            const firstWord = path[0];
            const lastWord = path[path.length - 1];
            
            if (getLastChar(lastWord) === getFirstChar(firstWord)) {
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

        const lastChar = getLastChar(path[path.length - 1]);
        const nextWords = wordsByFirstChar[listName][lastChar] || [];
        for (const nextWord of nextWords) {
            if (!usedWords.has(nextWord)) {
                const nextStr = currentStr + nextWord;
                if (nextStr.length > L) continue;
                usedWords.add(nextWord);
                path.push(nextWord);
                backtrack(path, usedWords, nextStr);
                path.pop();
                usedWords.delete(nextWord);
            }
        }
    }

    for (const startWord of candidateWords) {
        backtrack([startWord], new Set([startWord]), startWord);
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

// フロントエンドからのリクエストを受けるエンドポイント
app.post('/api/loop_shiritori', (req, res) => {
    const { listName, pattern, totalLength, advancedConditions } = req.body;
    const map = wordMap[listName];
    
    if (!map || !pattern) {
        return res.status(400).json({ error: 'リスト名またはパターンが指定されていません。' });
    }

    const startTime = Date.now();
    const cachePayload = { listName, pattern, totalLength, advancedConditions };
    const cached = getSearchCache('loop_shiritori', cachePayload);
    if (cached) return res.json(cached);

    try {
        let results = findLoopShiritori(map, pattern, listName);
        
        // 合計文字数でフィルタリング
        if (totalLength) {
            results = filterByTotalLength(results, totalLength);
        }

        results = filterByAdvancedConditions(results, advancedConditions, listName);
        
        const elapsed = Date.now() - startTime;
        console.log(`Loop shiritori search completed in ${elapsed}ms (${results.length} results)`);
        
        const response = { results };
        setSearchCache('loop_shiritori', cachePayload, response);
        res.json(response);
    } catch (e) {
        console.error(e);
        res.status(500).json({ error: '探索中にエラーが発生しました。' });
    }
});

/**
 * チェーン検索
 * パターンと必須文字で条件を指定して、しりとり経路を探す
 * 輪にしない直線的な経路
 */
function findChainShiritori(wordMap, pattern, requiredChars, excludeChars, requiredCharMode, listName) {
    const results = [];
    const allWords = getAllWords(listName);
    const collator = new Intl.Collator('ja', { sensitivity: 'base' });

    // パターンの正規表現化と長さを取得
    const regex = getCachedRegex(pattern);
    if (!regex) {
        return [];
    }

    const patternLength = pattern.length;

    // DFS で経路を探索
    function backtrack(path, usedWords, currentStr) {
        const currentLength = currentStr.length;

        // パターンの長さに達したかチェック
        if (currentLength === patternLength) {
            // パターンマッチングをチェック
            if (!regex.test(currentStr)) {
                return;
            }

            // 必須文字・除外文字をチェック
            if (!checkRequiredChars(path, requiredChars, requiredCharMode)) {
                return;
            }

            if (!checkExcludeChars(path, excludeChars)) {
                return;
            }

            results.push([...path]);
            return;
        }

        // パターン長を超えたらスキップ
        if (currentLength > patternLength) {
            return;
        }

        // 次の単語を取得
        const lastCharOfCurrent = getLastChar(path[path.length - 1]);
        const nextWords = wordsByFirstChar[listName][lastCharOfCurrent] || [];
        
        for (const nextWord of nextWords) {
            // 既に使った単語は避ける
            if (usedWords.has(nextWord)) {
                continue;
            }

            const nextStr = currentStr + nextWord;
            const nextLength = nextStr.length;

            // パターン長を超えたらスキップ
            if (nextLength > patternLength) {
                continue;
            }

            usedWords.add(nextWord);
            path.push(nextWord);
            backtrack(path, usedWords, nextStr);
            path.pop();
            usedWords.delete(nextWord);
        }
    }

    // 全単語から開始
    for (const startWord of allWords) {
        const startStr = startWord;
        const startLength = startWord.length;

        // 開始単語がパターン長以下か確認
        if (startLength <= patternLength) {
            backtrack([startWord], new Set([startWord]), startStr);
        }
    }

    // 重複排除
    const uniquePaths = [];
    const seenPaths = new Set();

    results.forEach(path => {
        const pathKey = path.join(',');
        if (!seenPaths.has(pathKey)) {
            seenPaths.add(pathKey);
            uniquePaths.push(path);
        }
    });

    return uniquePaths.sort((a, b) => collator.compare(a.join(''), b.join('')));
}

app.post('/api/chain_shiritori', (req, res) => {
    let { listName, pattern, requiredChars, excludeChars, requiredCharMode, advancedConditions } = req.body;
    const map = wordMap[listName];

    if (!map) {
        return res.status(400).json({ error: '無効な単語リストです。' });
    }

    if (!pattern || pattern.trim() === '') {
        return res.status(400).json({ error: 'パターンは必須です。' });
    }

    if (requiredChars && requiredChars.length === 0) {
        requiredChars = null;
    }

    if (excludeChars && excludeChars.length === 0) {
        excludeChars = null;
    }

    const mode = requiredCharMode === 'exactly' ? 'exactly' : 'atLeast';

    const startTime = Date.now();
    const cachePayload = { listName, pattern, requiredChars, excludeChars, mode, advancedConditions };
    const cached = getSearchCache('chain_shiritori', cachePayload);
    if (cached) return res.json(cached);

    try {
        let results = findChainShiritori(
            map, 
            pattern, 
            requiredChars, 
            excludeChars, 
            mode, 
            listName
        );

        results = filterByAdvancedConditions(results, advancedConditions, listName);

        const elapsed = Date.now() - startTime;
        console.log(`Chain shiritori search completed in ${elapsed}ms (${results.length} results)`);

        const response = { results };
        setSearchCache('chain_shiritori', cachePayload, response);
        res.json(response);
    } catch (e) {
        console.error("Error in chain shiritori:", e);
        res.status(500).json({ error: '探索中にエラーが発生しました。' });
    }
});

/**
 * 自動生成モード（改善版）
 * 解の個数の範囲を指定して、条件を自動で調整
 */
app.post('/api/auto_generate', (req, res) => {
    let { 
        listName, 
        minSolutions, 
        maxSolutions,
        firstCharMode, 
        firstChar,
        lastCharMode,
        lastChar,
        wordCountMode,
        wordCount,
        includeCharsMode,
        includeChars,
        excludeCharsMode,
        excludeChars,
        totalLengthMode,
        totalLength,
        uniqueWordLengths
    } = req.body;
    
    const map = wordMap[listName];

    if (!map) {
        return res.status(400).json({ error: '無効な単語リストです。' });
    }

    minSolutions = parseInt(minSolutions, 10) || 5;
    maxSolutions = parseInt(maxSolutions, 10) || 20;

    if (minSolutions < 1 || maxSolutions < 1 || minSolutions > maxSolutions) {
        return res.status(400).json({ error: '解の範囲を正しく指定してください（最小 ≤ 最大）。' });
    }

    if (!wordCount || wordCount < 1) {
        return res.status(400).json({ error: '単語数は1以上である必要があります。' });
    }

    const startTime = Date.now();
    const cachePayload = {
        listName, minSolutions, maxSolutions, firstCharMode, firstChar,
        lastCharMode, lastChar, wordCountMode, wordCount, includeCharsMode,
        includeChars, excludeCharsMode, excludeChars, totalLengthMode,
        totalLength, uniqueWordLengths
    };
    const cached = getSearchCache('auto_generate', cachePayload);
    if (cached) return res.json(cached);

    try {
        // === 固定条件の確定 ===
        let fixedFirstChar = firstCharMode === 'fixed' ? (firstChar?.trim() || null) : null;
        let fixedLastChar = lastCharMode === 'fixed' ? (lastChar?.trim() || null) : null;
        const fixedWordCount = wordCountMode === 'fixed' ? parseInt(wordCount, 10) : null;
        const fixedIncludeChars = includeCharsMode === 'fixed' ? includeChars : null;
        const fixedExcludeChars = excludeCharsMode === 'fixed' ? excludeChars : null;
        let fixedTotalLength = totalLengthMode === 'fixed' ? parseInt(totalLength, 10) : null;

        const resultConditions = {};
        let finalResults = [];

        // === ステップ1：開始文字が「自動」の場合、最適な開始文字を見つける ===
        if (firstCharMode === 'auto') {
            const uniqueFirstChars = listIndexes[listName]?.firstChars || [...new Set(getAllWords(listName).map(getFirstChar))];
            
            let bestFirstChar = null;
            let bestResults = [];

            for (const tryFirstChar of uniqueFirstChars) {
                let candidateResults = findShiritoriCombinations(
                    map,
                    tryFirstChar,
                    fixedLastChar,
                    fixedWordCount || parseInt(wordCount, 10),
                    fixedIncludeChars,
                    fixedExcludeChars,
                    false,
                    false,
                    'atLeast',
                    listName
                );

                if (uniqueWordLengths) {
                    candidateResults = filterUniqueWordLengths(candidateResults);
                }

                if (candidateResults.length >= minSolutions && candidateResults.length <= maxSolutions) {
                    bestFirstChar = tryFirstChar;
                    bestResults = candidateResults.slice(0, maxSolutions);
                    break;
                }
            }

            if (bestFirstChar) {
                fixedFirstChar = bestFirstChar;
                finalResults = bestResults;
                resultConditions.firstChar = bestFirstChar;
            } else {
                const response = {
                    results: [],
                    conditions: resultConditions,
                    message: `開始文字を「自動」で設定した場合、${minSolutions}個以上${maxSolutions}個以下の条件が見つかりませんでした。`
                };
                setSearchCache('auto_generate', cachePayload, response);
                return res.json(response);
            }
        } else {
            resultConditions.firstChar = fixedFirstChar || '（指定なし）';
        }

        // === ステップ2：終了文字が「自動」の場合、最適な終了文字を見つける ===
        if (lastCharMode === 'auto') {
            const uniqueLastChars = listIndexes[listName]?.lastChars || [...new Set(getAllWords(listName).map(getLastChar))];
            
            let bestLastChar = null;
            let bestResults = [];

            for (const tryLastChar of uniqueLastChars) {
                let candidateResults = findShiritoriCombinations(
                    map,
                    fixedFirstChar,
                    tryLastChar,
                    fixedWordCount || parseInt(wordCount, 10),
                    fixedIncludeChars,
                    fixedExcludeChars,
                    false,
                    false,
                    'atLeast',
                    listName
                );

                if (uniqueWordLengths) {
                    candidateResults = filterUniqueWordLengths(candidateResults);
                }

                if (candidateResults.length >= minSolutions && candidateResults.length <= maxSolutions) {
                    bestLastChar = tryLastChar;
                    bestResults = candidateResults.slice(0, maxSolutions);
                    break;
                }
            }

            if (bestLastChar) {
                fixedLastChar = bestLastChar;
                finalResults = bestResults;
                resultConditions.lastChar = bestLastChar;
            } else {
                const response = {
                    results: [],
                    conditions: resultConditions,
                    message: `終了文字を「自動」で設定した場合、${minSolutions}個以上${maxSolutions}個以下の条件が見つかりませんでした。`
                };
                setSearchCache('auto_generate', cachePayload, response);
                return res.json(response);
            }
        } else {
            resultConditions.lastChar = fixedLastChar || '（指定なし）';
        }

        // === ステップ3：開始文字と終了文字が両方固定された時点で検索 ===
        if (finalResults.length === 0) {
            finalResults = findShiritoriCombinations(
                map,
                fixedFirstChar,
                fixedLastChar,
                fixedWordCount || parseInt(wordCount, 10),
                fixedIncludeChars,
                fixedExcludeChars,
                false,
                false,
                'atLeast',
                listName
            );

            if (uniqueWordLengths) {
                finalResults = filterUniqueWordLengths(finalResults);
            }
        }

        resultConditions.wordCount = fixedWordCount || parseInt(wordCount, 10);
        resultConditions.includeChars = fixedIncludeChars ? fixedIncludeChars.join(',') : '（指定なし）';
        resultConditions.excludeChars = fixedExcludeChars ? fixedExcludeChars.join(',') : '（指定なし）';

        // === ステップ4：合計文字数で自動調整 ===
        if (totalLengthMode === 'auto' && finalResults.length > maxSolutions) {
            const byLength = {};
            finalResults.forEach(path => {
                const totalLen = path.reduce((sum, word) => sum + word.length, 0);
                if (!byLength[totalLen]) {
                    byLength[totalLen] = [];
                }
                byLength[totalLen].push(path);
            });

            const sortedLengths = Object.keys(byLength).map(Number).sort((a, b) => a - b);
            finalResults = [];
            for (const len of sortedLengths) {
                if (finalResults.length >= maxSolutions) break;
                const remaining = maxSolutions - finalResults.length;
                finalResults = finalResults.concat(byLength[len].slice(0, remaining));
            }

            if (finalResults.length > 0) {
                fixedTotalLength = finalResults[0].reduce((sum, word) => sum + word.length, 0);
                resultConditions.totalLength = fixedTotalLength;
            }
        } else if (fixedTotalLength) {
            finalResults = filterByTotalLength(finalResults, fixedTotalLength);
            resultConditions.totalLength = fixedTotalLength;
        } else {
            resultConditions.totalLength = '（指定なし）';
        }

        // === ステップ5：解の個数が範囲内か確認 ===
        if (finalResults.length < minSolutions) {
            const response = {
                results: [],
                conditions: resultConditions,
                message: `解の個数が範囲外です。最小${minSolutions}個必要ですが、${finalResults.length}個しか見つかりませんでした。`
            };
            setSearchCache('auto_generate', cachePayload, response);
            return res.json(response);
        }

        // 上限を超えた場合はカット
        if (finalResults.length > maxSolutions) {
            finalResults = finalResults.slice(0, maxSolutions);
        }

        const elapsed = Date.now() - startTime;
        console.log(`Auto generate completed in ${elapsed}ms (${finalResults.length} results)`);

        const response = {
            results: finalResults,
            conditions: resultConditions
        };
        setSearchCache('auto_generate', cachePayload, response);
        return res.json(response);
    } catch (e) {
        console.error("Error in auto generate:", e);
        return res.status(500).json({ error: 'サーバー内部でエラーが発生しました。' });
    }
});

// サーバー起動
app.listen(port, () => {
    console.log(`Server listening at http://localhost:${port}`);
});
