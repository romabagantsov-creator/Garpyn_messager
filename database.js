const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Создаём файл базы данных
const db = new sqlite3.Database(path.join(__dirname, 'messenger.db'));

// Создаём таблицы
db.serialize(() => {
    // Таблица пользователей
    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
    
    // Таблица сообщений
    db.run(`
        CREATE TABLE IF NOT EXISTS messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            from_user TEXT NOT NULL,
            to_user TEXT NOT NULL,
            message TEXT,
            image_url TEXT,
            timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
            is_read BOOLEAN DEFAULT 0
        )
    `);
    
    // Индексы для быстрого поиска
    db.run(`CREATE INDEX IF NOT EXISTS idx_messages_users ON messages(from_user, to_user)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp)`);
    
    console.log('✅ База данных SQLite готова');
});

// Функции для работы с БД
const dbHelpers = {
    // Сохранить сообщение
    saveMessage: (from, to, message, imageUrl) => {
        return new Promise((resolve, reject) => {
            db.run(
                `INSERT INTO messages (from_user, to_user, message, image_url) VALUES (?, ?, ?, ?)`,
                [from, to, message || null, imageUrl || null],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.lastID);
                }
            );
        });
    },
    
    // Получить историю диалога между двумя пользователями
    getConversation: (user1, user2, limit = 100) => {
        return new Promise((resolve, reject) => {
            db.all(
                `SELECT * FROM messages 
                 WHERE (from_user = ? AND to_user = ?) 
                    OR (from_user = ? AND to_user = ?)
                 ORDER BY timestamp ASC 
                 LIMIT ?`,
                [user1, user2, user2, user1, limit],
                (err, rows) => {
                    if (err) reject(err);
                    else resolve(rows);
                }
            );
        });
    },
    
    // Сохранить пользователя
    saveUser: (username) => {
        return new Promise((resolve, reject) => {
            db.run(
                `INSERT OR IGNORE INTO users (username) VALUES (?)`,
                [username],
                function(err) {
                    if (err) reject(err);
                    else resolve(this.lastID);
                }
            );
        });
    },
    
    // Получить всех пользователей
    getAllUsers: () => {
        return new Promise((resolve, reject) => {
            db.all(`SELECT username FROM users ORDER BY created_at DESC`, (err, rows) => {
                if (err) reject(err);
                else resolve(rows.map(row => row.username));
            });
        });
    },
    
    // Отметить сообщения как прочитанные
    markAsRead: (from, to) => {
        return new Promise((resolve, reject) => {
            db.run(
                `UPDATE messages SET is_read = 1 WHERE from_user = ? AND to_user = ? AND is_read = 0`,
                [from, to],
                (err) => {
                    if (err) reject(err);
                    else resolve();
                }
            );
        });
    }
};

module.exports = dbHelpers;
