document.addEventListener('DOMContentLoaded', () => {
    // --- 共通要素の取得 ---
    const modeSelect = document.getElementById('modeSelect');
    const listNameSelect = document.getElementById('listName'); // 共通リスト
    const resultsDiv = document.getElementById('results');
    const searchButtons = document.querySelectorAll('.search-btn');
    const conditionChatInput = document.getElementById('conditionChatInput');
    const applyConditionChat = document.getElementById('applyConditionChat');
    const applyConditionChatAndSearch = document.getElementById('applyConditionChatAndSearch');
    const conditionChatMessages = document.getElementById('conditionChatMessages');

    const modeSections = {
        shiritori: document.getElementById('shiritoriMode'),
        wildcardShiritori: document.getElementById('wildcardShiritoriMode'),
        wordCountShiritori: document.getElementById('wordCountShiritoriMode'),
        loop: document.getElementById('loopMode'),
        wildcard: document.getElementById('wildcardMode'),
        substring: document.getElementById('substringMode')
    };

    // ヘルパー関数: 要素が存在すれば値を、なければデフォルト値を返す
    const getVal = (id) => document.getElementById(id)?.value || '';
    const getChecked = (id) => document.getElementById(id)?.checked || false;
    const setVal = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.value = value;
    };
    const setChecked = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.checked = value;
    };

    const appendChatMessage = (role, text) => {
        if (!conditionChatMessages) return;
        const message = document.createElement('div');
        message.className = `chat-message ${role}`;
        message.textContent = text;
        conditionChatMessages.appendChild(message);
        conditionChatMessages.scrollTop = conditionChatMessages.scrollHeight;
    };

    const normalizeConditionText = (text) => text
        .replace(/[，、]/g, ',')
        .replace(/[？?]/g, '？')
        .replace(/[〜～]/g, '-')
        .trim();

    const splitConditionValues = (value) => value
        .split(/[,・\s]+/)
        .map(item => item.replace(/[「」『』"'`]/g, '').trim())
        .filter(Boolean);

    const pickConditionValue = (text, labels) => {
        for (const label of labels) {
            const match = text.match(new RegExp(`${label}\\s*[：:=]?\\s*([^,。\\s]+)`));
            if (match) return match[1].trim();
        }
        return '';
    };

    const setOutputType = (value) => {
        const radio = document.querySelector(`input[name="outputType"][value="${value}"]`);
        if (radio) radio.checked = true;
    };

    const setWordPatterns = (patterns) => {
        if (!wordPatternList || patterns.length === 0) return;
        wordPatternList.innerHTML = '';
        patterns.slice(0, -1).forEach((pattern, index) => {
            const div = document.createElement('div');
            div.className = 'pattern-item';
            const label = document.createElement('span');
            label.className = 'label';
            label.textContent = `${index + 1}番目:`;
            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'word-pattern-input';
            input.value = pattern;
            div.append(label, input);
            if (index > 0) {
                const removeButton = document.createElement('button');
                removeButton.className = 'remove-pattern-btn';
                removeButton.style.marginLeft = '5px';
                removeButton.textContent = '-';
                div.appendChild(removeButton);
            }
            wordPatternList.appendChild(div);
        });
        setVal('lastWordPattern', patterns[patterns.length - 1] || '');
    };

    const setWordCountPatterns = (patterns) => {
        if (!wordCountInputsContainer || patterns.length === 0) return;
        wordCountInputsContainer.innerHTML = '';
        patterns.forEach(pattern => {
            const div = document.createElement('div');
            div.className = 'word-count-input-group';
            const input = document.createElement('input');
            input.type = 'text';
            input.className = 'word-count-input';
            input.value = pattern;
            input.placeholder = '例: 3,4';
            const removeButton = document.createElement('button');
            removeButton.className = 'remove-word-count-input';
            removeButton.textContent = '-';
            div.append(input, removeButton);
            wordCountInputsContainer.appendChild(div);
        });
    };

    const applyNaturalLanguageConditions = (rawText) => {
        const text = normalizeConditionText(rawText);
        if (!text) return { applied: [], mode: modeSelect.value };

        const applied = [];
        let selectedMode = modeSelect.value;

        const listRules = [
            ['pokemon.txt', /ポケモン/],
            ['kokumei_shutomei.txt', /国名.*首都|首都.*国名/],
            ['capitals-only.txt', /共役削除首都/],
            ['countries-only.txt', /共役削除国名/],
            ['shutomei.txt', /首都/],
            ['kokumei.txt', /国名|国/]
        ];
        const listRule = listRules.find(([, regex]) => regex.test(text));
        if (listRule) {
            listNameSelect.value = listRule[0];
            applied.push(`リスト: ${listNameSelect.selectedOptions[0].textContent}`);
        }

        const arrowPatterns = text.match(/[^\s,。]+(?:\s*[→>]\s*[^\s,。]+)+/);
        if (arrowPatterns) {
            const patterns = arrowPatterns[0].split(/\s*[→>]\s*/).filter(Boolean);
            selectedMode = 'wildcardShiritori';
            setWordPatterns(patterns);
            applied.push(`単語パターン: ${patterns.join(' → ')}`);
        } else if (/ループ/.test(text)) {
            selectedMode = 'loop';
            const pattern = pickConditionValue(text, ['パターン', 'ループ']) || text.match(/[ァ-ンー？]+/)?.[0] || '';
            if (pattern) {
                setVal('loopPattern', pattern);
                applied.push(`ループパターン: ${pattern}`);
            }
        } else if (/部分一致|含む単語|部分/.test(text)) {
            selectedMode = 'substring';
            const keyword = pickConditionValue(text, ['部分一致', '検索', '単語']) || text.match(/[ァ-ンー一-龠ぁ-ん]+/)?.[0] || '';
            if (keyword) {
                setVal('substringText', keyword);
                applied.push(`部分一致: ${keyword}`);
            }
        } else if (/単語検索|ワイルドカード|？/.test(text) && !/しりとり|から|始/.test(text)) {
            selectedMode = 'wildcard';
            const pattern = pickConditionValue(text, ['検索', 'パターン', '単語']) || text.match(/[ァ-ンー？]+/)?.[0] || '';
            if (pattern) {
                setVal('wildcardText', pattern);
                applied.push(`単語検索: ${pattern}`);
            }
        } else if (/文字数|単語数パターン|長さ/.test(text) && /(?:\d+\s*,\s*)*\d+/.test(text) && !/から|始|終/.test(text)) {
            selectedMode = 'wordCountShiritori';
            const patternText = text.match(/(?:\d+\s*,\s*)*\d+(?:\s*[→>]\s*(?:\d+\s*,\s*)*\d+)*/)?.[0] || '';
            const patterns = patternText.split(/\s*[→>]\s*/).filter(Boolean);
            setWordCountPatterns(patterns);
            setChecked('allowWordCountPermutation', /並び替え|順不同| permutation/i.test(text));
            applied.push(`単語数パターン: ${patterns.join(' → ')}`);
        } else {
            selectedMode = 'shiritori';
        }

        modeSelect.value = selectedMode;
        updateModeView();

        const firstChar = pickConditionValue(text, ['開始文字', '開始', '始まり', '最初']).replace(/[「」『』"'`]/g, '');
        const lastChar = pickConditionValue(text, ['終了文字', '終了', '終わり', '最後']).replace(/[「」『』"'`]/g, '');
        const fromMatch = text.match(/[「『"'`]?([^「」『』"'`\s,。])(?:[」』"'`])?\s*から/);
        const toMatch = text.match(/[「『"'`]?([^「」『』"'`\s,。])(?:[」』"'`])?\s*(?:まで|へ|に終|で終)/);
        if (firstChar || fromMatch) {
            const value = firstChar || fromMatch[1];
            setVal('firstChar', value);
            applied.push(`開始文字: ${value}`);
        }
        if (lastChar || toMatch) {
            const value = lastChar || toMatch[1];
            setVal('lastChar', value);
            applied.push(`終了文字: ${value}`);
        }

        if (/最短/.test(text)) {
            setVal('wordCountType', 'shortest');
            document.getElementById('wordCountInputContainer').style.display = 'none';
            applied.push('単語数: 最短');
        } else {
            const wordCountMatch = text.match(/(\d+)\s*(?:単語|語|個)/);
            if (wordCountMatch && selectedMode === 'shiritori') {
                setVal('wordCountType', 'fixed');
                document.getElementById('wordCountInputContainer').style.display = 'block';
                setVal('wordCount', wordCountMatch[1]);
                applied.push(`単語数: ${wordCountMatch[1]}`);
            }
        }

        const includeValue = pickConditionValue(text, ['必須', '含める', '含む']);
        if (includeValue) {
            const values = splitConditionValues(includeValue).join(',');
            setVal('includeChars', values);
            applied.push(`必須: ${values}`);
        }

        const excludeValue = pickConditionValue(text, ['除外', '含めない', '禁止']);
        if (excludeValue) {
            const values = splitConditionValues(excludeValue).join('');
            setVal('excludeChars', values);
            applied.push(`除外: ${values}`);
        }

        if (/ちょうど|丁度|指定回数/.test(text)) {
            setChecked('requiredCharExactly', true);
            applied.push('必須文字: ちょうど指定回数');
        } else if (/以上|少なくとも/.test(text)) {
            setChecked('requiredCharExactly', false);
            applied.push('必須文字: 少なくとも指定回数');
        }

        if (/開始文字別|開始.*集計/.test(text)) {
            setOutputType('firstCharCount');
            applied.push('出力: 開始文字別集計');
        } else if (/終了文字別|終了.*集計/.test(text)) {
            setOutputType('lastCharCount');
            applied.push('出力: 終了文字別集計');
        } else if (/経路|一覧|すべて|全部/.test(text)) {
            setOutputType('path');
            applied.push('出力: 経路表示');
        }

        return { applied, mode: selectedMode };
    };

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

    const handleConditionChat = (shouldSearch = false) => {
        const text = conditionChatInput?.value || '';
        if (!text.trim()) return;

        appendChatMessage('user', text);
        const { applied } = applyNaturalLanguageConditions(text);
        const reply = applied.length > 0
            ? `反映しました: ${applied.join(' / ')}`
            : '読み取れる条件が見つかりませんでした。例のように「開始文字」「終了文字」「3単語」などを入れてみてください。';
        appendChatMessage('assistant', reply);
        conditionChatInput.value = '';

        if (shouldSearch && applied.length > 0) {
            document.querySelector(`#${modeSelect.value}Mode .search-btn`)?.click();
        }
    };

    applyConditionChat?.addEventListener('click', () => handleConditionChat(false));
    applyConditionChatAndSearch?.addEventListener('click', () => handleConditionChat(true));
    conditionChatInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            handleConditionChat(e.ctrlKey || e.metaKey);
        }
    });

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
                    requestBody = {
                        listName: commonListName,
                        firstChar: getVal('firstChar').trim() || null,
                        lastChar: getVal('lastChar').trim() || null,
                        wordCount: getVal('wordCountType') === 'fixed' ? parseInt(getVal('wordCount'), 10) : 'shortest',
                        requiredChars: includeStr ? includeStr.split(',').map(c => c.trim()) : null,
                        excludeChars: getVal('excludeChars').trim(),
                        outputType: document.querySelector('input[name="outputType"]:checked')?.value || 'path',
                        requiredCharMode: getChecked('requiredCharExactly') ? 'exactly' : 'atLeast'
                    };
                } else if (mode === 'wildcardShiritori') {
                    apiPath = '/api/wildcard_shiritori';

                    const patterns = Array.from(document.querySelectorAll('.word-pattern-input'))
                        .map(input => input.value.trim())
                        .filter(val => val !== "");

                    const includeStr = getVal('includeChars');

                    requestBody = {
                        listName: commonListName,
                        wordPatterns: patterns,
                        requiredChars: includeStr ? includeStr.split(',').map(c => c.trim()) : null,
                        requiredCharMode: getChecked('requiredCharExactly') ? 'exactly' : 'atLeast'
                    };

                } else if (mode === 'wordCountShiritori') {
                    apiPath = '/api/word_count_shiritori';
                    const patterns = Array.from(document.querySelectorAll('.word-count-input'))
                                          .map(input => input.value.trim())
                                          .filter(val => val !== '')
                                          .map(val => val.split(',').map(n => parseInt(n.trim(), 10)).filter(n => !isNaN(n)));
                    requestBody = {
                        listName: commonListName,
                        wordCountPatterns: patterns,
                        allowPermutation: getChecked('allowWordCountPermutation')
                    };

                } else if (mode === 'loop') {
                    apiPath = '/api/loop_shiritori';
                    requestBody = { listName: commonListName, pattern: getVal('loopPattern').trim() };

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
