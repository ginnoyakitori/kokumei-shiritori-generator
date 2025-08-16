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
    } catch (error) {
        console.error('ファイルの読み込み中にエラーが発生しました:', error);
    }
};

loadWordLists();

app.post('/api/shiritori', (req, res) => {
    let { listName, firstChar, lastChar, wordCount, requiredChars, outputType } = req.body;
    const words = wordLists[listName];
    const map = wordMap[listName];

    if (!words || !map) {
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

    if (Array.isArray(requiredChars) && requiredChars.length === 0) {
        requiredChars = null;
    }

    if (outputType === 'firstCharCount') {
        const counts = findFirstCharCounts(map, firstChar, lastChar, wordCount, requiredChars);
        res.json({ firstCharCounts: counts });
    } else if (outputType === 'lastCharCount') {
        const counts = findLastCharCounts(map, firstChar, lastChar, wordCount, requiredChars);
        res.json({ lastCharCounts: counts });
    } else { // outputType === 'path'
        let results = [];
        if (requiredChars) {
            if (wordCount === 'shortest') {
                results = findShortestShiritoriWithIncludeChars(map, firstChar, lastChar, requiredChars);
            } else {
                results = findShiritoriCombinationsWithIncludeChars(map, firstChar, lastChar, wordCount, requiredChars);
            }
        } else {
            if (wordCount === 'shortest') {
                results = findShortestShiritori(map, firstChar, lastChar, requiredChars);
            } else {
                results = findShiritoriCombinations(map, firstChar, lastChar, wordCount, requiredChars);
            }
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
    const { listName, wordCounts } = req.body;
    const words = wordLists[listName];
    const map = wordMap[listName];

    if (!words || !map) {
        return res.status(400).json({ error: '無効な単語リストです。' });
    }

    if (!Array.isArray(wordCounts) || wordCounts.some(wc => typeof wc !== 'number' || wc < 1)) {
        return res.status(400).json({ error: '単語数は1以上の整数で指定してください。' });
    }

    const results = findWordCountShiritori(map, wordCounts);
    res.json({ results });
});

function findShiritoriCombinations(wordMap, firstChar, lastChar, wordCount, requiredChars) {
    const allResults = [];
    const queue = [];
    const collator = new Intl.Collator('ja', { sensitivity: 'base' });

    const checkRequiredChars = (path, requiredChars) => {
        if (!requiredChars) return true;
        const charCounts = path.join('').split('').reduce((acc, char) => {
            acc[char] = (acc[char] || 0) + 1;
            return acc;
        }, {});
        const requiredCharCounts = requiredChars.reduce((acc, char) => {
            acc[char] = (acc[char] || 0) + 1;
            return acc;
        }, {});
        return Object.keys(requiredCharCounts).every(char => charCounts[char] && charCounts[char] >= requiredCharCounts[char]);
    };

    const startingWords = wordMap[firstChar] || [];
    for (const word of startingWords) {
        queue.push({ path: [word], usedWords: new Set([word]) });
    }

    while (queue.length > 0) {
        const { path, usedWords } = queue.shift();
        
        if (path.length === wordCount) {
            if (getShiritoriLastChar(path[path.length - 1]) === lastChar && checkRequiredChars(path, requiredChars)) {
                allResults.push([...path]);
            }
            continue;
        }

        const lastCharOfCurrent = getShiritoriLastChar(path[path.length - 1]);
        const nextWords = wordMap[lastCharOfCurrent] || [];

        for (const word of nextWords) {
            if (!usedWords.has(word)) {
                const newUsedWords = new Set(usedWords);
                newUsedWords.add(word);
                queue.push({ path: [...path, word], usedWords: newUsedWords });
            }
        }
    }
    return allResults.sort((a, b) => collator.compare(a.join(''), b.join('')));
}

function findShortestShiritori(wordMap, firstChar, lastChar, requiredChars) {
    const allResults = [];
    const queue = [];
    const visited = new Set();
    let minLength = Infinity;
    const collator = new Intl.Collator('ja', { sensitivity: 'base' });
    
    const checkRequiredChars = (path, requiredChars) => {
        if (!requiredChars) return true;
        const charCounts = path.join('').split('').reduce((acc, char) => {
            acc[char] = (acc[char] || 0) + 1;
            return acc;
        }, {});
        const requiredCharCounts = requiredChars.reduce((acc, char) => {
            acc[char] = (acc[char] || 0) + 1;
            return acc;
        }, {});
        return Object.keys(requiredCharCounts).every(char => charCounts[char] && charCounts[char] >= requiredCharCounts[char]);
    };

    const startingWords = wordMap[firstChar] || [];
    for (const word of startingWords) {
        queue.push({ path: [word] });
        visited.add(word);
    }
    
    while (queue.length > 0) {
        const { path } = queue.shift();
        const lastWord = path[path.length - 1];

        if (path.length > minLength) continue;

        const isEndConditionMet = lastChar === null || getShiritoriLastChar(lastWord) === lastChar;
        if (isEndConditionMet && checkRequiredChars(path, requiredChars)) {
            if (path.length < minLength) {
                minLength = path.length;
                allResults.length = 0;
            }
            allResults.push(path);
        }

        const nextChar = getShiritoriLastChar(lastWord);
        const nextWords = wordMap[nextChar] || [];

        for (const nextWord of nextWords) {
            if (!visited.has(nextWord)) {
                visited.add(nextWord);
                queue.push({ path: [...path, nextWord] });
            }
        }
    }
    
    return allResults.sort((a, b) => collator.compare(a.join(''), b.join('')));
}

function findShiritoriCombinationsWithIncludeChars(wordMap, firstChar, lastChar, wordCount, requiredChars) {
    const allResults = [];
    const queue = [];
    const collator = new Intl.Collator('ja', { sensitivity: 'base' });

    const checkRequiredChars = (path, requiredChars) => {
        if (!requiredChars) return true;
        const charCounts = path.join('').split('').reduce((acc, char) => {
            acc[char] = (acc[char] || 0) + 1;
            return acc;
        }, {});
        const requiredCharCounts = requiredChars.reduce((acc, char) => {
            acc[char] = (acc[char] || 0) + 1;
            return acc;
        }, {});
        return Object.keys(requiredCharCounts).every(char => charCounts[char] && charCounts[char] >= requiredCharCounts[char]);
    };

    const startingWords = firstChar ? (wordMap[firstChar] || []) : Object.values(wordMap).flat();
    for (const word of startingWords) {
        queue.push({ path: [word], usedWords: new Set([word]) });
    }

    while (queue.length > 0) {
        const { path, usedWords } = queue.shift();
        
        if (path.length === wordCount) {
            const isLastCharMet = lastChar === null || getShiritoriLastChar(path[path.length - 1]) === lastChar;
            if (isLastCharMet && checkRequiredChars(path, requiredChars)) {
                allResults.push([...path]);
            }
            continue;
        }

        const lastCharOfCurrent = getShiritoriLastChar(path[path.length - 1]);
        const nextWords = wordMap[lastCharOfCurrent] || [];

        for (const word of nextWords) {
            if (!usedWords.has(word)) {
                const newUsedWords = new Set(usedWords);
                newUsedWords.add(word);
                queue.push({ path: [...path, word], usedWords: newUsedWords });
            }
        }
    }
    return allResults.sort((a, b) => collator.compare(a.join(''), b.join('')));
}

function findShortestShiritoriWithIncludeChars(wordMap, firstChar, lastChar, requiredChars) {
    const allResults = [];
    const queue = [];
    const visited = new Set();
    let minLength = Infinity;
    const collator = new Intl.Collator('ja', { sensitivity: 'base' });

    const checkRequiredChars = (path, requiredChars) => {
        if (!requiredChars) return true;
        const charCounts = path.join('').split('').reduce((acc, char) => {
            acc[char] = (acc[char] || 0) + 1;
            return acc;
        }, {});
        const requiredCharCounts = requiredChars.reduce((acc, char) => {
            acc[char] = (acc[char] || 0) + 1;
            return acc;
        }, {});
        return Object.keys(requiredCharCounts).every(char => charCounts[char] && charCounts[char] >= requiredCharCounts[char]);
    };

    const startingWords = firstChar ? (wordMap[firstChar] || []) : Object.values(wordMap).flat();
    for (const word of startingWords) {
        queue.push({ path: [word] });
        visited.add(word);
    }
    
    while (queue.length > 0) {
        const { path } = queue.shift();
        const lastWord = path[path.length - 1];

        if (path.length > minLength) continue;

        const isEndConditionMet = lastChar === null || getShiritoriLastChar(lastWord) === lastChar;
        if (isEndConditionMet && checkRequiredChars(path, requiredChars)) {
            if (path.length < minLength) {
                minLength = path.length;
                allResults.length = 0;
            }
            allResults.push(path);
        }

        const nextChar = getShiritoriLastChar(lastWord);
        const nextWords = wordMap[nextChar] || [];

        for (const nextWord of nextWords) {
            if (!visited.has(nextWord)) {
                visited.add(nextWord);
                queue.push({ path: [...path, nextWord] });
            }
        }
    }
    
    return allResults.filter(path => path.length === minLength).sort((a, b) => collator.compare(a.join(''), b.join('')));
}

function findWordCountShiritori(wordMap, wordCounts) {
    const allResults = [];
    const queue = [];
    const collator = new Intl.Collator('ja', { sensitivity: 'base' });

    const startingWords = Object.values(wordMap).flat().filter(word => normalizeWord(word).length === wordCounts[0]);
    for (const word of startingWords) {
        queue.push({ path: [word], usedWords: new Set([word]) });
    }

    while (queue.length > 0) {
        const { path, usedWords } = queue.shift();
        const currentIndex = path.length;
        
        if (currentIndex === wordCounts.length) {
            allResults.push(path);
            continue;
        }

        const lastCharOfCurrent = getShiritoriLastChar(path[currentIndex - 1]);
        const nextWords = wordMap[lastCharOfCurrent] || [];
        const targetLength = wordCounts[currentIndex];

        for (const word of nextWords) {
            if (!usedWords.has(word) && normalizeWord(word).length === targetLength) {
                const newUsedWords = new Set(usedWords);
                newUsedWords.add(word);
                queue.push({ path: [...path, word], usedWords: newUsedWords });
            }
        }
    }
    return allResults.sort((a, b) => collator.compare(a.join(''), b.join('')));
}

function findFirstCharCounts(wordMap, firstChar, lastChar, wordCount, requiredChars) {
    const counts = {};
    
    const checkRequiredChars = (path, requiredChars) => {
        if (!requiredChars) return true;
        const charCounts = path.join('').split('').reduce((acc, char) => {
            acc[char] = (acc[char] || 0) + 1;
            return acc;
        }, {});
        const requiredCharCounts = requiredChars.reduce((acc, char) => {
            acc[char] = (acc[char] || 0) + 1;
            return acc;
        }, {});
        return Object.keys(requiredCharCounts).every(char => charCounts[char] && charCounts[char] >= requiredCharCounts[char]);
    };
    
    const backtrack = (path, usedWords) => {
        if (path.length === wordCount) {
            if (getShiritoriLastChar(path[path.length - 1]) === lastChar && checkRequiredChars(path, requiredChars)) {
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
    };
    
    const startWords = firstChar ? wordMap[firstChar] || [] : Object.values(wordMap).flat();
    for (const word of startWords) {
        if (firstChar && normalizeWord(word)[0] !== firstChar) continue;
        backtrack([word], new Set([word]));
    }
    
    return counts;
}

function findLastCharCounts(wordMap, firstChar, lastChar, wordCount, requiredChars) {
    const counts = {};
    
    const checkRequiredChars = (path, requiredChars) => {
        if (!requiredChars) return true;
        const charCounts = path.join('').split('').reduce((acc, char) => {
            acc[char] = (acc[char] || 0) + 1;
            return acc;
        }, {});
        const requiredCharCounts = requiredChars.reduce((acc, char) => {
            acc[char] = (acc[char] || 0) + 1;
            return acc;
        }, {});
        return Object.keys(requiredCharCounts).every(char => charCounts[char] && charCounts[char] >= requiredCharCounts[char]);
    };
    
    const backtrack = (path, usedWords) => {
        if (path.length === wordCount) {
            const endChar = getShiritoriLastChar(path[path.length - 1]);
            if (lastChar === null || endChar === lastChar) {
                if (checkRequiredChars(path, requiredChars)) {
                    counts[endChar] = (counts[endChar] || 0) + 1;
                }
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
    };
    
    const startWords = firstChar ? wordMap[firstChar] || [] : Object.values(wordMap).flat();
    for (const word of startWords) {
        if (firstChar && normalizeWord(word)[0] !== firstChar) continue;
        backtrack([word], new Set([word]));
    }
    
    return counts;
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

app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
});