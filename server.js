const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const db = require('./database');

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

// Создаём папку для загрузок
if (!fs.existsSync('public/uploads')) {
    fs.mkdirSync('public/uploads', { recursive: true });
}

app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

// Храним онлайн пользователей
const onlineUsers = new Map(); // socketId -> username

io.on('connection', (socket) => {
    console.log('Новый пользователь подключился', socket.id);

    // Регистрация пользователя
    socket.on('register', async (username) => {
        try {
            // Сохраняем в БД
            await db.saveUser(username);
            
            // Добавляем в онлайн
            onlineUsers.set(socket.id, username);
            socket.username = username;
            
            // Отправляем список всех пользователей (из БД)
            const allUsers = await db.getAllUsers();
            io.emit('users-list', {
                online: Array.from(onlineUsers.values()),
                all: allUsers
            });
            
            console.log(`✅ Пользователь ${username} вошёл в чат`);
        } catch (err) {
            console.error('Ошибка регистрации:', err);
        }
    });

    // Запрос истории диалога
    socket.on('get-history', async (otherUser) => {
        const currentUser = socket.username;
        if (!currentUser) return;
        
        try {
            const history = await db.getConversation(currentUser, otherUser);
            // Преобразуем формат для клиента
            const formattedHistory = history.map(msg => ({
                from: msg.from_user,
                to: msg.to_user,
                message: msg.message,
                imageUrl: msg.image_url,
                time: new Date(msg.timestamp).toLocaleTimeString(),
                timestamp: msg.timestamp
            }));
            socket.emit('load-history', formattedHistory);
        } catch (err) {
            console.error('Ошибка загрузки истории:', err);
        }
    });

    // Отправка сообщения
    socket.on('private-message', async ({ to, message, imageUrl }) => {
        const from = socket.username;
        if (!from) return;

        try {
            // Сохраняем в БД
            await db.saveMessage(from, to, message, imageUrl);
            
            const messageData = {
                from: from,
                to: to,
                message: message || '',
                imageUrl: imageUrl || null,
                time: new Date().toLocaleTimeString(),
                timestamp: Date.now()
            };

            // Отправляем получателю (если онлайн)
            let targetSocketId = null;
            for (const [id, username] of onlineUsers.entries()) {
                if (username === to) {
                    targetSocketId = id;
                    break;
                }
            }
            
            if (targetSocketId) {
                io.to(targetSocketId).emit('new-message', messageData);
            }
            
            // Отправляем отправителю
            socket.emit('new-message', messageData);
        } catch (err) {
            console.error('Ошибка отправки сообщения:', err);
        }
    });

    // Статус "печатает"
    socket.on('typing', ({ to, isTyping }) => {
        const from = socket.username;
        if (!from) return;
        
        let targetSocketId = null;
        for (const [id, username] of onlineUsers.entries()) {
            if (username === to) {
                targetSocketId = id;
                break;
            }
        }
        
        if (targetSocketId) {
            io.to(targetSocketId).emit('user-typing', { from, isTyping });
        }
    });
    
    // Отметить сообщения как прочитанные
    socket.on('mark-read', async ({ from }) => {
        const to = socket.username;
        if (!to) return;
        
        try {
            await db.markAsRead(from, to);
        } catch (err) {
            console.error('Ошибка отметки прочтения:', err);
        }
    });

    socket.on('disconnect', () => {
        if (socket.username) {
            console.log(`❌ Пользователь ${socket.username} вышел`);
            onlineUsers.delete(socket.id);
            
            // Отправляем обновлённый список
            io.emit('users-list', {
                online: Array.from(onlineUsers.values()),
                all: [] // не отправляем всех, только онлайн
            });
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
    console.log(`🚀 Сервер запущен на http://localhost:${PORT}`);
});
