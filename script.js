document.addEventListener('DOMContentLoaded', () => {
    // 获取所有需要的 DOM 元素
    const categoryButtonsContainer = document.getElementById('category-buttons');
    const tagContainer = document.getElementById('tag-container');
    const searchInput = document.getElementById('searchInput');
    const selectionBox = document.getElementById('selectionBox');
    const copyButton = document.getElementById('copyButton');
    const clearButton = document.getElementById('clearButton');

    let tagsData = [];
    let fuse;
    const selectedTags = new Set();

    function updateSelectionBox() {
        selectionBox.value = Array.from(selectedTags).join(', ');
    }

    fetch('tags.json')
        .then(response => response.json())
        .then(data => {
            tagsData = data.tags;
            const categories = ['全部', ...new Set(tagsData.map(tag => tag.category))];
            createCategoryButtons(categories);
            displayTags('全部');

            fuse = new Fuse(tagsData, {
                keys: ['name.cn', 'name.en'],
                includeScore: true,
                threshold: 0.4
            });
        });

    function createCategoryButtons(categories) {
        categories.forEach(category => {
            const button = document.createElement('button');
            button.className = 'category-button';
            button.textContent = category;
            if (category === '全部') {
                button.classList.add('active');
            }
            button.addEventListener('click', () => {
                document.querySelector('.category-button.active').classList.remove('active');
                button.classList.add('active');
                displayTags(category);
            });
            categoryButtonsContainer.appendChild(button);
        });
    }

    function displayTags(category, searchResults = null) {
        tagContainer.innerHTML = '';
        const tagsToShow = searchResults ? searchResults.map(result => result.item) :
                           (category === '全部' ? tagsData : tagsData.filter(tag => tag.category === category));

        tagsToShow.forEach(tag => {
            const tagCard = document.createElement('div');
            tagCard.className = 'tag-card';

            if (selectedTags.has(tag.name.en)) {
                tagCard.classList.add('selected');
            }

            const img = document.createElement('img');
            img.src = tag.image;
            img.alt = `${tag.name.cn} ${tag.name.en}`;

            const tagName = document.createElement('div');
            tagName.className = 'tag-name';
            
            const nameCn = document.createElement('span');
            nameCn.className = 'tag-name-cn';
            nameCn.textContent = tag.name.cn;

            const nameEn = document.createElement('span');
            nameEn.className = 'tag-name-en';
            nameEn.textContent = tag.name.en;

            tagName.appendChild(nameCn);
            tagName.appendChild(nameEn);

            tagCard.appendChild(img);
            tagCard.appendChild(tagName);

            tagCard.addEventListener('click', () => {
                tagCard.classList.toggle('selected');
                const enName = tag.name.en;

                if (selectedTags.has(enName)) {
                    selectedTags.delete(enName);
                } else {
                    selectedTags.add(enName);
                }
                updateSelectionBox();
            });

            tagContainer.appendChild(tagCard);
        });
    }

    searchInput.addEventListener('input', (e) => {
        const query = e.target.value.trim();
        if (query) {
            const results = fuse.search(query);
            displayTags('全部', results);
        } else {
            const activeCategory = document.querySelector('.category-button.active').textContent;
            displayTags(activeCategory);
        }
    });

    // === MODIFIED SECTION START ===
    // *** 移除了 alert 弹窗，并替换为更友好的按钮状态反馈 ***
    copyButton.addEventListener('click', () => {
        const textToCopy = selectionBox.value;
        if (!textToCopy) {
            // 如果没有内容，则不执行任何操作
            return;
        }

        const originalText = copyButton.textContent;
        copyButton.disabled = true; // 临时禁用按钮防止重复点击

        try {
            selectionBox.readOnly = false;
            selectionBox.select();
            const successful = document.execCommand('copy');
            selectionBox.readOnly = true;
            window.getSelection().removeAllRanges();

            if (successful) {
                copyButton.textContent = '已复制!';
                copyButton.style.backgroundColor = '#218838'; // 成功状态的深绿色
            } else {
                copyButton.textContent = '复制失败';
                copyButton.style.backgroundColor = '#c82333'; // 失败状态的红色
            }
        } catch (err) {
            copyButton.textContent = '复制失败';
            copyButton.style.backgroundColor = '#c82333';
        } finally {
            // 无论成功或失败，在1.5秒后都恢复按钮的原始状态
            setTimeout(() => {
                copyButton.textContent = originalText;
                copyButton.style.backgroundColor = ''; // 恢复 CSS 文件中定义的原始颜色
                copyButton.disabled = false; // 重新启用按钮
            }, 1500);
        }
    });
    // === MODIFIED SECTION END ===

    clearButton.addEventListener('click', () => {
        selectedTags.clear();
        updateSelectionBox();
        document.querySelectorAll('.tag-card.selected').forEach(card => {
            card.classList.remove('selected');
        });
    });
});
