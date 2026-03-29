const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Настройка загрузки изображений
const storage = multer.diskStorage({
    destination: 'public/uploads/',
    filename: (req, file, cb) => {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});
const upload = multer({ storage: storage });

// Создаём папку для загрузок, если её нет
if (!fs.existsSync('public/uploads')) {
    fs.mkdirSync('public/uploads', { recursive: true });
}

app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// Хранилище сообщений (в реальном проекте - база данных)
const messagesHistory = {};

// Функция для получения ключа диалога
function getDialogKey(user1, user2) {
    return [user1, user2].sort().join('-');
}

// Храним список пользователей
const users = {}; // { socketId: username }

io.on('connection', (socket) => {
    console.log('Новый пользователь подключился', socket.id);

    // Регистрация пользователя
    socket.on('register', (username) => {
        users[socket.id] = username;
        socket.username = username;
        
        io.emit('users-list', Object.values(users));
        console.log(`Пользователь ${username} вошёл в чат`);
    });

    // Запрос истории диалога
    socket.on('get-history', (otherUser) => {
        const currentUser = socket.username;
        if (!currentUser) return;
        
        const dialogKey = getDialogKey(currentUser, otherUser);
        const history = messagesHistory[dialogKey] || [];
        socket.emit('load-history', history);
    });

    // Отправка сообщения
    socket.on('private-message', ({ to, message, imageUrl }) => {
        const from = socket.username;
        if (!from) return;

        const messageData = {
            from: from,
            to: to,
            message: message || '',
            imageUrl: imageUrl || null,
            time: new Date().toLocaleTimeString(),
            timestamp: Date.now()
        };

        // Сохраняем в историю
        const dialogKey = getDialogKey(from, to);
        if (!messagesHistory[dialogKey]) {
            messagesHistory[dialogKey] = [];
        }
        messagesHistory[dialogKey].push(messageData);

        // Ограничиваем историю 1000 сообщениями на диалог
        if (messagesHistory[dialogKey].length > 1000) {
            messagesHistory[dialogKey].shift();
        }

        // Отправляем получателю
        const targetSocketId = Object.keys(users).find(id => users[id] === to);
        if (targetSocketId) {
            io.to(targetSocketId).emit('new-message', messageData);
        }
        
        // Отправляем отправителю
        socket.emit('new-message', messageData);
    });

    // Статус "печатает"
    socket.on('typing', ({ to, isTyping }) => {
        const from = socket.username;
        if (!from) return;
        
        const targetSocketId = Object.keys(users).find(id => users[id] === to);
        if (targetSocketId) {
            io.to(targetSocketId).emit('user-typing', { from, isTyping });
        }
    });

    socket.on('disconnect', () => {
        if (socket.username) {
            console.log(`Пользователь ${socket.username} вышел`);
            delete users[socket.id];
            io.emit('users-list', Object.values(users));
        }
    });
});

// Эндпоинт для загрузки изображений
app.post('/upload', upload.single('image'), (req, res) => {
    if (!req.file) {
        return res.status(400).json({ error: 'Нет файла' });
    }
    const imageUrl = `/uploads/${req.file.filename}`;
    res.json({ imageUrl: imageUrl });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Сервер запущен на http://localhost:${PORT}`);
});