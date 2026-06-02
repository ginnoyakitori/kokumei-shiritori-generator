const express = require("express");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname)));

const WORD_FILES = {
  countries: "countries.txt",
  capitals: "capitals.txt",
  pokemon: "pokemon.txt"
};

const DIRECTIONS = [
  [1, 0],    // →
  [-1, 0],   // ←
  [0, 1],    // ↓
  [0, -1],   // ↑
  [1, 1],    // ↘
  [-1, -1],  // ↖
  [1, -1],   // ↗
  [-1, 1]    // ↙
];

// 単語の正規化（英字化・大文字化・記号削除）
// 例: "New-Zealand" -> "NEWZEALAND"
function normalizeWord(word) {
  return word
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // アクセント除去
    .replace(/[^A-Za-z]/g, "")       // 英字以外除去
    .toUpperCase();
}

function loadWords(filename) {
  const filePath = path.join(__dirname, filename);
  const raw = fs.readFileSync(filePath, "utf-8");

  const words = raw
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(Boolean)
    .map(normalizeWord)
    .filter(word => word.length > 1);

  // 重複除去
  return [...new Set(words)];
}

function createGrid(size) {
  return Array.from({ length: size }, () => Array(size).fill(""));
}

function canPlace(grid, word, x, y, dx, dy) {
  const size = grid.length;

  for (let i = 0; i < word.length; i++) {
    const nx = x + dx * i;
    const ny = y + dy * i;

    if (nx < 0 || ny < 0 || nx >= size || ny >= size) {
      return false;
    }

    const current = grid[ny][nx];
    if (current !== "" && current !== word[i]) {
      return false;
    }
  }

  return true;
}

function placeWord(grid, word, maxAttempts = 200) {
  const size = grid.length;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const [dx, dy] = DIRECTIONS[Math.floor(Math.random() * DIRECTIONS.length)];
    const x = Math.floor(Math.random() * size);
    const y = Math.floor(Math.random() * size);

    if (canPlace(grid, word, x, y, dx, dy)) {
      for (let i = 0; i < word.length; i++) {
        const nx = x + dx * i;
        const ny = y + dy * i;
        grid[ny][nx] = word[i];
      }
      return true;
    }
  }

  return false;
}

function fillGrid(grid) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < grid.length; x++) {
      if (grid[y][x] === "") {
        grid[y][x] = alphabet[Math.floor(Math.random() * alphabet.length)];
      }
    }
  }
}

function generateWordSearch(words, size) {
  const grid = createGrid(size);

  // 長い単語優先 + 長さが同じならランダム性
  const sortedWords = [...words].sort((a, b) => {
    if (b.length !== a.length) return b.length - a.length;
    return Math.random() - 0.5;
  });

  const placedWords = [];
  const notPlacedWords = [];

  for (const word of sortedWords) {
    if (word.length > size) {
      notPlacedWords.push(word);
      continue;
    }

    const placed = placeWord(grid, word, 300);
    if (placed) {
      placedWords.push(word);
    } else {
      notPlacedWords.push(word);
    }
  }

  fillGrid(grid);

  return {
    grid,
    placedWords,
    notPlacedWords,
    totalWords: sortedWords.length
  };
}

app.post("/api/generate", (req, res) => {
  try {
    const { wordType, size } = req.body;

    if (!WORD_FILES[wordType]) {
      return res.status(400).json({ error: "無効な単語リストです。" });
    }

    const numericSize = Number(size);
    if (!Number.isInteger(numericSize) || numericSize < 5 || numericSize > 30) {
      return res.status(400).json({ error: "盤面サイズは 5〜30 の整数で指定してください。" });
    }

    const words = loadWords(WORD_FILES[wordType]);
    const result = generateWordSearch(words, numericSize);

    res.json(result);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "サーバー内部エラーが発生しました。" });
  }
});

// index.html を返す
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

// ===== API: ワイルドカード単語検索 =====
app.post('/api/wildcard_search', (req, res) => {
  const paging = normalizePaging(req.body.page, req.body.perPage);

  const { listName, searchText } = req.body;
  const words = wordLists[listName];

  if (!words || !searchText) {
    return res.status(400).json({ error: '無効な入力です。' });
  }

  return cachedJson(
    res,
    'wildcard_search',
    { listName, searchText },
    paging,
    () => {
      const regex = getCachedRegex(searchText);
      const normalized = String(searchText).normalize('NFKC');

// % がある場合は文字数が固定できないので全単語から検索する
// % がない場合だけ、従来通り文字数インデックスで高速化する
      const pool =
        normalized.length && !hasMultiWildcard(normalized)
          ? (wordsByLength[listName]?.[normalized.length] || [])
          : words;

      return {
        results: pool.filter(word => regex.test(word))
      };
    }
  );
});

// ===== API: 部分一致検索 =====
app.post('/api/substring_search', (req, res) => {
  const paging = normalizePaging(req.body.page, req.body.perPage);

  const { listName, searchText } = req.body;
  const words = wordLists[listName];

  if (!words || !searchText) {
    return res.status(400).json({ error: '無効な入力です。' });
  }

  return cachedJson(
    res,
    'substring_search',
    { listName, searchText },
    paging,
    () => ({
      results: words.filter(word => word.includes(searchText))
    })
  );
});

// ===== API: ワイルドカードしりとり =====
app.post('/api/wildcard_shiritori', (req, res) => {
  const paging = normalizePaging(req.body.page, req.body.perPage);

  let {
    listName,
    wordPatterns,
    firstWordPattern,
    lastWordPattern,
    wordCount,
    requiredChars,
    requiredCharMode,
    totalLength,
    advancedConditions
  } = req.body;

  const map = wordMap[listName];

  if (!map) {
    return res.status(400).json({ error: '無効なリストです。' });
  }

  if (!wordPatterns) {
    if (Number.isNaN(Number(wordCount)) || Number(wordCount) < 1) {
      return res.status(400).json({ error: '無効な単語数です。' });
    }

    wordPatterns = new Array(Number(wordCount)).fill('');

    if (firstWordPattern) {
      wordPatterns[0] = firstWordPattern;
    }

    if (lastWordPattern) {
      wordPatterns[wordPatterns.length - 1] = lastWordPattern;
    }
  }

  if (!Array.isArray(wordPatterns) || wordPatterns.length < 1) {
    return res.status(400).json({ error: '無効な入力です。' });
  }

  requiredChars = normalizeRequiredChars(requiredChars);
  const mode = requiredCharMode === 'exactly' ? 'exactly' : 'atLeast';

  const cachePayload = {
    listName,
    wordPatterns,
    requiredChars,
    mode,
    totalLength,
    advancedConditions
  };

  return cachedJson(res, 'wildcard_shiritori', cachePayload, paging, () => {
    let results = findWildcardShiritoriCombinations(
      map,
      wordPatterns,
      requiredChars,
      mode,
      listName
    );

    results = finishResults(results, {
      totalLength,
      advancedConditions,
      listName
    });

    return { results };
  });
});

// ===== API: ループしりとり =====
app.post('/api/loop_shiritori', (req, res) => {
  const paging = normalizePaging(req.body.page, req.body.perPage);

  const {
    listName,
    pattern,
    totalLength,
    advancedConditions
  } = req.body;

  const map = wordMap[listName];

  if (!map || !pattern) {
    return res.status(400).json({
      error: 'リスト名またはパターンが指定されていません。'
    });
  }

  const cachePayload = {
    listName,
    pattern,
    totalLength,
    advancedConditions
  };

  return cachedJson(res, 'loop_shiritori', cachePayload, paging, () => {
    let results = findLoopShiritori(map, pattern, listName);

    results = finishResults(results, {
      totalLength,
      advancedConditions,
      listName
    });

    return { results };
  });
});

// ===== API: チェーンしりとり =====
app.post('/api/chain_shiritori', (req, res) => {
  const paging = normalizePaging(req.body.page, req.body.perPage);

  let {
    listName,
    pattern,
    requiredChars,
    excludeChars,
    requiredCharMode,
    advancedConditions
  } = req.body;

  const map = wordMap[listName];

  if (!map) {
    return res.status(400).json({ error: '無効な単語リストです。' });
  }

  if (!pattern || !String(pattern).trim()) {
    return res.status(400).json({ error: 'パターンは必須です。' });
  }

  requiredChars = normalizeRequiredChars(requiredChars);
  excludeChars = normalizeExcludeChars(excludeChars);

  const mode = requiredCharMode === 'exactly' ? 'exactly' : 'atLeast';

  const cachePayload = {
    listName,
    pattern,
    requiredChars,
    excludeChars,
    mode,
    advancedConditions
  };

  return cachedJson(res, 'chain_shiritori', cachePayload, paging, () => {
    let results = findChainShiritori(
      map,
      pattern,
      requiredChars,
      excludeChars,
      mode,
      listName
    );

    results = finishResults(results, {
      advancedConditions,
      listName
    });

    return { results };
  });
});

// ===== API: 自動生成 =====
app.post('/api/auto_generate', (req, res) => {
  const paging = normalizePaging(req.body.page, req.body.perPage);

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
    uniqueWordLengths,
    advancedConditions
  } = req.body;

  const map = wordMap[listName];

  if (!map) {
    return res.status(400).json({ error: '無効な単語リストです。' });
  }

  minSolutions = parseInt(minSolutions, 10) || 5;
  maxSolutions = parseInt(maxSolutions, 10) || 20;

  if (minSolutions < 1 || maxSolutions < 1 || minSolutions > maxSolutions) {
    return res.status(400).json({
      error: '解の範囲を正しく指定してください（最小 ≤ 最大）。'
    });
  }

  const fixedWordCount =
    wordCountMode === 'fixed'
      ? parseInt(wordCount, 10)
      : (parseInt(wordCount, 10) || 3);

  if (!fixedWordCount || fixedWordCount < 1) {
    return res.status(400).json({
      error: '単語数は1以上である必要があります。'
    });
  }

  const cachePayload = {
    listName,
    minSolutions,
    maxSolutions,
    firstCharMode,
    firstChar,
    lastCharMode,
    lastChar,
    wordCountMode,
    wordCount: fixedWordCount,
    includeCharsMode,
    includeChars,
    excludeCharsMode,
    excludeChars,
    totalLengthMode,
    totalLength,
    uniqueWordLengths,
    advancedConditions
  };

  return cachedJson(res, 'auto_generate', cachePayload, paging, () => {
    let fixedFirstChar =
      firstCharMode === 'fixed' ? (firstChar || null) : null;

    let fixedLastChar =
      lastCharMode === 'fixed' ? (lastChar || null) : null;

    const fixedIncludeChars =
      includeCharsMode === 'fixed'
        ? normalizeRequiredChars(includeChars)
        : null;

    const fixedExcludeChars =
      excludeCharsMode === 'fixed'
        ? normalizeExcludeChars(excludeChars)
        : null;

    const fixedTotalLength =
      totalLengthMode === 'fixed'
        ? parseInt(totalLength, 10)
        : null;

    const conditions = {};
    let finalResults = [];

    if (firstCharMode === 'auto') {
      for (const char of listIndexes[listName].firstChars) {
        let results = findShiritoriCombinations(
          map,
          char,
          fixedLastChar,
          fixedWordCount,
          fixedIncludeChars,
          fixedExcludeChars,
          false,
          false,
          'atLeast',
          listName,
          {
            totalLength: fixedTotalLength,
            uniqueWordLengths
          }
        );

        results = finishResults(results, {
          uniqueWordLengths,
          totalLength: fixedTotalLength,
          advancedConditions,
          listName
        });

        if (
          results.length >= minSolutions &&
          results.length <= maxSolutions
        ) {
          fixedFirstChar = char;
          finalResults = results;
          break;
        }
      }

      if (!fixedFirstChar) {
        return {
          results: [],
          conditions,
          message: `開始文字を「自動」で設定した場合、${minSolutions}個以上${maxSolutions}個以下の条件が見つかりませんでした。`
        };
      }
    }

    conditions.firstChar = fixedFirstChar || '（指定なし）';

    if (lastCharMode === 'auto') {
      for (const char of listIndexes[listName].lastChars) {
        let results = findShiritoriCombinations(
          map,
          fixedFirstChar,
          char,
          fixedWordCount,
          fixedIncludeChars,
          fixedExcludeChars,
          false,
          false,
          'atLeast',
          listName,
          {
            totalLength: fixedTotalLength,
            uniqueWordLengths
          }
        );

        results = finishResults(results, {
          uniqueWordLengths,
          totalLength: fixedTotalLength,
          advancedConditions,
          listName
        });

        if (
          results.length >= minSolutions &&
          results.length <= maxSolutions
        ) {
          fixedLastChar = char;
          finalResults = results;
          break;
        }
      }

      if (!fixedLastChar) {
        return {
          results: [],
          conditions,
          message: `終了文字を「自動」で設定した場合、${minSolutions}個以上${maxSolutions}個以下の条件が見つかりませんでした。`
        };
      }
    }

    conditions.lastChar = fixedLastChar || '（指定なし）';

    if (finalResults.length === 0) {
      finalResults = findShiritoriCombinations(
        map,
        fixedFirstChar,
        fixedLastChar,
        fixedWordCount,
        fixedIncludeChars,
        fixedExcludeChars,
        false,
        false,
        'atLeast',
        listName,
        {
          totalLength: fixedTotalLength,
          uniqueWordLengths
        }
      );

      finalResults = finishResults(finalResults, {
        uniqueWordLengths,
        totalLength: fixedTotalLength,
        advancedConditions,
        listName
      });
    }

    conditions.wordCount = fixedWordCount;
    conditions.includeChars =
      fixedIncludeChars ? fixedIncludeChars.join(',') : '（指定なし）';
    conditions.excludeChars =
      fixedExcludeChars ? fixedExcludeChars.join(',') : '（指定なし）';
    conditions.totalLength = fixedTotalLength || '（指定なし）';
    conditions.uniqueWordLengths = uniqueWordLengths ? 'ON' : 'OFF';

    if (totalLengthMode === 'auto' && finalResults.length > maxSolutions) {
      const byLength = Object.create(null);

      for (const path of finalResults) {
        const len = path.reduce((sum, word) => sum + word.length, 0);

        if (!byLength[len]) {
          byLength[len] = [];
        }

        byLength[len].push(path);
      }

      for (const len of Object.keys(byLength).map(Number).sort((a, b) => a - b)) {
        if (
          byLength[len].length >= minSolutions &&
          byLength[len].length <= maxSolutions
        ) {
          finalResults = byLength[len];
          conditions.totalLength = len;
          break;
        }
      }
    }

    if (finalResults.length < minSolutions) {
      return {
        results: [],
        conditions,
        message: `解の個数が範囲外です。最小${minSolutions}個必要ですが、${finalResults.length}個しか見つかりませんでした。`
      };
    }

    if (finalResults.length > maxSolutions) {
      finalResults = finalResults.slice(0, maxSolutions);
    }

    return {
      results: finalResults,
      conditions
    };
  });
});

// ===== サーバー起動 =====
app.listen(port, () => {
  console.log(`Server listening at http://localhost:${port}`);
});