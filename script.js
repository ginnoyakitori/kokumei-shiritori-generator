document.addEventListener('DOMContentLoaded', () => {
    const modeSelect = document.getElementById('modeSelect');
    const shiritoriModeDiv = document.getElementById('shiritoriMode');
    const wildcardModeDiv = document.getElementById('wildcardMode');
    const substringModeDiv = document.getElementById('substringMode');
    const wordCountShiritoriModeDiv = document.getElementById('wordCountShiritoriMode');

    const listNameSelect = document.getElementById('listName');
    const wildcardListNameSelect = document.getElementById('wildcardListName');
    const substringListNameSelect = document.getElementById('substringListName');
    const wordCountShiritoriListNameSelect = document.getElementById('wordCountShiritoriListName');

    const firstCharInput = document.getElementById('firstChar');
    const lastCharInput = document.getElementById('lastChar');
    const wordCountTypeSelect = document.getElementById('wordCountType');
    const wordCountInputContainer = document.getElementById('wordCountInputContainer');
    const wordCountInput = document.getElementById('wordCount');
    const wildcardTextInput = document.getElementById('wildcardText');
    const substringTextInput = document.getElementById('substringText');
    const includeCharsInput = document.getElementById('includeChars');

    const wordCountInputsContainer = document.getElementById('wordCountInputs');
    const addWordCountInputButton = document.getElementById('addWordCountInput');
    
    const searchButton = document.getElementById('searchButton');
    const resultsDiv = document.getElementById('results');

    // モード切り替え時のUI表示制御
    modeSelect.addEventListener('change', (event) => {
        shiritoriModeDiv.style.display = 'none';
        wildcardModeDiv.style.display = 'none';
        substringModeDiv.style.display = 'none';
        wordCountShiritoriModeDiv.style.display = 'none';
        
        const selectedMode = event.target.value;
        if (selectedMode === 'shiritori') {
            shiritoriModeDiv.style.display = 'block';
        } else if (selectedMode === 'wildcard') {
            wildcardModeDiv.style.display = 'block';
        } else if (selectedMode === 'substring') {
            substringModeDiv.style.display = 'block';
        } else if (selectedMode === 'wordCountShiritori') {
            wordCountShiritoriModeDiv.style.display = 'block';
        }
    });

    // 単語数入力欄の追加・削除
    addWordCountInputButton.addEventListener('click', () => {
        const newGroup = document.createElement('div');
        newGroup.className = 'word-count-input-group';
        newGroup.innerHTML = `
            <input type="number" class="word-count-input" value="2" min="1">
            <button class="remove-word-count-input">削除</button>
        `;
        wordCountInputsContainer.appendChild(newGroup);
    });

    wordCountInputsContainer.addEventListener('click', (event) => {
        if (event.target.classList.contains('remove-word-count-input')) {
            // 入力欄が1つしかない場合は削除しない
            if (wordCountInputsContainer.querySelectorAll('.word-count-input-group').length > 1) {
                event.target.closest('.word-count-input-group').remove();
            }
        }
    });

    // 単語数モードの切り替え（しりとりモード内）
    wordCountTypeSelect.addEventListener('change', (event) => {
        if (event.target.value === 'shortest') {
            wordCountInputContainer.style.display = 'none';
        } else {
            wordCountInputContainer.style.display = 'block';
        }
    });

    searchButton.addEventListener('click', async () => {
        resultsDiv.innerHTML = '検索中...';
        const mode = modeSelect.value;
        let response;
        
        if (mode === 'shiritori') {
            const listName = listNameSelect.value;
            const firstChar = firstCharInput.value.trim() === '' ? null : firstCharInput.value.trim();
            const lastChar = lastCharInput.value.trim() === '' ? null : lastCharInput.value.trim();
            const wordCountType = wordCountTypeSelect.value;
            const wordCount = wordCountType === 'fixed' ? parseInt(wordCountInput.value, 10) : 'shortest';
            const includeChars = includeCharsInput.value.trim();

            response = await fetch('/api/shiritori', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ listName, firstChar, lastChar, wordCount, includeChars })
            });
        } else if (mode === 'wildcard') {
            const listName = wildcardListNameSelect.value;
            const searchText = wildcardTextInput.value.trim();
            response = await fetch('/api/wildcard_search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ listName, searchText })
            });
        } else if (mode === 'substring') {
            const listName = substringListNameSelect.value;
            const searchText = substringTextInput.value.trim();
            response = await fetch('/api/substring_search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ listName, searchText })
            });
        } else { // wordCountShiritoriモード
            const listName = wordCountShiritoriListNameSelect.value;
            const wordCounts = Array.from(document.querySelectorAll('.word-count-input')).map(input => parseInt(input.value, 10));

            response = await fetch('/api/word_count_shiritori', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ listName, wordCounts })
            });
        }

        const data = await response.json();
        resultsDiv.innerHTML = '';

        if (response.status !== 200) {
            resultsDiv.textContent = `エラー: ${data.error}`;
            return;
        }

        if (data.results) {
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
        } else if (data.totalCount !== undefined) {
            const countMessage = document.createElement('p');
            countMessage.textContent = `総数: ${data.totalCount} 通り見つかりました。`;
            resultsDiv.appendChild(countMessage);

            if (data.charCounts) {
                const charCountsList = document.createElement('ul');
                for (const char in data.charCounts) {
                    const listItem = document.createElement('li');
                    listItem.textContent = `${char}: ${data.charCounts[char]}`;
                    charCountsList.appendChild(listItem);
                }
                resultsDiv.appendChild(charCountsList);
            }
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
            resultsDiv.textContent = '条件に合う単語は見つかりませんでした。';
        }
    });
});