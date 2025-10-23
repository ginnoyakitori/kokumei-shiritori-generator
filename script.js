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
    const resultsDiv = document.getElementById('results');

    // --- 各モードの要素 ---
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
    const includeCharsInput = document.getElementById('includeChars'); // 💡 修正対象
    const excludeCharsInput = document.getElementById('excludeChars');
    const noPrecedingWordCheckbox = document.getElementById('noPrecedingWord');
    const noSucceedingWordCheckbox = document.getElementById('noSucceedingWord');
    const requiredCharExactlyCheckbox = document.getElementById('requiredCharExactly');

    // ？文字検索モードの要素
    const wildcardTextInput = document.getElementById('wildcardText');

    // 部分文字列検索モードの要素
    const substringTextInput = document.getElementById('substringText');

    // 単語数指定しりとりモードの要素
    const wordCountInputsContainer = document.getElementById('wordCountInputs');
    const addWordCountInputButton = document.getElementById('addWordCountInput');
    const wordCountIncludeCharsInput = document.getElementById('wordCountIncludeChars');
    const allowWordCountPermutationCheckbox = document.getElementById('allowWordCountPermutation');
    const wordCountRequiredCharExactlyCheckbox = document.getElementById('wordCountRequiredCharExactly');


    // ？文字指定しりとりモードの要素
    const firstWordPatternInput = document.getElementById('firstWordPattern');
    const lastWordPatternInput = document.getElementById('lastWordPattern');
    const wildcardShiritoriWordCountInput = document.getElementById('wildcardShiritoriWordCount');
    const wildcardShiritoriIncludeCharsInput = document.getElementById('wildcardShiritoriIncludeChars');
    const wildcardRequiredCharExactlyCheckbox = document.getElementById('wildcardRequiredCharExactly');
    

    // --- ビュー切り替えロジック ---
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
    updateModeView(); // 初回表示

    // --- 単語数入力フィールド管理 ---
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

    wordCountTypeSelect.addEventListener('change', (event) => {
        if (event.target.value === 'shortest') {
            wordCountInputContainer.style.display = 'none';
        } else {
            wordCountInputContainer.style.display = 'block';
        }
    });

    // --- 結果表示ロジック (省略) ---
    const displayResults = (data, mode) => {
        resultsDiv.innerHTML = '';
        
        if (data.error) {
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
            resultsDiv.innerHTML = '<p class="no-results-message">条件に合うしりとりパスは見つかりませんでした。</p>';
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
        } else {
             resultsDiv.innerHTML = '<p class="no-results-message">条件に合う単語は見つかりませんでした。</p>';
        }
    };


    // --- 検索実行ロジック ---
    searchButtons.forEach(button => {
        button.addEventListener('click', async (event) => {
            resultsDiv.innerHTML = '<p class="loading-message">検索中...</p>';
            const mode = modeSelect.value;
            let response;
            let apiPath;
            let requestBody;
            
            try {
                if (mode === 'shiritori') {
                    const includeCharsText = includeCharsInput.value.trim();
                    // 💡 修正: カンマ区切りで入力された文字を配列に変換
                    const requiredChars = includeCharsText ? includeCharsText.split(',').map(c => c.trim()).filter(c => c) : null;
                    
                    const requiredCharMode = requiredCharExactlyCheckbox.checked ? 'exactly' : 'atLeast';

                    requestBody = { 
                        listName: listNameSelect.value, 
                        firstChar: firstCharInput.value.trim() || null, 
                        lastChar: lastCharInput.value.trim() || null, 
                        wordCount: wordCountTypeSelect.value === 'fixed' ? parseInt(wordCountInput.value, 10) : 'shortest', 
                        requiredChars: requiredChars, // 💡 修正後の変数を使用
                        excludeChars: excludeCharsInput.value.trim(),
                        noPrecedingWord: noPrecedingWordCheckbox.checked,
                        noSucceedingWord: noSucceedingWordCheckbox.checked,
                        outputType: document.querySelector('input[name="outputType"]:checked').value,
                        requiredCharMode: requiredCharMode 
                    };
                    apiPath = '/api/shiritori';

                } else if (mode === 'wildcard') {
                    apiPath = '/api/wildcard_search';
                    requestBody = { 
                        listName: wildcardListNameSelect.value, 
                        searchText: wildcardTextInput.value.trim() 
                    };

                } else if (mode === 'substring') {
                    apiPath = '/api/substring_search';
                    requestBody = { 
                        listName: substringListNameSelect.value, 
                        searchText: substringTextInput.value.trim() 
                    };

                } else if (mode === 'wordCountShiritori') {
                    const includeCharsText = wordCountIncludeCharsInput.value.trim();
                    // 💡 修正: カンマ区切りで入力された文字を配列に変換
                    const requiredChars = includeCharsText ? includeCharsText.split(',').map(c => c.trim()).filter(c => c) : null;
                    
                    const requiredCharMode = wordCountRequiredCharExactlyCheckbox.checked ? 'exactly' : 'atLeast';

                    requestBody = { 
                        listName: wordCountShiritoriListNameSelect.value, 
                        wordCountPatterns: getWordCountPatterns(), 
                        requiredChars: requiredChars, // 💡 修正後の変数を使用
                        allowPermutation: allowWordCountPermutationCheckbox.checked,
                        requiredCharMode: requiredCharMode 
                    };
                    apiPath = '/api/word_count_shiritori';
                    
                } else if (mode === 'wildcardShiritori') {
                    const includeCharsText = wildcardShiritoriIncludeCharsInput.value.trim();
                    // 💡 修正: カンマ区切りで入力された文字を配列に変換 (？文字指定ではカンマ区切りでの入力は想定外かもしれませんが、安全のため対応)
                    const requiredChars = includeCharsText ? includeCharsText.split('').map(c => c.trim()).filter(c => c) : null;
                    
                    const requiredCharMode = wildcardRequiredCharExactlyCheckbox.checked ? 'exactly' : 'atLeast';

                    requestBody = { 
                        listName: wildcardShiritoriListNameSelect.value, 
                        firstWordPattern: firstWordPatternInput.value.trim(),
                        lastWordPattern: lastWordPatternInput.value.trim() || null,
                        wordCount: parseInt(wildcardShiritoriWordCountInput.value, 10),
                        requiredChars: requiredChars, // 💡 修正後の変数を使用
                        requiredCharMode: requiredCharMode 
                    };
                    apiPath = '/api/wildcard_shiritori';
                }

                if (apiPath && requestBody) {
                    response = await fetch(apiPath, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(requestBody)
                    });
                    
                    // エラーレスポンスもJSONとして処理するため、try-catchの外に出す
                    const data = await response.json(); 
                    displayResults(data, mode);
                } else {
                    displayResults({ error: '無効な検索モードです。' }, mode);
                }

            } catch (error) {
                console.error("Fetch error:", error);
                resultsDiv.innerHTML = '<p class="error-message">サーバーとの通信中に予期せぬエラーが発生しました。</p>';
            }
        });
    });
});