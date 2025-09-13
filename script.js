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

    // === MODIFIED SECTION START: Robust Copy Function ===
    copyButton.addEventListener('click', () => {
        const textToCopy = selectionBox.value;
        if (!textToCopy) {
            alert('没有内容可以复制。');
            return;
        }

        // 优先使用现代、安全的 Clipboard API
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(textToCopy).then(() => {
                alert('已成功复制到剪贴板！');
            }).catch(err => {
                alert('复制失败，请检查浏览器权限。');
            });
        } else {
            // 备用方案：使用传统的 document.execCommand
            const textArea = document.createElement('textarea');
            textArea.value = textToCopy;
            // 样式使其在屏幕外，不可见
            textArea.style.position = 'fixed';
            textArea.style.top = '-9999px';
            textArea.style.left = '-9999px';
            
            document.body.appendChild(textArea);
            textArea.select();
            
            try {
                const successful = document.execCommand('copy');
                if (successful) {
                    alert('已成功复制到剪贴板！');
                } else {
                    alert('复制失败！');
                }
            } catch (err) {
                alert('复制失败，浏览器不支持此操作。');
            } finally {
                document.body.removeChild(textArea);
            }
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