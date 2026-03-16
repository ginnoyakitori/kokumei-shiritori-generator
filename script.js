document.addEventListener('DOMContentLoaded', () => {
    const modeSelect = document.getElementById('modeSelect');
    const modeSections = {
        shiritori: document.getElementById('shiritoriMode'),
        wildcard: document.getElementById('wildcardMode'),
        substring: document.getElementById('substringMode'),
        wordCountShiritori: document.getElementById('wordCountShiritoriMode'),
        wildcardShiritori: document.getElementById('wildcardShiritoriMode'),
        loop: document.getElementById('loopMode')
    };

    const searchButtons = document.querySelectorAll('.search-btn');
    const resultsDiv = document.getElementById('results');

    // --- 各モードの要素取得 ---
    const listNameSelect = document.getElementById('listName');
    const wildcardListNameSelect = document.getElementById('wildcardListName');
    const substringListNameSelect = document.getElementById('substringListName');
    const wordCountShiritoriListNameSelect = document.getElementById('wordCountShiritoriListName');
    const wildcardShiritoriListNameSelect = document.getElementById('wildcardShiritoriListName');

    // 文字指定しりとりモード
    const firstCharInput = document.getElementById('firstChar');
    const lastCharInput = document.getElementById('lastChar');
    const wordCountTypeSelect = document.getElementById('wordCountType');
    const wordCountInputContainer = document.getElementById('wordCountInputContainer');
    const wordCountInput = document.getElementById('wordCount');
    const includeCharsInput = document.getElementById('includeChars');
    const excludeCharsInput = document.getElementById('excludeChars');
    const noPrecedingWordCheckbox = document.getElementById('noPrecedingWord');
    const noSucceedingWordCheckbox = document.getElementById('noSucceedingWord');
    const requiredCharExactlyCheckbox = document.getElementById('requiredCharExactly');

    // ？文字検索・部分一致
    const wildcardTextInput = document.getElementById('wildcardText');
    const substringTextInput = document.getElementById('substringText');

    // 単語数指定しりとり
    const wordCountInputsContainer = document.getElementById('wordCountInputs');
    const addWordCountInputButton = document.getElementById('addWordCountInput');
    const wordCountIncludeCharsInput = document.getElementById('wordCountIncludeChars');
    const allowWordCountPermutationCheckbox = document.getElementById('allowWordCountPermutation');
    const wordCountRequiredCharExactlyCheckbox = document.getElementById('wordCountRequiredCharExactly');

    // --- ？文字指定しりとり（修正のメイン箇所） ---
    const wordPatternList = document.getElementById('wordPatternList');
    const addPatternBtn = document.getElementById('addPatternBtn');
    const lastWordPatternInput = document.getElementById('lastWordPattern');
    const wildcardShiritoriIncludeCharsInput = document.getElementById('wildcardShiritoriIncludeChars');
    // HTMLにない可能性がある要素は、後で安全に取得します

    // ループ検索
    const loopPatternInput = document.getElementById('loopPattern');
    const loopListNameSelect = document.getElementById('loopListName');

    // --- ビュー切り替え ---
    const updateModeView = () => {
        const selectedMode = modeSelect.value;
        for (const mode in modeSections) {
            if (modeSections[mode]) {
                modeSections[mode].classList.remove('active');
            }
        }
        if (modeSections[selectedMode]) {
            modeSections[selectedMode].classList.add('active');
        }
    };
    modeSelect.addEventListener('change', updateModeView);
    updateModeView();

    // --- 動的フィールド管理（単語数指定） ---
    const getWordCountPatterns = () => {
        return Array.from(document.querySelectorAll('#wordCountShiritoriMode .word-count-input'))
            .map(input => input.value.trim())
            .filter(val => val !== '')
            .map(val => val.split(',').map(numStr => parseInt(numStr.trim(), 10)).filter(n => !isNaN(n) && n > 0));
    };

    addWordCountInputButton.addEventListener('click', () => {
        const newGroup = document.createElement('div');
        newGroup.className = 'word-count-input-group';
        newGroup.innerHTML = `
            <input type="text" class="word-count-input" value="3" placeholder="例: 3,4">
            <button class="remove-word-count-input">-</button>
        `;
        wordCountInputsContainer.appendChild(newGroup);
    });

    wordCountInputsContainer.addEventListener('click', (event) => {
        if (event.target.classList.contains('remove-word-count-input')) {
            if (wordCountInputsContainer.querySelectorAll('.word-count-input-group').length > 1) {
                event.target.closest('.word-count-input-group').remove();
            }
        }
    });

    // --- 動的フィールド管理（？文字指定・中間単語） ---
    if (addPatternBtn) {
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

        wordPatternList.addEventListener('click', (event) => {
            if (event.target.classList.contains('remove-pattern-btn')) {
                event.target.closest('.pattern-item').remove();
                // ラベルの更新
                wordPatternList.querySelectorAll('.pattern-item').forEach((item, index) => {
                    const label = item.querySelector('.label');
                    label.textContent = `${index + 1}番目${index === 0 ? ' (開始)' : ''}:`;
                });
            }
        });
    }

    wordCountTypeSelect.addEventListener('change', (event) => {
        wordCountInputContainer.style.display = (event.target.value === 'shortest') ? 'none' : 'block';
    });

    // --- 結果表示 ---
    const displayResults = (data, mode, wordCountType) => {
        resultsDiv.innerHTML = '';
        if (data.error) {
            resultsDiv.innerHTML = `<p class="error-message">エラー: ${data.error}</p>`;
            return;
        }

        if (data.results && data.results.length > 0) {
            let pathsToDisplay = data.results;
            if (mode === 'shiritori' && wordCountType === 'shortest' && document.querySelector('input[name="outputType"]:checked').value === 'path') {
                const pathLengths = pathsToDisplay.map(path => path.reduce((total, word) => total + word.length, 0));
                const minLength = Math.min(...pathLengths);
                pathsToDisplay = pathsToDisplay.filter((_, index) => pathLengths[index] === minLength);
                resultsDiv.innerHTML = `<p>${data.results.length} 通り中、最短 ${pathsToDisplay.length} 通り（${minLength}文字）を表示:</p>`;
            } else {
                resultsDiv.innerHTML = `<p>${data.results.length} 通り見つかりました:</p>`;
            }
            const ul = document.createElement('ul');
            pathsToDisplay.forEach((path, index) => {
                const li = document.createElement('li');
                li.textContent = `${index + 1}. ${path.join(' → ')}`;
                ul.appendChild(li);
            });
            resultsDiv.appendChild(ul);
        } else if (data.wildcardMatches || data.substringMatches) {
            const matches = data.wildcardMatches || data.substringMatches;
            resultsDiv.innerHTML = `<p>${matches.length} 件見つかりました:</p>`;
            const ul = document.createElement('ul');
            matches.forEach(word => {
                const li = document.createElement('li');
                li.textContent = word;
                ul.appendChild(li);
            });
            resultsDiv.appendChild(ul);
        } else {
            resultsDiv.innerHTML = '<p class="no-results-message">条件に合う結果は見つかりませんでした。</p>';
        }
    };

    // --- 検索実行 ---
    searchButtons.forEach(button => {
        button.addEventListener('click', async () => {
            resultsDiv.innerHTML = '<p class="loading-message">検索中...</p>';
            const mode = modeSelect.value;
            let apiPath, requestBody;

            try {
                if (mode === 'shiritori') {
                    const reqChars = includeCharsInput.value.trim() ? includeCharsInput.value.split(',').map(c => c.trim()) : null;
                    requestBody = {
                        listName: listNameSelect.value,
                        firstChar: firstCharInput.value.trim() || null,
                        lastChar: lastCharInput.value.trim() || null,
                        wordCount: wordCountTypeSelect.value === 'fixed' ? parseInt(wordCountInput.value, 10) : 'shortest',
                        requiredChars: reqChars,
                        excludeChars: excludeCharsInput.value.trim(),
                        noPrecedingWord: noPrecedingWordCheckbox.checked,
                        noSucceedingWord: noSucceedingWordCheckbox.checked,
                        outputType: document.querySelector('input[name="outputType"]:checked').value,
                        requiredCharMode: requiredCharExactlyCheckbox.checked ? 'exactly' : 'atLeast'
                    };
                    apiPath = '/api/shiritori';

                } else if (mode === 'wildcard') {
                    apiPath = '/api/wildcard_search';
                    requestBody = { listName: wildcardListNameSelect.value, searchText: wildcardTextInput.value.trim() };

                } else if (mode === 'substring') {
                    apiPath = '/api/substring_search';
                    requestBody = { listName: substringListNameSelect.value, searchText: substringTextInput.value.trim() };

                } else if (mode === 'wordCountShiritori') {
                    const reqChars = wordCountIncludeCharsInput.value.trim() ? wordCountIncludeCharsInput.value.split(',').map(c => c.trim()) : null;
                    requestBody = {
                        listName: wordCountShiritoriListNameSelect.value,
                        wordCountPatterns: getWordCountPatterns(),
                        requiredChars: reqChars,
                        allowPermutation: allowWordCountPermutationCheckbox.checked,
                        requiredCharMode: wordCountRequiredCharExactlyCheckbox.checked ? 'exactly' : 'atLeast'
                    };
                    apiPath = '/api/word_count_shiritori';

                } else if (mode === 'wildcardShiritori') {
                    // 安全な要素取得
                    const exactlyCheck = document.getElementById('wildcardRequiredCharExactly');
                    const wordCountField = document.getElementById('wildcardShiritoriWordCount');
                    
                    // パターンを集約（開始・中間の全て）
                    const patterns = Array.from(document.querySelectorAll('#wordPatternList .word-pattern-input'))
                                          .map(input => input.value.trim())
                                          .filter(val => val !== '');
                    
                    // 最後の単語があれば追加
                    const lastPat = lastWordPatternInput.value.trim();
                    if (lastPat) patterns.push(lastPat);

                    const reqChars = wildcardShiritoriIncludeCharsInput.value.trim() ? wildcardShiritoriIncludeCharsInput.value.split(',').map(c => c.trim()) : null;

                    requestBody = {
                        listName: wildcardShiritoriListNameSelect.value,
                        patterns: patterns,
                        // HTMLに単語数入力がない場合は、パターンの配列長を単語数とする
                        wordCount: wordCountField ? parseInt(wordCountField.value, 10) : patterns.length,
                        requiredChars: reqChars,
                        requiredCharMode: (exactlyCheck && exactlyCheck.checked) ? 'exactly' : 'atLeast'
                    };
                    apiPath = '/api/wildcard_shiritori';

                } else if (mode === 'loop') {
                    apiPath = '/api/loop_shiritori';
                    requestBody = { listName: loopListNameSelect.value, pattern: loopPatternInput.value.trim() };
                }

                if (apiPath && requestBody) {
                    const response = await fetch(apiPath, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(requestBody)
                    });
                    const data = await response.json();
                    displayResults(data, mode, mode === 'shiritori' ? wordCountTypeSelect.value : null);
                }
            } catch (error) {
                console.error("Fetch error:", error);
                resultsDiv.innerHTML = '<p class="error-message">通信エラーが発生しました。</p>';
            }
        });
    });
});