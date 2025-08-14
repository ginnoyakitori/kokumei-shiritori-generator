// 既存のserver.jsのコードを修正
const express = require('express');
const functions = require('firebase-functions');
const path = require('path');
const fs = require('fs');
const app = express();

// JSON形式のリクエストボディを解析するミドルウェア
app.use(express.json());

// 静的ファイルの配信設定
app.use(express.static(path.join(__dirname, '')));

const wordLists = {};

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

        console.log('単語リストを読み込みました。');
    } catch (error) {
        console.error('ファイルの読み込み中にエラーが発生しました:', error);
    }
};

loadWordLists();

app.post('/api/shiritori', (req, res) => {
    let { listName, firstChar, lastChar, wordCount } = req.body;
    const words = wordLists[listName];

    if (!words) {
        return res.status(400).json({ error: '無効な単語リストです。' });
    }
    if (firstChar !== null && firstChar.length !== 1) {
        return res.status(400).json({ error: '最初の文字は1文字で入力するか、指定しないでください。' });
    }
    if (lastChar !== null && lastChar.length !== 1) {
        return res.status(400).json({ error: '最後の文字は1文字で入力するか、指定しないでください。' });
    }
    if (wordCount !== 'shortest' && (typeof wordCount !== 'number' || wordCount < 1)) {
        return res.status(400).json({ error: '単語数は1以上の整数か、最短を指定してください。' });
    }

    if (firstChar === null || lastChar === null) {
        const allResults = findAllPossibleShiritori(words, wordCount, firstChar, lastChar);
        const totalCount = Object.values(allResults).reduce((sum, current) => sum + current, 0);
        res.json({ totalCount, charCounts: allResults });
    } else {
        let results = [];
        if (wordCount === 'shortest') {
            results = findShortestShiritori(words, firstChar, lastChar);
        } else {
            results = findShiritoriCombinations(words, firstChar, lastChar, wordCount);
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
    
    const regexPattern = `^${searchText.replace(/○/g, '.')}$`;
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

    if (!words) {
        return res.status(400).json({ error: '無効な単語リストです。' });
    }
    if (!searchText) {
        return res.status(400).json({ error: '検索文字列を入力してください。' });
    }

    const collator = new Intl.Collator('ja', { sensitivity: 'base' });
    const matches = words.filter(word => word.includes(searchText));
    matches.sort(collator.compare);
    
    res.json({ substringMatches: matches });
});

// 新しいAPIエンドポイント
app.post('/api/word_count_shiritori', (req, res) => {
    const { listName, wordCounts } = req.body;
    const words = wordLists[listName];

    if (!words) {
        return res.status(400).json({ error: '無効な単語リストです。' });
    }

    if (!Array.isArray(wordCounts) || wordCounts.some(wc => typeof wc !== 'number' || wc < 1)) {
        return res.status(400).json({ error: '単語数は1以上の整数で指定してください。' });
    }

    const results = findWordCountShiritori(words, wordCounts);
    res.json({ results });
});

/**
 * 指定された文字数でしりとりを探索する関数
 */
function findWordCountShiritori(words, wordCounts) {
    const allResults = [];
    const collator = new Intl.Collator('ja', { sensitivity: 'base' });
    const sortedWords = [...words].sort(collator.compare);

    const backtrack = (path, usedWords, index) => {
        if (index === wordCounts.length) {
            allResults.push([...path]);
            return;
        }

        const lastCharOfPrevious = index === 0 ? '' : getShiritoriLastChar(path[index - 1]);
        const targetWordCount = wordCounts[index];

        for (const word of sortedWords) {
            const normalizedWord = normalizeWord(word);
            // 最初の単語の条件は無視し、2番目以降の単語でしりとりルールを適用
            const isStartConditionMet = index === 0 ? true : normalizedWord.startsWith(lastCharOfPrevious);
            
            // 文字数と使用済み単語のチェック
            if (!usedWords.has(word) && normalizedWord.length === targetWordCount && isStartConditionMet) {
                path.push(word);
                usedWords.add(word);
                backtrack(path, usedWords, index + 1);
                usedWords.delete(word);
                path.pop();
            }
        }
    };

    backtrack([], new Set(), 0);
    allResults.sort((a, b) => collator.compare(a.join(''), b.join('')));
    
    return allResults;
}


// ... (findAllPossibleShiritori, backtrackAllAndCount, findShiritoriCombinations, findShortestShiritori, normalizeWord, getShiritoriLastChar は変更なし)
function findAllPossibleShiritori(words, wordCount, firstChar, lastChar) {
    const charCounts = {};
    const collator = new Intl.Collator('ja', { sensitivity: 'base' });
    const sortedWords = [...words].sort(collator.compare);
    
    if (wordCount === 'shortest') {
        return {};
    }

    const startingWords = firstChar === null ? sortedWords : sortedWords.filter(word => normalizeWord(word).startsWith(firstChar));

    for (const startWord of startingWords) {
        const path = [startWord];
        const usedWords = new Set([startWord]);
        backtrackAllAndCount(path, usedWords, wordCount, charCounts, sortedWords, firstChar, lastChar);
    }
    
    const sortedKeys = Object.keys(charCounts).sort(collator.compare);
    const sortedCharCounts = {};
    for (const key of sortedKeys) {
        sortedCharCounts[key] = charCounts[key];
    }
    return sortedCharCounts;
}

function backtrackAllAndCount(path, usedWords, wordCount, charCounts, sortedWords, firstChar, lastChar) {
    if (typeof wordCount === 'number' && path.length === wordCount) {
        if (lastChar === null || getShiritoriLastChar(path[path.length - 1]) === lastChar) {
            const key = lastChar === null ? getShiritoriLastChar(path[path.length - 1]) : normalizeWord(path[0]).slice(0, 1);
            charCounts[key] = (charCounts[key] || 0) + 1;
        }
        return;
    }

    const lastCharOfCurrent = getShiritoriLastChar(path[path.length - 1]);

    for (const word of sortedWords) {
        const normalizedWord = normalizeWord(word);
        if (!usedWords.has(word) && normalizedWord.startsWith(lastCharOfCurrent)) {
            path.push(word);
            usedWords.add(word);
            backtrackAllAndCount(path, usedWords, wordCount, charCounts, sortedWords, firstChar, lastChar);
            usedWords.delete(word);
            path.pop();
        }
    }
}

function findShiritoriCombinations(words, firstChar, lastChar, wordCount) {
    const allResults = [];
    
    const collator = new Intl.Collator('ja', { sensitivity: 'base' });
    const sortedWords = [...words].sort(collator.compare);

    const backtrack = (path, usedWords) => {
        if (path.length === wordCount) {
            if (getShiritoriLastChar(path[path.length - 1]) === lastChar) {
                allResults.push([...path]);
            }
            return;
        }

        const lastCharOfCurrent = path.length === 0 ? firstChar : getShiritoriLastChar(path[path.length - 1]);

        for (const word of sortedWords) {
            const normalizedWord = normalizeWord(word);
            if (!usedWords.has(word) && normalizedWord.startsWith(lastCharOfCurrent)) {
                path.push(word);
                usedWords.add(word);
                backtrack(path, usedWords);
                usedWords.delete(word);
                path.pop();
            }
        }
    };

    backtrack([], new Set());
    allResults.sort((a, b) => collator.compare(a.join(''), b.join('')));
    
    return allResults;
}

function findShortestShiritori(words, firstChar, lastChar) {
    const collator = new Intl.Collator('ja', { sensitivity: 'base' });
    const sortedWords = [...words].sort(collator.compare);
    
    const queue = [[{ word: firstChar, path: [firstChar] }]];
    const allResults = [];
    const visited = new Set();
    let minLength = Infinity;

    while (queue.length > 0) {
        const level = queue.shift();
        const nextLevel = [];
        
        for (const { word, path } of level) {
            if (path.length > minLength) {
                return allResults.sort((a, b) => collator.compare(a.join(''), b.join('')));
            }

            if (path.length > 1 && getShiritoriLastChar(word) === lastChar) {
                if (path.length < minLength) {
                    minLength = path.length;
                    allResults.length = 0;
                }
                allResults.push(path.slice(1));
                continue;
            }

            const nextChar = getShiritoriLastChar(word);
            for (const nextWord of sortedWords) {
                if (!visited.has(nextWord) && normalizeWord(nextWord).startsWith(nextChar)) {
                    visited.add(nextWord);
                    nextLevel.push({ word: nextWord, path: [...path, nextWord] });
                }
            }
        }
        if (nextLevel.length > 0) {
            queue.push(nextLevel);
        }
    }
    return allResults.sort((a, b) => collator.compare(a.join(''), b.join('')));
}

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

const port = process.env.PORT || 3000;

app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});
exports.app = functions.https.onRequest(app);