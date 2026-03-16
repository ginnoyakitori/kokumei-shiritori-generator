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
    // --- 変更後：動的な要素取得と初期化 ---
    const wordPatternList = document.getElementById('wordPatternList');
    const addPatternBtn = document.getElementById('addPatternBtn');
    const lastCharInput = document.getElementById('lastChar');
    const wordCountTypeSelect = document.getElementById('wordCountType');
    const wordCountInputContainer = document.getElementById('wordCountInputContainer');
    const wordCountInput = document.getElementById('wordCount');
    const includeCharsInput = document.getElementById('includeChars');
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
    
    const loopPatternInput = document.getElementById('loopPattern');
    const loopListNameSelect = document.getElementById('loopListName');
    modeSections.loop = document.getElementById('loopMode');
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


    // 中間単語の追加・削除ロジック
    if (addPatternBtn) {
        addPatternBtn.addEventListener('click', () => {
            const newDiv = document.createElement('div');
            newDiv.className = 'pattern-item';
            newDiv.innerHTML = `
                <input type="text" class="word-pattern-input" placeholder="例: ？？ン">
                <button class="remove-pattern-btn">-</button>
            `;
            wordPatternList.appendChild(newDiv);
        });

        wordPatternList.addEventListener('click', (event) => {
            if (event.target.classList.contains('remove-pattern-btn')) {
                event.target.closest('.pattern-item').remove();
            }
        });
    }
    
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

    // --- 結果表示ロジック ---
    const displayResults = (data, mode, wordCountType) => {
        resultsDiv.innerHTML = '';
        
        if (data.error) {
            resultsDiv.innerHTML = `<p class="error-message">エラー: ${data.error}</p>`;
            return;
        }

        if (data.results && data.results.length > 0) {
            let pathsToDisplay = data.results;
            
            // 💡 最短モードかつ経路出力の場合のみ、文字数最小のパスをフィルタリング
            if (mode === 'shiritori' && wordCountType === 'shortest' && document.querySelector('input[name="outputType"]:checked').value === 'path') {
                
                // 全パスの文字数を計算
                const pathLengths = pathsToDisplay.map(path => 
                    path.reduce((total, word) => total + word.length, 0)
                );
                
                // 最小の文字数を取得
                const minLength = Math.min(...pathLengths);

                // 最小文字数のパスのみをフィルタリング
                pathsToDisplay = pathsToDisplay.filter((_, index) => pathLengths[index] === minLength);
                
                const countMessage = document.createElement('p');
                countMessage.textContent = `${data.results.length} 通り（最短単語数）のしりとりのうち、最も文字数の少ない ${pathsToDisplay.length} 通り（${minLength}文字）が見つかりました:`;
                resultsDiv.appendChild(countMessage);

            } else {
                // その他のモード/出力形式の場合は通常通り表示
                const countMessage = document.createElement('p');
                countMessage.textContent = `${data.results.length} 通り見つかりました:`;
                resultsDiv.appendChild(countMessage);
            }
            
            const ul = document.createElement('ul');
            pathsToDisplay.forEach((path, index) => {
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
                    const requiredChars = includeCharsText ? includeCharsText.split(',').map(c => c.trim()).filter(c => c.length > 0) : null;
                    const requiredCharMode = requiredCharExactlyCheckbox.checked ? 'exactly' : 'atLeast';
                    
                    const wordCountType = wordCountTypeSelect.value;
                    const wordCount = wordCountType === 'fixed' ? parseInt(wordCountInput.value, 10) : 'shortest';

                    requestBody = { 
                        listName: listNameSelect.value, 
                        firstChar: firstCharInput.value.trim() || null, 
                        lastChar: lastCharInput.value.trim() || null, 
                        wordCount: wordCount,
                        requiredChars: requiredChars, 
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
                    const requiredChars = includeCharsText ? includeCharsText.split(',').map(c => c.trim()).filter(c => c.length > 0) : null;
                    const requiredCharMode = wordCountRequiredCharExactlyCheckbox.checked ? 'exactly' : 'atLeast';

                    requestBody = { 
                        listName: wordCountShiritoriListNameSelect.value, 
                        wordCountPatterns: getWordCountPatterns(), 
                        requiredChars: requiredChars, 
                        allowPermutation: allowWordCountPermutationCheckbox.checked,
                        requiredCharMode: requiredCharMode 
                    };
                    apiPath = '/api/word_count_shiritori';
                    
                // --- 変更後：検索実行ロジック ---
    } else if (mode === 'wildcardShiritori') {
        const includeCharsText = wildcardShiritoriIncludeCharsInput.value.trim();
        const requiredChars = includeCharsText ? includeCharsText.split(',').map(c => c.trim()).filter(c => c.length > 0) : null;
        const requiredCharMode = wildcardRequiredCharExactlyCheckbox.checked ? 'exactly' : 'atLeast';

        // 全ての単語入力欄（最初、追加分、最後）を順番に配列に格納
        const patterns = [];
        // HTML側で「最初」のinputにも .word-pattern-input クラスをつけておくと一括取得できて便利です
        // ここでは個別に取得する例で記述します
        patterns.push(document.getElementById('firstWordPattern').value.trim());
        
        // 追加された中間単語を取得
        document.querySelectorAll('#wordPatternList .word-pattern-input').forEach(input => {
            if (input.value.trim()) patterns.push(input.value.trim());
        });

        // 最後の単語（入力がある場合のみ）
        const lastPat = document.getElementById('lastWordPattern').value.trim();
        if (lastPat) patterns.push(lastPat);

        requestBody = { 
            listName: wildcardShiritoriListNameSelect.value, 
            patterns: patterns, // 単一の pattern ではなく配列として送信
            wordCount: parseInt(wildcardShiritoriWordCountInput.value, 10),
            requiredChars: requiredChars, 
            requiredCharMode: requiredCharMode 
        };
        apiPath = '/api/wildcard_shiritori';
    

                } else if (mode === 'loop') {
                    apiPath = '/api/loop_shiritori';
                    requestBody = {
                        listName: loopListNameSelect.value,
                        pattern: loopPatternInput.value.trim()
                    };
                }

                // 💡 shiritoriモードでのみ wordCountTypeを渡す
                let currentWordCountType = mode === 'shiritori' ? wordCountTypeSelect.value : null;

                if (apiPath && requestBody) {
                    response = await fetch(apiPath, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(requestBody)
                    });
                    
                    const data = await response.json(); 
                    // 💡 displayResultsにwordCountTypeを渡す
                    displayResults(data, mode, currentWordCountType); 
                } else {
                    displayResults({ error: '無効な検索モードです。' }, mode, null);
                }

            } catch (error) {
                console.error("Fetch error:", error);
                resultsDiv.innerHTML = '<p class="error-message">サーバーとの通信中に予期せぬエラーが発生しました。</p>';
            }
        });
    });
});