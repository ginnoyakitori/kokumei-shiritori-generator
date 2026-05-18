/**
 * 自動生成モード
 * 解の個数範囲（最小～最大）を指定し、各条件のモード（設定しない/設定する/自動で設定）に応じて
 * しりとりの条件を自動調整
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

    const startTime = Date.now();

    try {
        // 記録用の条件情報
        const resultConditions = {};
        
        // === 条件の処理 ===
        let fixedFirstChar = null;
        let fixedLastChar = null;
        let fixedWordCount = null;
        let fixedIncludeChars = null;
        let fixedExcludeChars = null;
        let fixedTotalLength = null;

        // 開始文字
        if (firstCharMode === 'fixed' && firstChar) {
            fixedFirstChar = firstChar.trim();
            resultConditions.firstChar = fixedFirstChar;
        } else if (firstCharMode !== 'none') {
            resultConditions.firstChar = '（自動調整）';
        }

        // 終了文字
        if (lastCharMode === 'fixed' && lastChar) {
            fixedLastChar = lastChar.trim();
            resultConditions.lastChar = fixedLastChar;
        } else if (lastCharMode !== 'none') {
            resultConditions.lastChar = '（自動調整）';
        }

        // 単語数
        if (wordCountMode === 'fixed' && wordCount) {
            fixedWordCount = parseInt(wordCount, 10);
            if (fixedWordCount < 1) {
                return res.status(400).json({ error: '単語数は1以上である必要があります。' });
            }
            resultConditions.wordCount = fixedWordCount;
        } else if (wordCountMode !== 'none') {
            resultConditions.wordCount = '（自動調整）';
        }

        // 含める文字
        if (includeCharsMode === 'fixed' && includeChars && includeChars.length > 0) {
            fixedIncludeChars = includeChars;
            resultConditions.includeChars = includeChars.join(',');
        } else if (includeCharsMode !== 'none') {
            resultConditions.includeChars = '（自動調整）';
        }

        // 除外する文字
        if (excludeCharsMode === 'fixed' && excludeChars && excludeChars.length > 0) {
            fixedExcludeChars = excludeChars;
            resultConditions.excludeChars = excludeChars.join(',');
        } else if (excludeCharsMode !== 'none') {
            resultConditions.excludeChars = '（自動調整）';
        }

        // 合計文字数
        if (totalLengthMode === 'fixed' && totalLength) {
            fixedTotalLength = parseInt(totalLength, 10);
            if (fixedTotalLength < 1) {
                return res.status(400).json({ error: '合計文字数は1以上である必要があります。' });
            }
            resultConditions.totalLength = fixedTotalLength;
        } else if (totalLengthMode !== 'none') {
            resultConditions.totalLength = '（自動調整）';
        }

        resultConditions.uniqueWordLengths = uniqueWordLengths ? 'あり' : 'なし';

        let finalResults = [];

        // === wordCountMode が 'none' の場合：複数の単語数を試す ===
        if (wordCountMode === 'none' || !fixedWordCount) {
            for (let tryWordCount = 2; tryWordCount <= 6; tryWordCount++) {
                if (finalResults.length >= maxSolutions) break;

                let candidateResults = findShiritoriCombinations(
                    map,
                    fixedFirstChar,
                    fixedLastChar,
                    tryWordCount,
                    fixedIncludeChars,
                    fixedExcludeChars,
                    false,
                    false,
                    'atLeast',
                    listName
                );

                // フィルタリング
                if (uniqueWordLengths) {
                    candidateResults = filterUniqueWordLengths(candidateResults);
                }

                if (fixedTotalLength) {
                    candidateResults = filterByTotalLength(candidateResults, fixedTotalLength);
                }

                // 合計文字数で自動調整する場合
                if (totalLengthMode === 'auto' && candidateResults.length > 0) {
                    const byLength = {};
                    candidateResults.forEach(path => {
                        const totalLen = path.join('').length;
                        if (!byLength[totalLen]) byLength[totalLen] = [];
                        byLength[totalLen].push(path);
                    });
                    const sortedLengths = Object.keys(byLength).map(Number).sort((a, b) => a - b);
                    for (const len of sortedLengths) {
                        if (finalResults.length >= maxSolutions) break;
                        const remaining = maxSolutions - finalResults.length;
                        finalResults.push(...byLength[len].slice(0, remaining));
                    }
                    if (finalResults.length > 0 && !fixedTotalLength) {
                        resultConditions.totalLength = finalResults[0].join('').length;
                    }
                } else {
                    finalResults.push(...candidateResults.slice(0, maxSolutions - finalResults.length));
                }
            }
        } else {
            // === wordCountMode が 'fixed' の場合 ===
            let baseResults = findShiritoriCombinations(
                map,
                fixedFirstChar,
                fixedLastChar,
                fixedWordCount,
                fixedIncludeChars,
                fixedExcludeChars,
                false,
                false,
                'atLeast',
                listName
            );

            // フィルタリング
            if (uniqueWordLengths) {
                baseResults = filterUniqueWordLengths(baseResults);
            }

            // 開始文字を自動調整する場合
            if (firstCharMode === 'auto' && baseResults.length > 0 && baseResults.length < minSolutions) {
                baseResults = [];
                const allWords = Object.values(map).flat();
                const uniqueFirstChars = [...new Set(allWords.map(normalizeWord))];
                
                for (const tryFirstChar of uniqueFirstChars) {
                    if (baseResults.length >= maxSolutions) break;
                    let candidateResults = findShiritoriCombinations(
                        map,
                        tryFirstChar,
                        fixedLastChar,
                        fixedWordCount,
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
                    baseResults.push(...candidateResults.slice(0, maxSolutions - baseResults.length));
                }
                if (baseResults.length > 0 && !fixedFirstChar) {
                    resultConditions.firstChar = normalizeWord(baseResults[0][0]);
                }
            }

            // 終了文字を自動調整する場合
            if (lastCharMode === 'auto' && baseResults.length > 0 && baseResults.length < minSolutions) {
                baseResults = [];
                const allWords = Object.values(map).flat();
                const uniqueLastChars = [...new Set(allWords.map(getShiritoriLastChar))];
                
                for (const tryLastChar of uniqueLastChars) {
                    if (baseResults.length >= maxSolutions) break;
                    let candidateResults = findShiritoriCombinations(
                        map,
                        fixedFirstChar,
                        tryLastChar,
                        fixedWordCount,
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
                    baseResults.push(...candidateResults.slice(0, maxSolutions - baseResults.length));
                }
                if (baseResults.length > 0 && !fixedLastChar) {
                    resultConditions.lastChar = getShiritoriLastChar(baseResults[0][baseResults[0].length - 1]);
                }
            }

            // 合計文字数で自動調整する場合
            if (totalLengthMode === 'auto' && baseResults.length > maxSolutions) {
                const byLength = {};
                baseResults.forEach(path => {
                    const totalLen = path.join('').length;
                    if (!byLength[totalLen]) byLength[totalLen] = [];
                    byLength[totalLen].push(path);
                });
                const sortedLengths = Object.keys(byLength).map(Number).sort((a, b) => a - b);
                finalResults = [];
                for (const len of sortedLengths) {
                    if (finalResults.length >= maxSolutions) break;
                    const remaining = maxSolutions - finalResults.length;
                    finalResults.push(...byLength[len].slice(0, remaining));
                }
                if (finalResults.length > 0 && !fixedTotalLength) {
                    resultConditions.totalLength = finalResults[0].join('').length;
                }
            } else if (fixedTotalLength) {
                finalResults = filterByTotalLength(baseResults, fixedTotalLength);
            } else {
                finalResults = baseResults;
            }
        }

        // 範囲内に収める
        if (finalResults.length > maxSolutions) {
            finalResults = finalResults.slice(0, maxSolutions);
        }

        // 最小値未満の場合はメッセージを返す
        if (finalResults.length < minSolutions) {
            return res.json({
                results: finalResults,
                conditions: resultConditions,
                warning: `${minSolutions}個以上${maxSolutions}個以下の条件が見つかりませんでした。${finalResults.length}個の結果を返します。`
            });
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
