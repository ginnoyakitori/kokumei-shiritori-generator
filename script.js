document.addEventListener('DOMContentLoaded', () => {
    const modeSelect = document.getElementById('modeSelect');
    const modeSections = {
        shiritori: document.getElementById('shiritoriMode'),
        wildcard: document.getElementById('wildcardMode'),
        substring: document.getElementById('substringMode'),
        wordCountShiritori: document.getElementById('wordCountShiritoriMode'),
        wildcardShiritori: document.getElementById('wildcardShiritoriMode')
    };

    const searchButtons = document.querySelectorAll('.search-btn');

    // リスト選択要素 (省略)
    const listNameSelect = document.getElementById('listName');
    const wildcardListNameSelect = document.getElementById('wildcardListName');
    const substringListNameSelect = document.getElementById('substringListName');
    const wordCountShiritoriListNameSelect = document.getElementById('wordCountShiritoriListName');
    const wildcardShiritoriListNameSelect = document.getElementById('wildcardShiritoriListName');

    // 文字指定しりとりモードの要素 (省略)
    const firstCharInput = document.getElementById('firstChar');
    const lastCharInput = document.getElementById('lastChar');
    const wordCountTypeSelect = document.getElementById('wordCountType');
    const wordCountInputContainer = document.getElementById('wordCountInputContainer');
    const wordCountInput = document.getElementById('wordCount');
    const includeCharsInput = document.getElementById('includeChars');
    const excludeCharsInput = document.getElementById('excludeChars');
    const noPrecedingWordCheckbox = document.getElementById('noPrecedingWord');
    const noSucceedingWordCheckbox = document.getElementById('noSucceedingWord');

    // ？文字検索モードの要素 (省略)
    const wildcardTextInput = document.getElementById('wildcardText');

    // 部分文字列検索モードの要素 (省略)
    const substringTextInput = document.getElementById('substringText');

    // 💡 単語数指定しりとりモードの要素 (修正)
    const wordCountInputsContainer = document.getElementById('wordCountInputs');
    const addWordCountInputButton = document.getElementById('addWordCountInput');
    const wordCountIncludeCharsInput = document.getElementById('wordCountIncludeChars');
    const allowWordCountPermutationCheckbox = document.getElementById('allowWordCountPermutation');

    // ？文字指定しりとりモードの要素 (省略)
    const firstWordPatternInput = document.getElementById('firstWordPattern');
    const lastWordPatternInput = document.getElementById('lastWordPattern');
    const wildcardShiritoriWordCountInput = document.getElementById('wildcardShiritoriWordCount');
    const wildcardShiritoriIncludeCharsInput = document.getElementById('wildcardShiritoriIncludeChars');

    const resultsDiv = document.getElementById('results');

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

    wordCountTypeSelect.addEventListener('change', (event) => {
        if (event.target.value === 'shortest') {
            wordCountInputContainer.style.display = 'none';
        } else {
            wordCountInputContainer.style.display = 'block';
        }
    });

    searchButtons.forEach(button => {
        button.addEventListener('click', async (event) => {
            resultsDiv.innerHTML = '<p class="loading-message">検索中...</p>';
            const mode = modeSelect.value;
            let response;

            if (mode === 'shiritori') {
                // ... (shiritoriModeの処理は省略、変更なし)
                const listName = listNameSelect.value;
                const firstChar = firstCharInput.value.trim() === '' ? null : firstCharInput.value.trim();
                const lastChar = lastCharInput.value.trim() === '' ? null : lastCharInput.value.trim();
                const wordCountType = wordCountTypeSelect.value;
                const wordCount = wordCountType === 'fixed' ? parseInt(wordCountInput.value, 10) : 'shortest';
                const includeChars = includeCharsInput.value.trim();
                const excludeChars = excludeCharsInput.value.trim();
                const noPrecedingWord = noPrecedingWordCheckbox.checked;
                const noSucceedingWord = noSucceedingWordCheckbox.checked;
                const outputType = document.querySelector('input[name="outputType"]:checked').value;
                const requiredChars = includeChars ? includeChars.split('') : null;

                response = await fetch('/api/shiritori', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        listName, 
                        firstChar, 
                        lastChar, 
                        wordCount, 
                        requiredChars, 
                        excludeChars,
                        noPrecedingWord,
                        noSucceedingWord,
                        outputType 
                    })
                });
            } else if (mode === 'wildcard') {
                // ... (wildcardModeの処理は省略、変更なし)
                const listName = wildcardListNameSelect.value;
                const searchText = wildcardTextInput.value.trim();
                const apiSearchText = searchText; // サーバー側で？を処理

                response = await fetch('/api/wildcard_search', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ listName, searchText: apiSearchText })
                });
            } else if (mode === 'substring') {
                // ... (substringModeの処理は省略、変更なし)
                const listName = substringListNameSelect.value;
                const searchText = substringTextInput.value.trim();
                response = await fetch('/api/substring_search', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ listName, searchText })
                });
            } else if (mode === 'wordCountShiritori') {
                const listName = wordCountShiritoriListNameSelect.value;
                
                // 💡 複数文字数指定の解析
                const wordCountPatterns = Array.from(document.querySelectorAll('#wordCountShiritoriMode .word-count-input'))
                    .map(input => input.value.trim())
                    .filter(val => val !== '')
                    // カンマ区切りでパースし、数字に変換して配列化
                    .map(val => val.split(',').map(numStr => parseInt(numStr.trim(), 10)).filter(n => !isNaN(n) && n > 0)); 
                
                const includeChars = wordCountIncludeCharsInput.value.trim();
                const requiredChars = includeChars ? includeChars.split('') : null;
                
                // 💡 並び替えの許可フラグ
                const allowPermutation = allowWordCountPermutationCheckbox.checked;

                // APIに送るデータ構造を修正
                response = await fetch('/api/word_count_shiritori', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        listName, 
                        wordCountPatterns: wordCountPatterns, 
                        requiredChars,
                        allowPermutation: allowPermutation // 💡 新しいフラグを追加
                    })
                });
            } else if (mode === 'wildcardShiritori') {
                // ... (wildcardShiritoriModeの処理は省略、変更なし)
                const listName = wildcardShiritoriListNameSelect.value;
                const firstWordPattern = firstWordPatternInput.value.trim();
                const lastWordPattern = lastWordPatternInput.value.trim();
                const wordCount = parseInt(wildcardShiritoriWordCountInput.value, 10);
                const includeChars = wildcardShiritoriIncludeCharsInput.value.trim();
                const requiredChars = includeChars ? includeChars.split('') : null;
                
                response = await fetch('/api/wildcard_shiritori', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ listName, firstWordPattern, lastWordPattern, wordCount, requiredChars })
                });
            }


            const data = await response.json();
            resultsDiv.innerHTML = '';

            if (response.status !== 200) {
                resultsDiv.innerHTML = `<p class="error-message">エラー: ${data.error}</p>`;
                return;
            }

            // ... (結果表示ロジックは省略、変更なし)
            if (data.results && data.results.length > 0) {
                const countMessage = document.createElement('p');
                countMessage.textContent = `${data.results.length} 通り見つかりました:`;
                resultsDiv.appendChild(countMessage);
                
                const ul = document.createElement('ul');
                data.results.forEach((path, index) => {
                    const li = document.createElement('li');
                    li.textContent = `${index + 1}. ${path.join(' → ')}`;
                    ul.appendChild(li);
                });
                resultsDiv.appendChild(ul);
            } else if (data.results && data.results.length === 0) {
                resultsDiv.innerHTML = '<p class="no-results-message">条件に合う単語は見つかりませんでした。</p>';
            } else if (data.firstCharCounts || data.lastCharCounts) {
                const counts = data.firstCharCounts || data.lastCharCounts;
                const totalCount = Object.values(counts).reduce((sum, count) => sum + count, 0);
                const countMessage = document.createElement('p');
                countMessage.textContent = `総数: ${totalCount} 通り見つかりました。`;
                resultsDiv.appendChild(countMessage);
                
                const ul = document.createElement('ul');
                for (const char in counts) {
                    const li = document.createElement('li');
                    li.textContent = `${char}: ${counts[char]} 通り`;
                    ul.appendChild(li);
                }
                resultsDiv.appendChild(ul);
            } else if (data.wildcardMatches) {
                const countMessage = document.createElement('p');
                countMessage.textContent = `${data.wildcardMatches.length} 件見つかりました:`;
                resultsDiv.appendChild(countMessage);
                
                const ul = document.createElement('ul');
                data.wildcardMatches.forEach((word) => {
                    const li = document.createElement('li');
                    li.textContent = word;
                    ul.appendChild(li);
                });
                resultsDiv.appendChild(ul);
            } else if (data.substringMatches) {
                const countMessage = document.createElement('p');
                countMessage.textContent = `${data.substringMatches.length} 件見つかりました:`;
                resultsDiv.appendChild(countMessage);
                
                const ul = document.createElement('ul');
                data.substringMatches.forEach((word) => {
                    const li = document.createElement('li');
                    li.textContent = word;
                    ul.appendChild(li);
                });
                resultsDiv.appendChild(ul);
            } else {
                resultsDiv.innerHTML = '<p class="no-results-message">条件に合う単語は見つかりませんでした。</p>';
            }
        });
    });
});