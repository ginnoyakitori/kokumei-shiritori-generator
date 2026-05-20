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
            const allWords = Object.values(map).flat();
            const uniqueFirstChars = [...new Set(allWords.map(normalizeWord))];
            
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

                // 範囲内か確認
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
                return res.json({
                    results: [],
                    conditions: resultConditions,
                    message: `開始文字を「自動」で設定した場合、${minSolutions}個以上${maxSolutions}個以下の条件が見つかりませんでした。`
                });
            }
        } else {
            resultConditions.firstChar = fixedFirstChar || '（指定なし）';
        }

        // === ステップ2：終了文字が「自動」の場合、最適な終了文字を見つける ===
        if (lastCharMode === 'auto') {
            const allWords = Object.values(map).flat();
            const uniqueLastChars = [...new Set(allWords.map(getShiritoriLastChar))];
            
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

                // 範囲内か確認
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
                return res.json({
                    results: [],
                    conditions: resultConditions,
                    message: `終了文字を「自動」で設定した場合、${minSolutions}個以上${maxSolutions}個以下の条件が見つかりませんでした。`
                });
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
                const totalLen = path.join('').length;
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
                fixedTotalLength = finalResults[0].join('').length;
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
            return res.json({
                results: [],
                conditions: resultConditions,
                message: `解の個数が範囲外です。最小${minSolutions}個必要ですが、${finalResults.length}個しか見つかりませんでした。`
            });
        }

        // 上限を超えた場合はカット
        if (finalResults.length > maxSolutions) {
            finalResults = finalResults.slice(0, maxSolutions);
        }

        const elapsed = Date.now() - startTime;
        console.log(`Auto generate completed in ${elapsed}ms (${finalResults.length} results)`);

        return res.json({
            results: finalResults,
            conditions: resultConditions
        });
    } catch (e) {
        console.error("Error in auto generate:", e);
        return res.status(500).json({ error: 'サーバー内部でエラーが発生しました。' });
    }
});
