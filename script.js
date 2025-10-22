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

    // リスト選択要素
    const listNameSelect = document.getElementById('listName');
    const wildcardListNameSelect = document.getElementById('wildcardListName');
    const substringListNameSelect = document.getElementById('substringListName');
    const wordCountShiritoriListNameSelect = document.getElementById('wordCountShiritoriListName');
    const wildcardShiritoriListNameSelect = document.getElementById('wildcardShiritoriListName');

    // 文字指定しりとりモードの要素
    const firstCharInput = document.getElementById('firstChar');
    const lastCharInput = document.getElementById('lastChar');
    const wordCountTypeSelect = document.getElementById('wordCountType');
    const wordCountInputContainer = document.getElementById('wordCountInputContainer');
    const wordCountInput = document.getElementById('wordCount');
    const includeCharsInput = document.getElementById('includeChars');
    
    // 💡 新規追加: 必ず含まない文字と接続制約
    const excludeCharsInput = document.getElementById('excludeChars');
    const noPrecedingWordCheckbox = document.getElementById('noPrecedingWord');
    const noSucceedingWordCheckbox = document.getElementById('noSucceedingWord');

    // ？文字検索モードの要素
    const wildcardTextInput = document.getElementById('wildcardText');

    // 部分文字列検索モードの要素
    const substringTextInput = document.getElementById('substringText');

    // 単語数指定しりとりモードの要素
    const wordCountInputsContainer = document.getElementById('wordCountInputs');
    const addWordCountInputButton = document.getElementById('addWordCountInput');
    const wordCountIncludeCharsInput = document.getElementById('wordCountIncludeChars');

    // ？文字指定しりとりモードの要素
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
            <input type="number" class="word-count-input" value="2" min="1">
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
                const listName = listNameSelect.value;
                const firstChar = firstCharInput.value.trim() === '' ? null : firstCharInput.value.trim();
                const lastChar = lastCharInput.value.trim() === '' ? null : lastCharInput.value.trim();
                const wordCountType = wordCountTypeSelect.value;
                const wordCount = wordCountType === 'fixed' ? parseInt(wordCountInput.value, 10) : 'shortest';
                const includeChars = includeCharsInput.value.trim();
                
                // 💡 新規追加要素の取得
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
                        // 💡 新規追加パラメータ
                        excludeChars,
                        noPrecedingWord,
                        noSucceedingWord,
                        // ----------------
                        outputType 
                    })
                });
            } else if (mode === 'wildcard') {
                const listName = wildcardListNameSelect.value;
                const searchText = wildcardTextInput.value.trim();
                // 💡 ワイルドカード文字の置換: '？'を正規表現の'.'に
                const apiSearchText = searchText.replace(/？/g, '〇'); 

                response = await fetch('/api/wildcard_search', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ listName, searchText: apiSearchText })
                });
            } else if (mode === 'substring') {
                const listName = substringListNameSelect.value;
                const searchText = substringTextInput.value.trim();
                response = await fetch('/api/substring_search', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ listName, searchText })
                });
            } else if (mode === 'wordCountShiritori') {
                const listName = wordCountShiritoriListNameSelect.value;
                const wordCounts = Array.from(document.querySelectorAll('#wordCountShiritoriMode .word-count-input')).map(input => parseInt(input.value, 10));
                const includeChars = wordCountIncludeCharsInput.value.trim();
                const requiredChars = includeChars ? includeChars.split('') : null;

                response = await fetch('/api/shiritori', { // 単語数指定も/api/shiritoriに統合
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ listName, wordCount: wordCounts, requiredChars, outputType: 'path' })
                });
            } else if (mode === 'wildcardShiritori') {
                const listName = wildcardShiritoriListNameSelect.value;
                
                // 💡 ワイルドカード文字の置換: '？'をAPIに渡す前に'〇'に
                const firstWordPattern = firstWordPatternInput.value.trim().replace(/？/g, '〇');
                const lastWordPattern = lastWordPatternInput.value.trim().replace(/？/g, '〇');
                
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
            } else if (data.firstCharCounts) {
                const totalCount = Object.values(data.firstCharCounts).reduce((sum, count) => sum + count, 0);
                const countMessage = document.createElement('p');
                countMessage.textContent = `総数: ${totalCount} 通り見つかりました。`;
                resultsDiv.appendChild(countMessage);
                
                const ul = document.createElement('ul');
                for (const char in data.firstCharCounts) {
                    const li = document.createElement('li');
                    li.textContent = `${char}: ${data.firstCharCounts[char]} 通り`;
                    ul.appendChild(li);
                }
                resultsDiv.appendChild(ul);
            } else if (data.lastCharCounts) {
                const totalCount = Object.values(data.lastCharCounts).reduce((sum, count) => sum + count, 0);
                const countMessage = document.createElement('p');
                countMessage.textContent = `総数: ${totalCount} 通り見つかりました。`;
                resultsDiv.appendChild(countMessage);

                const ul = document.createElement('ul');
                for (const char in data.lastCharCounts) {
                    const li = document.createElement('li');
                    li.textContent = `${char}: ${data.lastCharCounts[char]} 通り`;
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