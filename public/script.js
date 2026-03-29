let socket = io();
let currentUser = '';
let selectedUser = '';
let pendingImage = null;
let typingTimeout;

// Запрос разрешения на уведомления
function requestNotificationPermission() {
    if ('Notification' in window) {
        Notification.requestPermission();
    }
}

// Показывать уведомление, если чат не в фокусе
let isChatFocused = true;
window.onfocus = () => { isChatFocused = true; };
window.onblur = () => { isChatFocused = false; };

function showNotification(title, body) {
    if (!isChatFocused && Notification.permission === 'granted') {
        new Notification(title, { body: body, icon: 'https://via.placeholder.com/64' });
    }
}

function register() {
    currentUser = document.getElementById('username').value.trim();
    if (!currentUser) {
        alert('Введите имя');
        return;
    }
    if (currentUser.length > 20) {
        alert('Имя не должно превышать 20 символов');
        return;
    }
    
    socket.emit('register', currentUser);
    document.getElementById('login').style.display = 'none';
    document.getElementById('chat').style.display = 'flex';
    document.getElementById('current-user-name').innerText = currentUser;
    requestNotificationPermission();
}

socket.on('users-list', (users) => {
    const list = document.getElementById('users-list');
    list.innerHTML = '';
    document.getElementById('online-count').innerText = users.length;
    
    users.forEach(user => {
        if (user !== currentUser) {
            const li = document.createElement('li');
            li.textContent = user;
            li.onclick = () => selectUser(user);
            list.appendChild(li);
        }
    });
});

function selectUser(user) {
    selectedUser = user;
    document.getElementById('selected-user-info').innerText = user;
    document.getElementById('messages-list').innerHTML = '';
    document.getElementById('typing-status').innerHTML = '';
    socket.emit('get-history', user);
}

socket.on('load-history', (history) => {
    const messagesDiv = document.getElementById('messages-list');
    messagesDiv.innerHTML = '';
    history.forEach(msg => {
        displayMessage(msg);
    });
    scrollToBottom();
});

socket.on('new-message', (data) => {
    if ((data.from === selectedUser && data.to === currentUser) || 
        (data.from === currentUser && data.to === selectedUser)) {
        displayMessage(data);
        scrollToBottom();
    }
    
    if (data.from !== currentUser && data.from !== selectedUser) {
        showNotification(`Новое сообщение от ${data.from}`, 
                         data.message || '📷 Изображение');
    }
});

function displayMessage(msg) {
    const messagesDiv = document.getElementById('messages-list');
    const msgDiv = document.createElement('div');
    msgDiv.className = 'message';
    if (msg.from === currentUser) {
        msgDiv.classList.add('my-message');
    }
    
    let content = `<div class="username">${escapeHtml(msg.from)} <span class="time">${msg.time}</span></div>`;
    
    if (msg.message) {
        content += `<div>${escapeHtml(msg.message)}</div>`;
    }
    if (msg.imageUrl) {
        content += `<img src="${msg.imageUrl}" class="message-image" onclick="window.open(this.src)">`;
    }
    
    msgDiv.innerHTML = content;
    messagesDiv.appendChild(msgDiv);
}

function sendMessage() {
    if (!selectedUser) {
        alert('Сначала выберите пользователя');
        return;
    }
    
    const message = document.getElementById('message-input').value.trim();
    if (!message && !pendingImage) return;
    
    const data = { to: selectedUser, message: message };
    if (pendingImage) {
        data.imageUrl = pendingImage;
        pendingImage = null;
        document.getElementById('image-preview').style.display = 'none';
        document.getElementById('image-preview').innerHTML = '';
    }
    
    socket.emit('private-message', data);
    document.getElementById('message-input').value = '';
}

function uploadImage(input) {
    if (!input.files || !input.files[0]) return;
    const file = input.files[0];
    
    if (file.size > 5 * 1024 * 1024) {
        alert('Файл слишком большой. Максимум 5MB');
        return;
    }
    
    const formData = new FormData();
    formData.append('image', file);
    
    fetch('/upload', {
        method: 'POST',
        body: formData
    })
    .then(res => res.json())
    .then(data => {
        if (data.imageUrl) {
            pendingImage = data.imageUrl;
            const preview = document.getElementById('image-preview');
            preview.innerHTML = `<img src="${data.imageUrl}"><br><small>✅ Готово к отправке. Нажмите "Отправить"</small>`;
            preview.style.display = 'block';
        }
    })
    .catch(err => {
        console.error('Ошибка загрузки:', err);
        alert('Ошибка загрузки изображения');
    });
}

// Статус "печатает"
const messageInput = document.getElementById('message-input');
if (messageInput) {
    messageInput.addEventListener('input', () => {
        if (!selectedUser) return;
        
        socket.emit('typing', { to: selectedUser, isTyping: true });
        
        clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => {
            socket.emit('typing', { to: selectedUser, isTyping: false });
        }, 1000);
    });
}

socket.on('user-typing', ({ from, isTyping }) => {
    const typingDiv = document.getElementById('typing-status');
    if (from === selectedUser) {
        typingDiv.innerHTML = isTyping ? `<span>✍️ ${from} печатает...</span>` : '';
    }
});

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function scrollToBottom() {
    const messagesDiv = document.getElementById('messages');
    if (messagesDiv) {
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }
}

// Enter key handler
document.addEventListener('DOMContentLoaded', () => {
    const input = document.getElementById('username');
    if (input) {
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') register();
        });
    }
});