document.addEventListener('DOMContentLoaded', () => {
    // --- 共通要素の取得 ---
    const modeSelect = document.getElementById('modeSelect');
    const listNameSelect = document.getElementById('listName'); // 共通リスト
    const resultsDiv = document.getElementById('results');
    const searchButtons = document.querySelectorAll('.search-btn');

    const modeSections = {
        shiritori: document.getElementById('shiritoriMode'),
        wildcardShiritori: document.getElementById('wildcardShiritoriMode'),
        wordCountShiritori: document.getElementById('wordCountShiritoriMode'),
        loop: document.getElementById('loopMode'),
        chain: document.getElementById('chainMode'),
        autoGenerate: document.getElementById('autoGenerateMode'),
        wildcard: document.getElementById('wildcardMode'),
        substring: document.getElementById('substringMode')
    };

    // ヘルパー関数: 要素が存在すれば値を、なければデフォルト値を返す
    const getVal = (id) => document.getElementById(id)?.value || '';
    const getChecked = (id) => document.getElementById(id)?.checked || false;

    // --- 1. ビュー切り替えロジック ---
    const updateModeView = () => {
        const selectedMode = modeSelect.value;
        Object.keys(modeSections).forEach(mode => {
            if (modeSections[mode]) {
                modeSections[mode].classList.toggle('active', mode === selectedMode);
            }
        });
    };
    modeSelect.addEventListener('change', updateModeView);
    updateModeView();

    // --- 2. 動的フィールド管理：？文字指定しりとり (wildcardShiritori) ---
    const wordPatternList = document.getElementById('wordPatternList');
    const addPatternBtn = document.getElementById('addPatternBtn');

    if (addPatternBtn && wordPatternList) {
        addPatternBtn.addEventListener('click', () => {
            const currentItems = wordPatternList.querySelectorAll('.pattern-item');
            const newDiv = document.createElement('div');
            newDiv.className = 'pattern-item';
            newDiv.style.marginTop = "8px";
            newDiv.innerHTML = `
                <span class="label">${currentItems.length + 1}番目:</span>
                <input type="text" class="word-pattern-input" placeholder="例: ？？ン">
                <button class="remove-pattern-btn" style="margin-left:5px;">-</button>
            `;
            wordPatternList.appendChild(newDiv);
        });

        wordPatternList.addEventListener('click', (e) => {
            if (e.target.classList.contains('remove-pattern-btn')) {
                e.target.closest('.pattern-item').remove();
                // ラベル番号の振り直し
                wordPatternList.querySelectorAll('.pattern-item').forEach((item, index) => {
                    const label = item.querySelector('.label');
                    if (label) label.textContent = `${index + 1}番目:`;
                });
            }
        });
    }

    // --- 3. 動的フィールド管理：単語数指定しりとり (wordCountShiritori) ---
    const wordCountInputsContainer = document.getElementById('wordCountInputs');
    const addWordCountInputButton = document.getElementById('addWordCountInput');

    if (addWordCountInputButton) {
        addWordCountInputButton.addEventListener('click', () => {
            const newGroup = document.createElement('div');
            newGroup.className = 'word-count-input-group';
            newGroup.innerHTML = `
                <input type="text" class="word-count-input" value="3" placeholder="例: 3,4">
                <button class="remove-word-count-input">-</button>
            `;
            wordCountInputsContainer.appendChild(newGroup);
        });

        wordCountInputsContainer.addEventListener('click', (e) => {
            if (e.target.classList.contains('remove-word-count-input')) {
                if (wordCountInputsContainer.querySelectorAll('.word-count-input-group').length > 1) {
                    e.target.closest('.word-count-input-group').remove();
                }
            }
        });
    }

    // 文字数入力の表示制御
    const wordCountTypeSelect = document.getElementById('wordCountType');
    if (wordCountTypeSelect) {
        wordCountTypeSelect.addEventListener('change', (e) => {
            const container = document.getElementById('wordCountInputContainer');
            if (container) container.style.display = (e.target.value === 'shortest') ? 'none' : 'block';
        });
    }

    // --- 4. 検索実行メインロジック ---
    searchButtons.forEach(button => {
        button.addEventListener('click', async () => {
            resultsDiv.innerHTML = '<p class="loading-message">検索中...</p>';
            const mode = modeSelect.value;
            const commonListName = listNameSelect.value; // 共通リスト名を取得
            
            let apiPath = '';
            let requestBody = {};

            try {
                if (mode === 'shiritori') {
                    apiPath = '/api/shiritori';
                    const includeStr = getVal('includeChars');
                    const totalLengthVal = getVal('shiritoriTotalLength');
                    requestBody = {
                        listName: commonListName,
                        firstChar: getVal('firstChar').trim() || null,
                        lastChar: getVal('lastChar').trim() || null,
                        wordCount: getVal('wordCountType') === 'fixed' ? parseInt(getVal('wordCount'), 10) : 'shortest',
                        requiredChars: includeStr ? includeStr.split(',').map(c => c.trim()) : null,
                        excludeChars: getVal('excludeChars').trim(),
                        outputType: document.querySelector('input[name="outputType"]:checked')?.value || 'path',
                        requiredCharMode: getChecked('requiredCharExactly') ? 'exactly' : 'atLeast',
                        uniqueWordLengths: getChecked('uniqueWordLengths'),
                        uniquePairOnly: getChecked('uniquePairOnly'),
                        totalLength: totalLengthVal ? parseInt(totalLengthVal, 10) : null
                    };
                } else if (mode === 'wildcardShiritori') {
                    apiPath = '/api/wildcard_shiritori';

                    const patterns = Array.from(document.querySelectorAll('.word-pattern-input'))
                        .map(input => input.value.trim())
                        .filter(val => val !== "");

                    const totalLengthVal = getVal('wildcardTotalLength');

                    requestBody = {
                        listName: commonListName,
                        wordPatterns: patterns,
                        requiredChars: null,
                        requiredCharMode: 'atLeast',
                        totalLength: totalLengthVal ? parseInt(totalLengthVal, 10) : null
                    };

                } else if (mode === 'wordCountShiritori') {
                    apiPath = '/api/word_count_shiritori';
                    const patterns = Array.from(document.querySelectorAll('.word-count-input'))
                                          .map(input => input.value.trim())
                                          .filter(val => val !== '')
                                          .map(val => val.split(',').map(n => parseInt(n.trim(), 10)).filter(n => !isNaN(n)));
                    const totalLengthVal = getVal('wordCountTotalLength');
                    requestBody = {
                        listName: commonListName,
                        wordCountPatterns: patterns,
                        allowPermutation: getChecked('allowWordCountPermutation'),
                        uniqueWordLengths: getChecked('uniqueWordLengthsWordCount'),
                        totalLength: totalLengthVal ? parseInt(totalLengthVal, 10) : null
                    };

                } else if (mode === 'loop') {
                    apiPath = '/api/loop_shiritori';
                    const totalLengthVal = getVal('loopTotalLength');
                    requestBody = { 
                        listName: commonListName, 
                        pattern: getVal('loopPattern').trim(),
                        totalLength: totalLengthVal ? parseInt(totalLengthVal, 10) : null
                    };

                } else if (mode === 'chain') {
                    apiPath = '/api/chain_shiritori';
                    const patternVal = getVal('chainPattern').trim();
                    const requiredStr = getVal('chainRequiredChars');
                    const excludeStr = getVal('chainExcludeChars');

                    if (!patternVal) {
                        resultsDiv.innerHTML = '<p class="error-message">エラー: パターンは必須です。</p>';
                        return;
                    }
                    
                    requestBody = {
                        listName: commonListName,
                        pattern: patternVal,
                        requiredChars: requiredStr ? requiredStr.split(',').map(c => c.trim()) : null,
                        excludeChars: excludeStr ? excludeStr.split(',').map(c => c.trim()) : null,
                        requiredCharMode: getChecked('chainRequiredCharExactly') ? 'exactly' : 'atLeast'
                    };

                } else if (mode === 'autoGenerate') {
                    apiPath = '/api/auto_generate';
                    const firstCharVal = getVal('autoFirstChar').trim() || null;
                    const lastCharVal = getVal('autoLastChar').trim() || null;
                    const wordCountVal = parseInt(getVal('autoWordCount'), 10);
                    const maxSolutionsVal = parseInt(getVal('autoMaxSolutions'), 10);
                    const searchTotalLengthVal = getChecked('autoSearchTotalLength');
                    const searchUniqueLengthsVal = getChecked('autoSearchUniqueWordLengths');

                    requestBody = {
                        listName: commonListName,
                        firstChar: firstCharVal,
                        lastChar: lastCharVal,
                        wordCount: wordCountVal,
                        maxSolutions: maxSolutionsVal,
                        searchTotalLength: searchTotalLengthVal,
                        searchUniqueWordLengths: searchUniqueLengthsVal
                    };

                } else if (mode === 'wildcard') {
                    apiPath = '/api/wildcard_search';
                    requestBody = { listName: commonListName, searchText: getVal('wildcardText').trim() };

                } else if (mode === 'substring') {
                    apiPath = '/api/substring_search';
                    requestBody = { listName: commonListName, searchText: getVal('substringText').trim() };
                }

                // APIリクエスト送信
                if (apiPath) {
                    const response = await fetch(apiPath, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(requestBody)
                    });
                    const data = await response.json();
                    displayResults(data, mode);
                }

            } catch (error) {
                console.error("Fetch error:", error);
                resultsDiv.innerHTML = '<p class="error-message">通信に失敗しました。サーバーが起動しているか確認してください。</p>';
            }
        });
    });

    // --- 5. 結果表示ロジック ---
    const displayResults = (data, mode) => {
        resultsDiv.innerHTML = '';
        if (data.error) {
            resultsDiv.innerHTML = `<p class="error-message">エラー: ${data.error}</p>`;
            return;
        }

        // 自動生成モードの結果表示
        if (mode === 'autoGenerate') {
            if (data.conditions) {
                const conditionsDiv = document.createElement('div');
                conditionsDiv.style.padding = '15px';
                conditionsDiv.style.backgroundColor = '#e3f2fd';
                conditionsDiv.style.borderRadius = '5px';
                conditionsDiv.style.marginBottom = '20px';
                conditionsDiv.style.border = '1px solid #90caf9';

                const conditionsTitle = document.createElement('p');
                conditionsTitle.style.fontWeight = 'bold';
                conditionsTitle.style.fontSize = '1.1em';
                conditionsTitle.style.marginTop = '0';
                conditionsTitle.textContent = '適用された条件:';
                conditionsDiv.appendChild(conditionsTitle);

                const conditionsList = document.createElement('ul');
                conditionsList.style.margin = '10px 0';
                Object.entries(data.conditions).forEach(([key, value]) => {
                    const li = document.createElement('li');
                    if (key === 'totalLength') {
                        li.textContent = `合計文字数: ${value}`;
                    } else if (key === 'uniqueWordLengths') {
                        li.textContent = `文字数の一意性: ${value ? 'あり' : 'なし'}`;
                    } else {
                        li.textContent = `${key}: ${value}`;
                    }
                    conditionsList.appendChild(li);
                });
                conditionsDiv.appendChild(conditionsList);

                resultsDiv.appendChild(conditionsDiv);
            }

            const results = data.results || [];
            if (results.length === 0) {
                resultsDiv.innerHTML += '<p class="placeholder">条件に合うしりとりは見つかりませんでした。</p>';
                return;
            }

            const summary = document.createElement('p');
            summary.className = 'result-summary';
            summary.textContent = `${results.length} 件の結果を表示します:`;
            resultsDiv.appendChild(summary);

            const ul = document.createElement('ul');
            ul.className = 'result-list';
            results.forEach((item, index) => {
                const li = document.createElement('li');
                li.textContent = Array.isArray(item) ? `${index + 1}. ${item.join(' → ')}` : item;
                ul.appendChild(li);
            });
            resultsDiv.appendChild(ul);
            return;
        }

        // チェーン検索の結果表示
        if (mode === 'chain') {
            if (data.conditions) {
                const conditionsDiv = document.createElement('div');
                conditionsDiv.style.padding = '15px';
                conditionsDiv.style.backgroundColor = '#f3e5f5';
                conditionsDiv.style.borderRadius = '5px';
                conditionsDiv.style.marginBottom = '20px';
                conditionsDiv.style.border = '1px solid #ce93d8';

                const conditionsTitle = document.createElement('p');
                conditionsTitle.style.fontWeight = 'bold';
                conditionsTitle.style.fontSize = '1.1em';
                conditionsTitle.style.marginTop = '0';
                conditionsTitle.textContent = '検索条件:';
                conditionsDiv.appendChild(conditionsTitle);

                const conditionsList = document.createElement('ul');
                conditionsList.style.margin = '10px 0';
                Object.entries(data.conditions).forEach(([key, value]) => {
                    const li = document.createElement('li');
                    if (key === 'pattern') {
                        li.textContent = `パターン: ${value}`;
                    } else if (key === 'requiredChars') {
                        li.textContent = `必須文字: ${value}`;
                    } else if (key === 'excludeChars') {
                        li.textContent = `除外文字: ${value}`;
                    } else if (key === 'requiredCharMode') {
                        li.textContent = `必須文字モード: ${value}`;
                    } else {
                        li.textContent = `${key}: ${value}`;
                    }
                    conditionsList.appendChild(li);
                });
                conditionsDiv.appendChild(conditionsList);

                resultsDiv.appendChild(conditionsDiv);
            }

            const results = data.results || [];
            if (results.length === 0) {
                resultsDiv.innerHTML += '<p class="placeholder">条件に合うしりとりは見つかりませんでした。</p>';
                return;
            }

            const summary = document.createElement('p');
            summary.className = 'result-summary';
            summary.textContent = `${results.length} 件の結果を表示します:`;
            resultsDiv.appendChild(summary);

            const ul = document.createElement('ul');
            ul.className = 'result-list';
            results.forEach((item, index) => {
                const li = document.createElement('li');
                li.textContent = Array.isArray(item) ? `${index + 1}. ${item.join(' → ')}` : item;
                ul.appendChild(li);
            });
            resultsDiv.appendChild(ul);
            return;
        }

        // サーバーからのレスポンス形式を統合
        const results = data.results || data.wildcardMatches || data.substringMatches || [];
        const firstCharCounts = data.firstCharCounts || {};
        const lastCharCounts = data.lastCharCounts || {};

        if (results.length === 0 && Object.keys(firstCharCounts).length === 0 && Object.keys(lastCharCounts).length === 0) {
            resultsDiv.innerHTML = '<p class="placeholder">該当する単語や経路は見つかりませんでした。</p>';
            return;
        }

        // 経路表示モード（すべて表示）
        if (results.length > 0) {
            const summary = document.createElement('p');
            summary.className = 'result-summary';
            summary.textContent = `${results.length} 件の結果を表示します:`;
            resultsDiv.appendChild(summary);

            const ul = document.createElement('ul');
            ul.className = 'result-list';
            results.forEach((item, index) => {
                const li = document.createElement('li');
                li.textContent = Array.isArray(item) ? `${index + 1}. ${item.join(' → ')}` : item;
                ul.appendChild(li);
            });
            resultsDiv.appendChild(ul);
        }

        // 開始文字別集計モード
        if (Object.keys(firstCharCounts).length > 0) {
            const summary = document.createElement('p');
            summary.className = 'result-summary';
            summary.textContent = '開始文字別集計:';
            resultsDiv.appendChild(summary);

            const table = document.createElement('table');
            table.className = 'count-table';
            table.innerHTML = '<tr><th>開始文字</th><th>件数</th></tr>';
            
            Object.entries(firstCharCounts).forEach(([char, count]) => {
                const row = table.insertRow();
                row.innerHTML = `<td>${char}</td><td>${count}</td>`;
            });
            
            resultsDiv.appendChild(table);
        }

        // 終了文字別集計モード
        if (Object.keys(lastCharCounts).length > 0) {
            const summary = document.createElement('p');
            summary.className = 'result-summary';
            summary.textContent = '終了文字別集計:';
            resultsDiv.appendChild(summary);

            const table = document.createElement('table');
            table.className = 'count-table';
            table.innerHTML = '<tr><th>終了文字</th><th>件数</th></tr>';
            
            Object.entries(lastCharCounts).forEach(([char, count]) => {
                const row = table.insertRow();
                row.innerHTML = `<td>${char}</td><td>${count}</td>`;
            });
            
            resultsDiv.appendChild(table);
        }
    };
});