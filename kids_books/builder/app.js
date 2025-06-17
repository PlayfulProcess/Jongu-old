// Store for our pages
let pages = [];

// DOM Elements
const pagesContainer = document.getElementById('pagesContainer');
const previewImage = document.getElementById('previewImage');
const previewText = document.getElementById('previewText');
const savePageBtn = document.getElementById('savePageBtn');
const exportBtn = document.getElementById('exportBtn');

// --- Chat UI Logic ---
const chatMessages = document.getElementById('chatMessages');
const chatForm = document.getElementById('chatForm');
const chatInput = document.getElementById('chatInput');

let chatHistory = [];
let thinkingIndicator = null;

const imagePrompt = document.getElementById('imagePrompt');
const generateImageBtn = document.getElementById('generateImageBtn');

// Helper: Extract main story text (between quotes or after ---)
function extractMainStoryText(text) {
    // Try to find the first quoted block
    const quoteMatch = text.match(/"([^"]{20,})"/s);
    if (quoteMatch) return quoteMatch[1];
    // Or, try to find text after ---
    const dashMatch = text.split('---').pop().trim();
    if (dashMatch.length > 40) return dashMatch;
    // Fallback: return the whole text
    return text;
}

// Enhanced prompt engineering for DALL·E overlay
function buildDallePrompt(basePrompt, storyText) {
    return `${basePrompt}\n\nPlease create a beautiful, storybook-style illustration. Overlay the following text on the image in a clear, child-friendly font: \"${storyText}\". The text should be easy to read and integrated into the scene if possible.`;
}

// Stricter extraction for story and image prompt
function parseAssistantReply(text) {
    // Story Text:
    const storyMatch = text.match(/Story Text:\s*([\s\S]*?)\n\s*Image Prompt:/i);
    let story = storyMatch ? storyMatch[1].trim() : '';
    story = story.split('\n').filter(line => !/image|prompt|"/i.test(line)).join(' ').trim();
    // Image Prompt:
    let imagePrompt = '';
    const imageMatch = text.match(/Image Prompt:\s*([\s\S]*)/i);
    if (imageMatch) {
        // Remove only lines that mention overlay or instruction
        let filtered = imageMatch[1].split('\n').filter(line => !/overlay|instruction/i.test(line)).join(' ').trim();
        imagePrompt = filtered || imageMatch[1].trim();
    }
    return {
        story: story,
        imagePrompt: imagePrompt
    };
}

function addChatMessage(sender, text) {
    const msgDiv = document.createElement('div');
    msgDiv.style.margin = '8px 0';
    msgDiv.style.padding = '8px 12px';
    msgDiv.style.borderRadius = '8px';
    msgDiv.style.maxWidth = '80%';
    msgDiv.style.whiteSpace = 'pre-wrap';
    if (sender === 'user') {
        msgDiv.style.background = '#e0f7fa';
        msgDiv.style.alignSelf = 'flex-end';
        msgDiv.style.marginLeft = 'auto';
        msgDiv.textContent = text;
    } else {
        msgDiv.style.background = '#fffde7';
        msgDiv.style.alignSelf = 'flex-start';
        msgDiv.style.marginRight = 'auto';
        // Add text
        const textDiv = document.createElement('div');
        textDiv.textContent = text;
        msgDiv.appendChild(textDiv);
        // Add 'Generate Image' button
        const genBtn = document.createElement('button');
        genBtn.textContent = 'Generate Image';
        genBtn.className = 'btn btn-primary';
        genBtn.style.marginTop = '8px';
        genBtn.style.fontSize = '0.9em';
        genBtn.onclick = function() {
            const parsed = parseAssistantReply(text);
            // Guarantee separation: only fill story text with 'Story Text:' and image prompt with 'Image Prompt:'
            previewText.value = parsed.story;
            imagePrompt.value = parsed.imagePrompt;
        };
        msgDiv.appendChild(genBtn);
    }
    chatMessages.appendChild(msgDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function showThinkingIndicator() {
    thinkingIndicator = document.createElement('div');
    thinkingIndicator.style.margin = '8px 0';
    thinkingIndicator.style.padding = '8px 12px';
    thinkingIndicator.style.borderRadius = '8px';
    thinkingIndicator.style.maxWidth = '80%';
    thinkingIndicator.style.background = '#fffde7';
    thinkingIndicator.style.color = '#888';
    thinkingIndicator.style.fontStyle = 'italic';
    thinkingIndicator.textContent = 'Assistant is thinking...';
    chatMessages.appendChild(thinkingIndicator);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

function removeThinkingIndicator() {
    if (thinkingIndicator && thinkingIndicator.parentNode) {
        thinkingIndicator.parentNode.removeChild(thinkingIndicator);
        thinkingIndicator = null;
    }
}

// Helper: Try to extract an illustration description from assistant reply
function extractIllustrationPrompt(text) {
    // Simple heuristic: look for 'illustration description' and grab the next paragraph
    const match = text.match(/illustration description[^:]*:([\s\S]+)/i);
    if (match) {
        // Return the first paragraph or up to 400 chars
        return match[1].split('\n').filter(Boolean)[0].slice(0, 400);
    }
    return null;
}

async function generateImage(prompt) {
    // Prepend previous image prompts for consistency
    let context = '';
    if (pages.length > 0) {
        context = 'Previous images in this book featured: ' + pages.map(p => `- ${p.imagePrompt || ''}`).filter(Boolean).join(' ');
        context += '\nPlease keep the character(s) and style consistent.';
    }
    const fullPrompt = context ? `${context}\n${prompt}` : prompt;
    previewImage.style.display = 'block';
    previewImage.src = '';
    previewImage.alt = 'Loading...';
    previewImage.src = '';
    previewImage.alt = 'Generating image...';
    try {
        const response = await fetch('http://127.0.0.1:8000/generate-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt: fullPrompt })
        });
        if (!response.ok) throw new Error('Image generation failed');
        const data = await response.json();
        previewImage.src = data.image_url;
        previewImage.alt = 'Generated illustration';
    } catch (err) {
        previewImage.alt = 'Image generation failed';
        previewImage.style.display = 'none';
        alert('Image generation failed.');
    }
}

async function sendMessageToBackend(message) {
    chatHistory.push({ role: 'user', content: message });
    addChatMessage('user', message);
    chatInput.value = '';
    showThinkingIndicator();
    try {
        const response = await fetch('http://127.0.0.1:8000/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages: chatHistory })
        });
        if (!response.ok) throw new Error('Network response was not ok');
        const data = await response.json();
        removeThinkingIndicator();
        chatHistory.push({ role: 'assistant', content: data.reply });
        addChatMessage('assistant', data.reply);
        // No auto-preview here
    } catch (err) {
        removeThinkingIndicator();
        addChatMessage('assistant', '[Error: Could not reach assistant]');
    }
}

function showChatPlaceholder() {
    if (chatMessages.children.length === 0) {
        const placeholder = document.createElement('div');
        placeholder.style.margin = '16px 0';
        placeholder.style.padding = '16px 12px';
        placeholder.style.borderRadius = '8px';
        placeholder.style.background = '#f4f4f4';
        placeholder.style.color = '#888';
        placeholder.style.textAlign = 'center';
        placeholder.textContent = 'Start your story! Tell GPT-4.0 what kind of book you want to create, or describe your main character or idea.';
        chatMessages.appendChild(placeholder);
    }
}

// Show placeholder on load
showChatPlaceholder();

// Clear placeholder when first message is sent
function clearChatPlaceholder() {
    if (chatMessages.children.length > 0 && chatMessages.firstChild && chatMessages.firstChild.textContent.startsWith('Start your story!')) {
        chatMessages.removeChild(chatMessages.firstChild);
    }
}

if (chatForm && chatInput) {
    chatForm.addEventListener('submit', function(e) {
        e.preventDefault();
        const message = chatInput.value.trim();
        if (!message) return;
        clearChatPlaceholder();
        sendMessageToBackend(message);
    });
    chatInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            chatForm.requestSubmit();
        }
    });
}

// Initialize drag and drop
function initializeDragAndDrop() {
    const pageItems = document.querySelectorAll('.page-item');
    pageItems.forEach(item => {
        item.setAttribute('draggable', true);
        item.addEventListener('dragstart', handleDragStart);
        item.addEventListener('dragend', handleDragEnd);
    });

    pagesContainer.addEventListener('dragover', handleDragOver);
    pagesContainer.addEventListener('drop', handleDrop);
}

// Drag and Drop Handlers
function handleDragStart(e) {
    e.target.classList.add('dragging');
    e.dataTransfer.setData('text/plain', e.target.id);
}

function handleDragEnd(e) {
    e.target.classList.remove('dragging');
}

function handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
}

function handleDrop(e) {
    e.preventDefault();
    const draggedId = e.dataTransfer.getData('text/plain');
    const draggedElement = document.getElementById(draggedId);
    const dropTarget = e.target.closest('.page-item') || pagesContainer;

    if (dropTarget === pagesContainer) {
        pagesContainer.appendChild(draggedElement);
    } else {
        const rect = dropTarget.getBoundingClientRect();
        const midpoint = rect.top + rect.height / 2;
        
        if (e.clientY < midpoint) {
            dropTarget.parentNode.insertBefore(draggedElement, dropTarget);
        } else {
            dropTarget.parentNode.insertBefore(draggedElement, dropTarget.nextSibling);
        }
    }

    // Update pages array to match new order
    updatePagesOrder();
}

// Update pages array based on DOM order
function updatePagesOrder() {
    const pageElements = document.querySelectorAll('.page-item');
    pages = Array.from(pageElements).map(element => ({
        id: element.id,
        image: element.querySelector('img').src,
        text: element.querySelector('p').textContent
    }));
}

// Save a new page
function savePage() {
    const image = previewImage.src;
    let text = previewText.value; // Use only the story text
    if (!image || !text) {
        alert('Please add both an image and text before saving the page.');
        return;
    }
    // Remove quotation marks from start/end
    text = text.trim().replace(/^"|"$/g, '');
    const pageId = 'page-' + Date.now();
    const page = {
        id: pageId,
        image,
        text // Only story text
    };
    pages.push(page);
    addPageToDOM(page);
    clearPreview();
}

// Add a page to the DOM
function addPageToDOM(page) {
    const pageElement = document.createElement('div');
    pageElement.id = page.id;
    pageElement.className = 'page-item';
    pageElement.innerHTML = `
        <img src="${page.image}" alt="Page illustration">
        <p>${page.text}</p>
    `;
    pagesContainer.appendChild(pageElement);
    initializeDragAndDrop();
}

// Clear the preview area
function clearPreview() {
    previewImage.src = '';
    previewImage.style.display = 'none';
    previewText.value = '';
}

// Export the book to PDF
function exportToPDF() {
    if (pages.length === 0) {
        alert('Please add some pages to your book first!');
        return;
    }

    const bookContent = document.createElement('div');
    bookContent.style.padding = '20px';
    bookContent.style.maxWidth = '800px';
    bookContent.style.margin = '0 auto';

    pages.forEach((page, index) => {
        const pageDiv = document.createElement('div');
        pageDiv.style.pageBreakAfter = 'always';
        pageDiv.style.marginBottom = '40px';
        pageDiv.innerHTML = `
            <img src="${page.image}" style="max-width: 100%; height: auto; margin-bottom: 20px;">
            <p style="font-size: 18px; line-height: 1.6;">${page.text}</p>
        `;
        bookContent.appendChild(pageDiv);
    });

    const opt = {
        margin: 1,
        filename: 'my-storybook.pdf',
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2 },
        jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
    };

    html2pdf().set(opt).from(bookContent).save();
}

// Event Listeners
savePageBtn.addEventListener('click', savePage);
exportBtn.addEventListener('click', function() {
    // Create a new window for the export
    const win = window.open('', '_blank');
    if (!win) return alert('Popup blocked! Please allow popups for this site.');
    // Build HTML for the book
    let html = `<!DOCTYPE html><html><head><title>Your Book - Export</title>
    <style>
    body { font-family: 'Inter', sans-serif; background: #f8f8f8; color: #222; margin: 0; padding: 0; }
    .book-container { max-width: 900px; margin: 0 auto; padding: 30px 10px; }
    .print-btn { display: block; margin: 30px auto 40px auto; background: #1DB954; color: #fff; border: none; border-radius: 8px; padding: 1rem 2.5rem; font-size: 1.2rem; font-weight: 600; cursor: pointer; }
    .page { background: #fff; border-radius: 12px; box-shadow: 0 4px 16px rgba(0,0,0,0.08); margin-bottom: 40px; padding: 30px 20px; display: flex; flex-direction: column; align-items: center; }
    .page img { max-width: 100%; border-radius: 8px; margin-bottom: 18px; }
    .page-text { font-size: 1.25rem; line-height: 1.6; text-align: center; }
    @media (min-width: 700px) {
      .page { flex-direction: column; }
      .page img { max-width: 60%; }
      .page-text { max-width: 80%; margin: 0 auto; }
    }
    </style>
    </head><body><div class='book-container'>
    <button class='print-btn' onclick='window.print()'>Print to PDF</button>\n`;
    for (const page of pages) {
        html += `<div class='page'>`;
        if (page.image) html += `<img src='${page.image}' alt='Book page image'>`;
        html += `<div class='page-text'>${page.text}</div></div>`;
    }
    html += `</div></body></html>`;
    win.document.write(html);
    win.document.close();
});

// Initialize the app
initializeDragAndDrop();

generateImageBtn.addEventListener('click', async function() {
    // Only require image prompt
    const prompt = imagePrompt.value.trim();
    if (!prompt) {
        alert('Please enter an image prompt.');
        return;
    }
    await generateImage(prompt);
});

// --- Preview Action Buttons ---
const correctGrammarBtn = document.getElementById('correctGrammarBtn');
const changeStyleBtn = document.getElementById('changeStyleBtn');

correctGrammarBtn.addEventListener('click', async function() {
    const text = previewText.value.trim();
    if (!text) return;
    correctGrammarBtn.disabled = true;
    correctGrammarBtn.textContent = 'Correcting...';
    try {
        const response = await fetch('http://127.0.0.1:8000/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages: [
                { role: 'system', content: 'You are a helpful editor. Correct the grammar and spelling of the following text, but do not change its meaning or style.' },
                { role: 'user', content: text }
            ] })
        });
        const data = await response.json();
        previewText.value = data.reply;
    } catch (err) {
        alert('Could not correct grammar.');
    }
    correctGrammarBtn.disabled = false;
    correctGrammarBtn.textContent = 'Correct Grammar';
});

changeStyleBtn.addEventListener('click', async function() {
    const text = previewText.value.trim();
    if (!text) return;
    changeStyleBtn.disabled = true;
    changeStyleBtn.textContent = 'Changing...';
    try {
        const response = await fetch('http://127.0.0.1:8000/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ messages: [
                { role: 'system', content: 'You are a creative writing assistant. Rewrite the following story text in a different style (e.g., more poetic, more playful, or more descriptive), but keep the meaning.' },
                { role: 'user', content: text }
            ] })
        });
        const data = await response.json();
        previewText.value = data.reply;
    } catch (err) {
        alert('Could not change style.');
    }
    changeStyleBtn.disabled = false;
    changeStyleBtn.textContent = 'Change Style';
}); 