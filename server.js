const express = require('express');
const fs = require('fs');
const path = require('path');
const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, '')));

const wordLists = {};
const wordMap = {};
const suffixTrees = {};
const shiritoriCache = {}; // 4単語以下のしりとりをキャッシュ

// Suffix Treeのノードクラス
class Node {
    constructor() {
        this.children = {};
        this.indices = new Set();
    }
}

// Suffix Treeの構築関数
const buildSuffixTree = (words) => {
    const root = new Node();
    for (let i = 0; i < words.length; i++) {
        const word = words[i];
        for (let j = 0; j < word.length; j++) {
            let node = root;
            for (let k = j; k < word.length; k++) {
                const char = word[k];
                if (!node.children[char]) {
                    node.children[char] = new Node();
                }
                node = node.children[char];
                node.indices.add(i);
            }
        }
    }
    return root;
};

// Suffix Treeの検索関数
const searchSuffixTree = (tree, searchText) => {
    let node = tree;
    for (const char of searchText) {
        if (!node.children[char]) {
            return [];
        }
        node = node.children[char];
    }
    return [...node.indices];
};

const loadWordLists = () => {
    try {
        const kokumeiPath = path.join(__dirname, 'kokumei.txt');
        const shutomeiPath = path.join(__dirname, 'shutomei.txt');
        
        const kokumeiWords = fs.readFileSync(kokumeiPath, 'utf-8')
                               .split('\n')
                               .map(word => word.trim())
                               .filter(word => word.length > 0);
        const shutomeiWords = fs.readFileSync(shutomeiPath, 'utf-8')
                               .split('\n')
                               .map(word => word.trim())
                               .filter(word => word.length > 0);
        
        wordLists['kokumei.txt'] = kokumeiWords;
        wordLists['shutomei.txt'] = shutomeiWords;
        
        const combinedWords = [...new Set([...kokumeiWords, ...shutomeiWords])];
        wordLists['kokumei_shutomei.txt'] = combinedWords;

        for (const listName in wordLists) {
            wordMap[listName] = {};
            for (const word of wordLists[listName]) {
                const normalized = normalizeWord(word);
                const firstChar = normalized[0];
                if (firstChar) {
                    if (!wordMap[listName][firstChar]) {
                        wordMap[listName][firstChar] = [];
                    }
                    wordMap[listName][firstChar].push(word);
                }
            }
            suffixTrees[listName] = buildSuffixTree(wordLists[listName]);
        }
        
        console.log('単語リストを読み込み、データ構造を最適化しました。');

        // 💡 4単語以下のしりとりパスを生成し、キャッシュに保存
        const listNamesToCache = ['kokumei.txt', 'shutomei.txt', 'kokumei_shutomei.txt'];
        const maxCacheLength = 4; // 4単語までキャッシュ

        for (const listName of listNamesToCache) {
            shiritoriCache[listName] = {};
            const map = wordMap[listName];
            
            console.log(`\n${listName} の ${maxCacheLength} 単語までのしりとりパスを計算中...`);
            // 単語数2からmaxCacheLengthまでキャッシュ
            for (let count = 2; count <= maxCacheLength; count++) {
                // findShiritoriCombinationsを使用して、全通りのパスを計算
                shiritoriCache[listName][count] = findShiritoriCombinations(map, null, null, count, null);
                console.log(`- ${listName} の ${count} 単語パス: ${shiritoriCache[listName][count].length} 件をキャッシュしました。`);
            }
        }
        
    } catch (error) {
        console.error('ファイルの読み込み中にエラーが発生しました:', error);
    }
};

loadWordLists();

// === A*アルゴリズム関連の追加コード ===
class PriorityQueue {
    constructor(comparator = (a, b) => a > b) {
        this._heap = [];
        this._comparator = comparator;
    }
    push(value) {
        this._heap.push(value);
        this._siftUp();
    }
    pop() {
        if (this.size() === 1) return this._heap.pop();
        const result = this._heap[0];
        this._heap[0] = this._heap.pop();
        this._siftDown();
        return result;
    }
    peek() { return this._heap[0]; }
    isEmpty() { return this._heap.length === 0; }
    size() { return this._heap.length; }
    _siftUp() {
        let nodeIndex = this.size() - 1;
        while (nodeIndex > 0 && this._comparator(this._heap[nodeIndex], this._heap[this._parentIndex(nodeIndex)])) {
            this._swap(nodeIndex, this._parentIndex(nodeIndex));
            nodeIndex = this._parentIndex(nodeIndex);
        }
    }
    _siftDown() {
        let nodeIndex = 0;
        while (
            (this._leftChildIndex(nodeIndex) < this.size() && this._comparator(this._heap[this._leftChildIndex(nodeIndex)], this._heap[nodeIndex])) ||
            (this._rightChildIndex(nodeIndex) < this.size() && this._comparator(this._heap[this._rightChildIndex(nodeIndex)], this._heap[nodeIndex]))
        ) {
            const smallerChildIndex = (
                this._rightChildIndex(nodeIndex) < this.size() &&
                this._comparator(this._heap[this._rightChildIndex(nodeIndex)], this._heap[this._leftChildIndex(nodeIndex)])
            ) ? this._rightChildIndex(nodeIndex) : this._leftChildIndex(nodeIndex);
            this._swap(nodeIndex, smallerChildIndex);
            nodeIndex = smallerChildIndex;
        }
    }
    _parentIndex(i) { return Math.floor((i - 1) / 2); }
    _leftChildIndex(i) { return 2 * i + 1; }
    _rightChildIndex(i) { return 2 * i + 2; }
    _swap(i, j) { [this._heap[i], this._heap[j]] = [this._heap[j], this._heap[i]]; }
}

// 文字指定しりとり用のヒューリスティック関数
function heuristic(path, lastChar, requiredChars) {
    let cost = 0;
    
    const currentWord = path[path.length - 1];
    if (lastChar !== null && getShiritoriLastChar(currentWord) !== lastChar) {
        cost += 1;
    }
    
    if (requiredChars) {
        const pathString = path.join('');
        const missingChars = requiredChars.filter(char => !pathString.includes(char));
        cost += missingChars.length;
    }
    
    return cost;
}

// 単語数指定しりとり用のヒューリスティック関数
function heuristicWordCount(path, wordCounts, requiredChars) {
    let cost = 0;
    
    cost += wordCounts.length - path.length;
    
    if (requiredChars) {
        const pathString = path.join('');
        const missingChars = requiredChars.filter(char => !pathString.includes(char));
        cost += missingChars.length;
    }
    
    return cost;
}

// 文字指定しりとり用のA*アルゴリズム（重複禁止版）
function findShortestShiritoriAStar(wordMap, firstChar, lastChar, requiredChars) {
    const collator = new Intl.Collator('ja', { sensitivity: 'base' });
    const priorityQueue = new PriorityQueue((a, b) => a.f - b.f);
    const allResults = [];
    let minLength = Infinity;

    const startWords = firstChar ? (wordMap[firstChar] || []) : Object.values(wordMap).flat();
    for (const word of startWords) {
        const path = [word];
        const usedWords = new Set([word]);
        const g = 1;
        const h = heuristic(path, lastChar, requiredChars);
        const f = g + h;
        priorityQueue.push({ f, g, path, usedWords });
    }
    
    while (!priorityQueue.isEmpty()) {
        const { path, usedWords } = priorityQueue.pop();
        const currentWord = path[path.length - 1];

        if (path.length > minLength) {
            continue;
        }

        const isEndConditionMet = lastChar === null || getShiritoriLastChar(currentWord) === lastChar;
        const hasAllRequired = requiredChars ? checkRequiredChars(path, requiredChars) : true;
        
        if (isEndConditionMet && hasAllRequired) {
            if (path.length < minLength) {
                minLength = path.length;
                allResults.length = 0;
                allResults.push(path);
            } else if (path.length === minLength) {
                allResults.push(path);
            }
            continue;
        }

        const nextChar = getShiritoriLastChar(currentWord);
        const nextWords = wordMap[nextChar] || [];

        for (const nextWord of nextWords) {
            if (!usedWords.has(nextWord)) {
                const newPath = [...path, nextWord];
                const newUsedWords = new Set(usedWords).add(nextWord);
                const newG = newPath.length;
                const newH = heuristic(newPath, lastChar, requiredChars);
                const newF = newG + newH;
                
                priorityQueue.push({ f: newF, g: newG, path: newPath, usedWords: newUsedWords });
            }
        }
    }

    return allResults.sort((a, b) => collator.compare(a.join(''), b.join('')));
}

// 単語数指定しりとり用のA*アルゴリズム（重複禁止版）
function findWordCountShiritoriAStar(wordMap, wordCounts, requiredChars) {
    const collator = new Intl.Collator('ja', { sensitivity: 'base' });
    const priorityQueue = new PriorityQueue((a, b) => a.f - b.f);
    const allResults = [];
    
    const startWords = Object.values(wordMap).flat().filter(word => normalizeWord(word).length === wordCounts[0]);
    for (const word of startWords) {
        const path = [word];
        const usedWords = new Set([word]);
        const g = 1;
        const h = heuristicWordCount(path, wordCounts, requiredChars);
        const f = g + h;
        priorityQueue.push({ f, g, path, usedWords });
    }
    
    while (!priorityQueue.isEmpty()) {
        const { path, usedWords } = priorityQueue.pop();
        
        if (path.length === wordCounts.length) {
            if (checkRequiredChars(path, requiredChars)) {
                allResults.push(path);
            }
            continue;
        }

        const currentWord = path[path.length - 1];
        const lastCharOfCurrent = getShiritoriLastChar(currentWord);
        
        const nextIndex = path.length;
        if (nextIndex >= wordCounts.length) {
            continue;
        }
        
        const nextWords = (wordMap[lastCharOfCurrent] || []).filter(word => normalizeWord(word).length === wordCounts[nextIndex]);
        
        for (const nextWord of nextWords) {
            if (!usedWords.has(nextWord)) {
                const newPath = [...path, nextWord];
                const newUsedWords = new Set(usedWords).add(nextWord);
                const newG = newPath.length;
                const newH = heuristicWordCount(newPath, wordCounts, requiredChars);
                const newF = newG + newH;
                
                priorityQueue.push({ f: newF, g: newG, path: newPath, usedWords: newUsedWords });
            }
        }
    }
    
    return allResults.sort((a, b) => collator.compare(a.join(''), b.join('')));
}

// === その他の共通関数 ===
function normalizeWord(word) {
    const replacements = {
        'ー': '', 'ァ': 'ア', 'ィ': 'イ', 'ゥ': 'ウ', 'ェ': 'エ', 'ォ': 'オ',
        'ャ': 'ヤ', 'ュ': 'ユ', 'ョ': 'ヨ', 'ッ': ''
    };
    return [...word].map(c => replacements[c] || c).join('');
}

function getShiritoriLastChar(word) {
    const normalized = normalizeWord(word);
    if (!normalized) return '';
    
    if (word.slice(-1) === 'ー' && normalized.length > 1) {
        const secondLastChar = normalized.slice(-2, -1);
        return secondLastChar;
    }
    
    return normalized.slice(-1);
}

function checkRequiredChars(path, requiredChars) {
    if (!requiredChars) return true;
    const allCharsInPath = path.join('');
    const requiredCharCounts = requiredChars.reduce((acc, char) => {
        acc[char] = (acc[char] || 0) + 1;
        return acc;
    }, {});
    
    return Object.keys(requiredCharCounts).every(char => {
        const count = [...allCharsInPath].filter(c => c === char).length;
        return count >= requiredCharCounts[char];
    });
}

// === 全通り探索のバックトラック関数（既存） ===
function findShiritoriCombinations(wordMap, firstChar, lastChar, wordCount, requiredChars) {
    const allResults = [];
    const collator = new Intl.Collator('ja', { sensitivity: 'base' });

    function backtrack(path, usedWords) {
        if (path.length === wordCount) {
            if ((lastChar === null || getShiritoriLastChar(path[path.length - 1]) === lastChar) && checkRequiredChars(path, requiredChars)) {
                allResults.push([...path]);
            }
            return;
        }
        
        const lastCharOfCurrent = getShiritoriLastChar(path[path.length - 1]);
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

    const startingWords = firstChar ? (wordMap[firstChar] || []) : Object.values(wordMap).flat();
    for (const word of startingWords) {
        // wordCountが1の場合は、単語自体が条件を満たすかチェック
        if (wordCount === 1) {
             if ((lastChar === null || getShiritoriLastChar(word) === lastChar) && checkRequiredChars([word], requiredChars)) {
                 allResults.push([word]);
             }
             continue;
        }
        
        backtrack([word], new Set([word]));
    }

    return allResults.sort((a, b) => collator.compare(a.join(''), b.join('')));
}

function findFirstCharCounts(wordMap, firstChar, lastChar, wordCount, requiredChars) {
    const counts = {};
    function backtrack(path, usedWords) {
        if (path.length === wordCount) {
            if ((lastChar === null || getShiritoriLastChar(path[path.length - 1]) === lastChar) && checkRequiredChars(path, requiredChars)) {
                const startChar = normalizeWord(path[0])[0];
                counts[startChar] = (counts[startChar] || 0) + 1;
            }
            return;
        }
        const lastCharOfCurrent = getShiritoriLastChar(path[path.length - 1]);
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
    const startingWords = firstChar ? (wordMap[firstChar] || []) : Object.values(wordMap).flat();
    for (const word of startingWords) {
        if (wordCount === 1) {
             if ((lastChar === null || getShiritoriLastChar(word) === lastChar) && checkRequiredChars([word], requiredChars)) {
                 const startChar = normalizeWord(word)[0];
                 counts[startChar] = (counts[startChar] || 0) + 1;
             }
             continue;
        }
        backtrack([word], new Set([word]));
    }
    return counts;
}

function findLastCharCounts(wordMap, firstChar, lastChar, wordCount, requiredChars) {
    const counts = {};
    function backtrack(path, usedWords) {
        if (path.length === wordCount) {
            const endChar = getShiritoriLastChar(path[path.length - 1]);
            if ((lastChar === null || endChar === lastChar) && checkRequiredChars(path, requiredChars)) {
                counts[endChar] = (counts[endChar] || 0) + 1;
            }
            return;
        }
        const lastCharOfCurrent = getShiritoriLastChar(path[path.length - 1]);
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
    const startingWords = firstChar ? (wordMap[firstChar] || []) : Object.values(wordMap).flat();
    for (const word of startingWords) {
        if (wordCount === 1) {
             const endChar = getShiritoriLastChar(word);
             if ((lastChar === null || endChar === lastChar) && checkRequiredChars([word], requiredChars)) {
                 counts[endChar] = (counts[endChar] || 0) + 1;
             }
             continue;
        }
        backtrack([word], new Set([word]));
    }
    return counts;
}

// === ワイルドカード指定しりとり探索関数 (新規追加) ===
/**
 * 最初の単語と最後の単語をワイルドカードで指定するしりとりを全通り探索する関数
 */
function findWildcardShiritoriCombinations(wordMap, firstWordPattern, lastWordPattern, wordCount, requiredChars) {
    const allResults = [];
    const collator = new Intl.Collator('ja', { sensitivity: 'base' });

    // 1. 最初の単語の候補を抽出
    const firstWordRegex = new RegExp(`^${firstWordPattern.replace(/？/g, '.')}$`);
    const potentialStartWords = Object.values(wordMap).flat().filter(word => firstWordRegex.test(word));
    
    // 2. 最後の単語の条件を正規表現に変換 (探索を高速化するため)
    let lastWordRegex = null;
    if (lastWordPattern) {
        lastWordRegex = new RegExp(`^${lastWordPattern.replace(/？/g, '.')}$`);
    }

    function backtrack(path, usedWords) {
        if (path.length === wordCount) {
            const lastWord = path[path.length - 1];
            
            // 最後の単語のワイルドカード条件をチェック
            const lastWordConditionMet = !lastWordRegex || lastWordRegex.test(lastWord);

            if (lastWordConditionMet && checkRequiredChars(path, requiredChars)) {
                allResults.push([...path]);
            }
            return;
        }
        
        const lastCharOfCurrent = getShiritoriLastChar(path[path.length - 1]);
        const nextWords = wordMap[lastCharOfCurrent] || [];

        for (const word of nextWords) {
            // 探索の深さが最終単語の1つ前の場合
            if (path.length === wordCount - 1) {
                // 最終単語のワイルドカード条件を満たさない場合はスキップ
                if (lastWordRegex && !lastWordRegex.test(word)) {
                    continue;
                }
            }

            if (!usedWords.has(word)) {
                path.push(word);
                usedWords.add(word);
                backtrack(path, usedWords);
                usedWords.delete(word);
                path.pop();
            }
        }
    }

    for (const word of potentialStartWords) {
        if (wordCount === 1) {
            // 単語数が1の場合、開始単語が終了条件も満たすかチェック
            const lastWordConditionMet = !lastWordRegex || lastWordRegex.test(word);
            if (lastWordConditionMet && checkRequiredChars([word], requiredChars)) {
                allResults.push([word]);
            }
            continue;
        }

        backtrack([word], new Set([word]));
    }

    return allResults.sort((a, b) => collator.compare(a.join(''), b.join('')));
}

// === APIエンドポイント ===
app.post('/api/shiritori', (req, res) => {
    let { listName, firstChar, lastChar, wordCount, requiredChars, outputType } = req.body;
    const words = wordLists[listName];
    const map = wordMap[listName];
    const cache = shiritoriCache[listName]; 

    if (!words || !map) {
        return res.status(400).json({ error: '無効な単語リストです。' });
    }
    if (firstChar !== null && firstChar && firstChar.length !== 1) {
        return res.status(400).json({ error: '最初の文字は1文字で入力するか、指定しないでください。' });
    }
    if (lastChar !== null && lastChar && lastChar.length !== 1) {
        return res.status(400).json({ error: '最後の文字は1文字で入力するか、指定しないでください。' });
    }
    if (wordCount !== 'shortest' && !Array.isArray(wordCount) && (typeof wordCount !== 'number' || wordCount < 1)) {
        return res.status(400).json({ error: '単語数は1以上の整数、配列、または最短を指定してください。' });
    }
    if (Array.isArray(requiredChars) && requiredChars.length === 0) {
        requiredChars = null;
    }

    let results = [];
    let isShortestPath = wordCount === 'shortest';

    if (outputType === 'firstCharCount') {
        const counts = findFirstCharCounts(map, firstChar, lastChar, wordCount, requiredChars);
        res.json({ firstCharCounts: counts });
    } else if (outputType === 'lastCharCount') {
        const counts = findLastCharCounts(map, firstChar, lastChar, wordCount, requiredChars);
        res.json({ lastCharCounts: counts });
    } else { // outputType === 'path'
        // キャッシュヒットの確認
        if (typeof wordCount === 'number' && wordCount >= 2 && wordCount <= 4 && !firstChar && !lastChar && !requiredChars && cache && cache[wordCount]) {
            // キャッシュが利用可能な場合は、キャッシュから結果を返す
            results = cache[wordCount];
        } else if (isShortestPath) {
            results = findShortestShiritoriAStar(map, firstChar, lastChar, requiredChars);
        } else if (Array.isArray(wordCount)) {
            results = findWordCountShiritoriAStar(map, wordCount, requiredChars);
        } else {
            // キャッシュ条件を満たさない場合は全通り探索
            results = findShiritoriCombinations(map, firstChar, lastChar, wordCount, requiredChars);
        }
        res.json({ results });
    }
});

app.post('/api/wildcard_search', (req, res) => {
    const { listName, searchText } = req.body;
    const words = wordLists[listName];
    if (!words) {
        return res.status(400).json({ error: '無効な単語リストです。' });
    }
    
    const regexPattern = `^${searchText.replace(/？/g, '.')}$`;
    let regex;
    try {
        regex = new RegExp(regexPattern);
    } catch (e) {
        return res.status(400).json({ error: '無効な検索文字列です。' });
    }

    const matches = words.filter(word => regex.test(word));
    const collator = new Intl.Collator('ja', { sensitivity: 'base' });
    matches.sort(collator.compare);
    res.json({ wildcardMatches: matches });
});

app.post('/api/substring_search', (req, res) => {
    const { listName, searchText } = req.body;
    const words = wordLists[listName];
    const tree = suffixTrees[listName];

    if (!words || !tree) {
        return res.status(400).json({ error: '無効な単語リストです。' });
    }
    if (!searchText) {
        return res.status(400).json({ error: '検索文字列を入力してください。' });
    }
    
    const collator = new Intl.Collator('ja', { sensitivity: 'base' });
    const indices = searchSuffixTree(tree, searchText);
    const matches = indices.map(index => words[index]);
    
    matches.sort(collator.compare);
    res.json({ substringMatches: matches });
});

app.post('/api/word_count_shiritori', (req, res) => {
    let { listName, wordCount, requiredChars } = req.body;
    const map = wordMap[listName];

    if (!map) {
        return res.status(400).json({ error: '無効な単語リストです。' });
    }
    if (!Array.isArray(wordCount) || wordCount.some(wc => typeof wc !== 'number' || wc < 1)) {
        return res.status(400).json({ error: '単語数は1以上の整数の配列で指定してください。' });
    }
    if (Array.isArray(requiredChars) && requiredChars.length === 0) {
        requiredChars = null;
    }

    try {
        const results = findWordCountShiritoriAStar(map, wordCount, requiredChars);
        res.json({ results });
    } catch (error) {
        console.error('文字数指定しりとり検索でエラー:', error);
        res.status(500).json({ error: 'サーバー側でエラーが発生しました。' });
    }
});

// 💡 ワイルドカード指定しりとり検索用の新しいエンドポイント
app.post('/api/wildcard_shiritori', (req, res) => {
    let { listName, firstWordPattern, lastWordPattern, wordCount, requiredChars } = req.body;
    const map = wordMap[listName];

    if (!map) {
        return res.status(400).json({ error: '無効な単語リストです。' });
    }
    if (typeof wordCount !== 'number' || wordCount < 1) {
        return res.status(400).json({ error: '単語数は1以上の整数で指定してください。' });
    }
    if (!firstWordPattern || firstWordPattern.trim() === '') {
        return res.status(400).json({ error: '最初の単語のパターン（ワイルドカード可）を指定してください。' });
    }
    
    // nullまたは空文字列をnullに変換
    if (lastWordPattern === null || lastWordPattern.trim() === '') {
        lastWordPattern = null;
    }
    if (Array.isArray(requiredChars) && requiredChars.length === 0) {
        requiredChars = null;
    }

    try {
        const results = findWildcardShiritoriCombinations(map, firstWordPattern, lastWordPattern, wordCount, requiredChars);
        res.json({ results });
    } catch (error) {
        console.error('ワイルドカード指定しりとり検索でエラー:', error);
        res.status(500).json({ error: 'サーバー側でエラーが発生しました。' });
    }
});

app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});