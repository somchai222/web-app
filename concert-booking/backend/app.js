// ======================
// IMPORTS
// ======================
console.log("BACKEND FILE LOADED");
const express = require('express');
const session = require('express-session');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const expressLayouts = require('express-ejs-layouts');
const multer = require('multer');
const cors = require('cors');

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, 'uploads'); // 👈 บันทึกลงโฟลเดอร์ uploads ตรง ๆ
    },
    filename: function (req, file, cb) {
        cb(null, Date.now() + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });

const app = express();

app.use((req, res, next) => {
    console.log("➡️", req.method, req.url);
    next();
});

app.use(cors({
    origin: "http://localhost:5000",
    credentials: true
}));

app.use(express.json());



// ======================
// CONFIG
// ======================
app.set('view engine', 'ejs');

app.use(expressLayouts);
app.set('layout', 'admin/layout');

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use('/uploads', express.static('uploads'));

app.use(session({
    secret: 'secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        sameSite: "lax"
    }
}));

app.use((req, res, next) => {
    res.locals.session = req.session;
    next();
});

app.use((req, res, next) => {
    res.locals.pageTitle = "Admin Panel";
    next();
});

const dbPath = path.join(__dirname, 'concert_ticket.db');

// เชื่อมต่อฐานข้อมูล
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error(err.message);
    } else {
        console.log("Connected to database at:", dbPath);
    }
});

db.serialize(() => {

    // ตาราง concerts
    db.run(`
        CREATE TABLE IF NOT EXISTS concerts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            artist TEXT,
            description TEXT,
            image TEXT,
            start_date TEXT,
            end_date TEXT,
            location TEXT
        )
    `, (err) => {
        if (err) console.error("Concerts error:", err.message);
        else console.log("Concerts OK");
    });


    // ตาราง showtimes
    db.run(`
        CREATE TABLE IF NOT EXISTS showtimes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            concert_id INTEGER,
            show_date TEXT,
            show_time TEXT,
            total_seats INTEGER,
            price REAL
        )
    `, (err) => {
        if (err) console.error("Showtimes error:", err.message);
        else console.log("Showtimes OK");
    });


    // ตาราง seats
    db.run(`
        CREATE TABLE IF NOT EXISTS seats (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            showtime_id INTEGER,
            seat_number TEXT,
            status TEXT DEFAULT 'available'
        )
    `, (err) => {
        if (err) console.error("Seats error:", err.message);
        else console.log("Seats OK");
    });

    // ตาราง bookings
    db.run(`
        CREATE TABLE IF NOT EXISTS bookings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            showtime_id INTEGER,
            seat_id INTEGER,
            user_id INTEGER,
            booking_date TEXT DEFAULT CURRENT_TIMESTAMP, 
            amount REAL,
            payment_status TEXT DEFAULT 'pending'   
        )
    `, (err) => {
            if (err) console.error("bookings error:", err.message);
            else console.log("bookings OK");
    });

    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            password TEXT,
            role TEXT
        )
    `, (err) => {
            if (err) console.error("user error:", err.message);
            else console.log("user OK");
    });

    db.run(`
        INSERT OR IGNORE INTO users (username, password, role)
        VALUES ('admin', '1234', 'admin')
    `, (err) => {
            if (err) console.error("admin error:", err.message);
            else console.log("admin OK");
    });

});




// ======================
// MIDDLEWARE
// ======================
function isAdmin(req, res, next) {
    if (req.session.user && req.session.user.role === 'admin') {
        return next();
    }
    res.redirect('/login');
} // เช็คสิทธิ์แอดมิน

function requireLogin(req, res, next) {
    if (!req.session.user) {
        return res.status(401).json({ error: "Unauthorized" });
    }
    next();
}

function isLoggedIn(req, res, next) {
    if (!req.session.user) {
        return res.status(401).json({
            success: false,
            message: "กรุณาเข้าสู่ระบบ"
        });
    }
    next();
} //บังคับให้เข้าสู่ระบบก่อนจอง

function formatThaiDate(dateStr) {
    return new Date(dateStr).toLocaleDateString('th-TH', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });
} //เปลี่ยนเวลา

// ======================
// HOME
// ======================
// app.get('/api/test', (req, res) => {
//     res.json({ message: "Backend แยกพอร์ตพร้อมแล้ว 🚀" });
// });

app.get('/', (req, res) => {
    db.all("SELECT * FROM concerts", [], (err, concerts) => {
        res.render('user/home', {
            concerts,
            user: req.session.user,
            layout: false,
            pageTitle: "Home"
        });
    });
});


// ======================
// STATUS LOGIN
// ======================
app.get('/api/me', (req, res) => {
    if (req.session.user) {
        res.json({
            loggedIn: true,
            user: req.session.user
        });
    } else {
        res.json({ loggedIn: false });
    }
});

// ======================
// API LOGIN
// ======================

app.post('/api/login', (req, res) => {

    const { username, password } = req.body;

    db.get(
        "SELECT * FROM users WHERE username=? AND password=?",
        [username, password],
        (err, user) => {

            if (!user) {
                return res.json({ success: false });
            }

            req.session.user = {
                id: user.id,
                username: user.username,
                role: user.role
            };

            res.json({
                success: true,
                role: user.role
            });
        }
    );
});
// ======================
// API LOGOUT
// ======================

app.post('/api/logout', (req, res) => {
    req.session.destroy(() => {
        res.json({ success: true });
    });
});

// ======================
// STATUS REGISTER 
// ======================
app.get('/register', (req, res) => {
    res.render('register', { error: null, layout: false });
});

// ======================
// API REGISTER
// ======================

app.post('/api/register', (req, res) => {

    const { username, password } = req.body;

    if (!username || !password) {
        return res.json({
            success: false,
            message: "กรอกข้อมูลให้ครบ"
        });
    }

    db.run(
        "INSERT INTO users (username, password, role) VALUES (?, ?, ?)",
        [username, password, 'user'],
        function(err) {

            if (err) {
                return res.json({
                    success: false,
                    message: "Username already exists"
                });
            }

            res.json({ success: true });
        }
    );

});


// ======================
//USER HOME
// ======================

app.get('/api/concerts', (req, res) => {
    db.all("SELECT * FROM concerts", [], (err, rows) => {
        res.json(rows);
    });
});

// ======================
//SHOWTIME
// ======================

app.get('/api/concert/:id', (req, res) => {
    const concertId = req.params.id;

    const sql = `
        SELECT 
            showtimes.*,
            concerts.name AS concert_name,
            COUNT(CASE WHEN seats.status = 'available' THEN 1 END) AS available_seats
        FROM showtimes
        JOIN concerts ON showtimes.concert_id = concerts.id
        LEFT JOIN seats ON seats.showtime_id = showtimes.id
        WHERE showtimes.concert_id = ?
        GROUP BY showtimes.id
    `;

    db.all(sql, [concertId], (err, rows) => {
        res.json({
            concertName: rows.length > 0 ? rows[0].concert_name : null,
            showtimes: rows
        });
    });
});

app.get('/api/seats/:showtimeId', (req, res) => {

    const showtimeId = req.params.showtimeId;

    db.get(
        "SELECT price FROM showtimes WHERE id = ?",
        [showtimeId],
        (err, showtime) => {

            if (err || !showtime) {
                return res.json({ seats: [], price: 0 });
            }

            db.all(
                    "SELECT * FROM seats WHERE showtime_id = ? ORDER BY CAST(seat_number AS INTEGER)",
                    [showtimeId],
                    (err, seats) => {
                        res.json({
                            seats: seats,
                            price: showtime.price
                            });
                    }
            );
        }
    );

});

app.post('/api/booking/:showtimeId', isLoggedIn, (req, res) => {

    const showtimeId = req.params.showtimeId;
    const seatIds = req.body.seat_ids;
    console.log("SESSION:", req.session);
    console.log("USER:", req.session.user);
    console.log("BODY:", req.body);
    console.log("Backend loaded");

    if (!seatIds) {
        return res.json({ success: false, message: "กรุณาเลือกที่นั่ง" });
    }

    const seatsArray = Array.isArray(seatIds) ? seatIds : [seatIds];

    db.get(
        "SELECT price FROM showtimes WHERE id = ?",
        [showtimeId],
        (err, showtime) => {

            if (err || !showtime) {
                return res.json({ success: false, message: "ไม่พบรอบการแสดง" });
            }

            const totalAmount = showtime.price * seatsArray.length;

            db.serialize(() => {

                db.run("BEGIN TRANSACTION");

                // 🔍 เช็คก่อนว่าทุกที่นั่งยังว่าง
                const placeholders = seatsArray.map(() => "?").join(",");
                
                db.all(
                    `SELECT id FROM seats 
                     WHERE id IN (${placeholders}) 
                     AND status='available'`,
                    seatsArray,
                    (err, availableSeats) => {

                        if (availableSeats.length !== seatsArray.length) {
                            db.run("ROLLBACK");
                            return res.json({ success: false, message: "มีบางที่นั่งถูกจองไปแล้ว" });
                        }

                        // ✅ update seats
                        db.run(
                            `UPDATE seats 
                             SET status='sold' 
                             WHERE id IN (${placeholders})`,
                            seatsArray
                        );

                        // ✅ insert bookings
                        seatsArray.forEach(seatId => {

                            db.run(
                                `INSERT INTO bookings 
                                 (showtime_id, seat_id, user_id, amount, payment_status)
                                 VALUES (?, ?, ?, ?, 'paid')`,
                                [
                                    showtimeId,
                                    seatId,
                                    req.session.user.id,
                                    totalAmount
                                ]
                            );

                        });

                        db.run("COMMIT");
                        res.json({ success: true });
                    }
                );

            });
        }
    );
});


app.get('/booking-success', (req, res) => {
    res.render('booking-success');
});

app.get('/api/my-bookings', isLoggedIn, (req, res) => {

    const userId = req.session.user.id;

    db.all(
        `
        SELECT 
            b.id,
            b.amount,
            b.payment_status,
            b.booking_date,
            s.seat_number,
            st.show_date,
            st.show_time,
            c.name AS concert_name
        FROM bookings b
        JOIN seats s ON b.seat_id = s.id
        JOIN showtimes st ON b.showtime_id = st.id
        JOIN concerts c ON st.concert_id = c.id
        WHERE b.user_id = ?
        ORDER BY b.booking_date DESC
        `,
        [userId],
        (err, rows) => {
            if (err) {
                console.error("DB ERROR:", err);
                return res.json({ success: false });
            }
            res.json({ success: true, bookings: rows });
        }
    );
});



// ======================
// ADMIN ROOT
// ======================
app.get('/admin', isAdmin, (req, res) => {
    res.redirect('/admin/dashboard');
});


// ======================
// ADMIN DASHBOARD
// ======================
app.get('/admin/dashboard', isAdmin, async (req, res) => {

    const getOne = (sql) =>
        new Promise((resolve, reject) => {
            db.get(sql, (err, row) => {
                if (err) reject(err);
                else resolve(row);
            });
        });

    const getAll = (sql) =>
        new Promise((resolve, reject) => {
            db.all(sql, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

    try {

        // =========================
        // 💰 รายได้รวม (จาก paid จริง)
        // =========================
        const totalRevenueRow = await getOne(`
            SELECT COALESCE(SUM(amount),0) AS total
            FROM bookings
            WHERE payment_status = 'paid'
        `);

        const totalRevenue = totalRevenueRow.total;


        // =========================
        // 🎟 จำนวนตั๋วที่ถูกจอง
        // =========================
        const totalTicketsRow = await getOne(`
            SELECT COUNT(*) AS total
            FROM bookings
            WHERE payment_status = 'paid'
        `);

        const totalTickets = totalTicketsRow.total;


        // =========================
        // 🎤 จำนวนคอนเสิร์ตทั้งหมด
        // =========================
        const totalConcertsRow = await getOne(`
            SELECT COUNT(*) AS total
            FROM concerts
        `);

        const totalConcerts = totalConcertsRow.total;


        // =========================
        // 📈 รายได้รายเดือน
        // =========================
        const monthlySales = await getAll(`
            SELECT 
                strftime('%Y-%m', substr(booking_date, 1, 10)) AS month,
                SUM(amount) AS total
            FROM bookings
            WHERE payment_status = 'paid'
            GROUP BY month
            ORDER BY month ASC;
        `);


        // =========================
        // 🔥 5 คอนเสิร์ตยอดจองสูงสุด
        // =========================
        const topConcerts = await getAll(`
            SELECT 
                c.name,
                COUNT(b.id) AS totalTickets
            FROM bookings b
            JOIN showtimes s ON b.showtime_id = s.id
            JOIN concerts c ON s.concert_id = c.id
            WHERE b.payment_status = 'paid'
            GROUP BY c.id
            ORDER BY totalTickets DESC
            LIMIT 5
        `);


        // =========================
        // 🏆 คอนเสิร์ตยอดจองสูงสุด
        // =========================
        const bestConcert = await getOne(`
            SELECT 
                c.name,
                COUNT(b.id) AS totalTickets
            FROM bookings b
            JOIN showtimes s ON b.showtime_id = s.id
            JOIN concerts c ON s.concert_id = c.id
            WHERE b.payment_status = 'paid'
            GROUP BY c.id
            ORDER BY totalTickets DESC
            LIMIT 1
        `);

        const worstConcert = await getOne(`
            SELECT 
                c.name,
                COUNT(b.id) AS totalTickets
            FROM concerts c
            LEFT JOIN showtimes s ON c.id = s.concert_id
            LEFT JOIN bookings b 
                ON s.id = b.showtime_id 
                AND b.payment_status = 'paid'
            GROUP BY c.id
            ORDER BY totalTickets ASC
            LIMIT 1
        `);


        res.render("admin/dashboard", {
            layout: "admin/layout",
            pageTitle: "Dashboard",
            cssFile: "dashboard.css",

            totalRevenue,
            totalTickets,
            totalConcerts,

            monthlySales: monthlySales || [],
            topConcerts: topConcerts || [],
            worstConcert: worstConcert || null,
            bestConcert
        });

    } catch (error) {
        console.error(error);
        res.send(error.message);
    }

});

// ======================
// ADMIN CONCERT LIST
// ======================
app.get('/admin/concerts', isAdmin, (req, res) => {

    db.all(`
        SELECT 
            concerts.*,
            COUNT(showtimes.id) AS round_count
        FROM concerts
        LEFT JOIN showtimes 
            ON concerts.id = showtimes.concert_id
        GROUP BY concerts.id
    `, (err, concerts) => {

        if (err) {
            console.log(err);
            res.send("Database Error");
        } else {
            res.render("admin/concerts", { 
                concerts,
                pageTitle: "concert",
                layout: 'admin/layout',
                cssFile: 'concerts.css',
            });
        }

    });

});

// ======================
// ADD CONCERT
// ======================
app.get('/admin/concerts/add', isAdmin, (req, res) => {
    res.render('admin/add_concert', {
        pageTitle: "Add Concert",
        layout: 'admin/layout',
        cssFile: 'add-concert.css',
    });
});

app.post('/admin/concerts/add', isAdmin, upload.single('image'), (req, res) => {

    const { name, artist, location, description, start_date, end_date } = req.body;
    const rounds = req.body.rounds || [];

    const image = req.file ? req.file.filename : null;

    db.serialize(() => {

        db.run("BEGIN TRANSACTION");

        db.run(`
            INSERT INTO concerts 
            (name, artist, location, description, image, start_date, end_date)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        [name, artist, location, description, image, start_date, end_date],
        function(err) {

            if (err) {
                db.run("ROLLBACK");
                console.error(err);
                return res.send("Error creating concert");
            }

            const concertId = this.lastID;

            if (rounds.length === 0) {
                db.run("COMMIT");
                return res.redirect('/admin/concerts');
            }

            let completed = 0;

            rounds.forEach(round => {

                db.run(`
                    INSERT INTO showtimes
                    (concert_id, show_date, show_time, total_seats, price)
                    VALUES (?, ?, ?, ?, ?)
                `,
                [
                    concertId,
                    round.show_date,
                    round.show_time,
                    round.total_seats,
                    round.price
                ],
                function(err) {

                    if (err) {
                        db.run("ROLLBACK");
                        console.error(err);
                        return res.send("Error adding rounds");
                    }

                     const showtimeId = this.lastID;
                    // 🎯 สร้าง seats อัตโนมัติ
                    for (let i = 1; i <= round.total_seats; i++) {
                        db.run(
                            "INSERT INTO seats (showtime_id, seat_number, status) VALUES (?, ?, 'available')",
                            [showtimeId, i]
                        );
                    }

                    completed++;

                    if (completed === rounds.length) {
                        db.run("COMMIT");
                        res.redirect('/admin/concerts');
                    }

                });

            });

        });

    });

});


// ======================
// EDIT CONCERT PAGE
// ======================
app.get('/admin/concerts/edit/:id', isAdmin, (req, res) => {

    const id = req.params.id;

    db.get("SELECT * FROM concerts WHERE id = ?", [id], (err, concert) => {

        db.all("SELECT * FROM showtimes WHERE concert_id = ?", [id], (err, showtimes) => {

            res.render('admin/edit_concert', {
                concert,
                showtimes,
                pageTitle: "Edit Concert",
                layout: 'admin/layout',
                cssFile: 'edit-concert.css',
            });

        });

    });

});


// ======================
// UPDATE CONCERT
// ======================
app.post('/admin/concerts/update/:id',
    isAdmin,
    upload.single('image'),
    (req, res) => {

    const id = req.params.id;

    db.get("SELECT image FROM concerts WHERE id = ?", [id], (err, oldData) => {

        let imageName = oldData.image; // ใช้รูปเดิมก่อน

        if (req.file) {
            imageName = req.file.filename; // ถ้ามีไฟล์ใหม่ค่อยแทน
        }

        db.run(`
            UPDATE concerts
            SET name = ?, 
                artist = ?,
                location = ?,  
                description = ?, 
                start_date = ?, 
                end_date = ?, 
                image = ?
            WHERE id = ?
        `, [
            req.body.name,
            req.body.artist,
            req.body.location,
            req.body.description,
            req.body.start_date,
            req.body.end_date,
            imageName,
            id
        ], () => {
            res.redirect('/admin/concerts');
        });

    });

});


// ======================
// DELETE CONCERT
// ======================
app.post('/admin/concerts/delete/:id', isAdmin, (req, res) => {
    const concertId = row.concert_id;
    const id = req.params.id;

    db.run("DELETE FROM concerts WHERE id = ?", [id], () => {
        res.redirect('/admin/concerts');
    });
});


// ======================
// ADD SHOWTIME
// ======================
app.post('/admin/showtimes/add', isAdmin, (req, res) => {

    const { concert_id, show_date, show_time, total_seats, price } = req.body;

    db.run(
        "INSERT INTO showtimes (concert_id, show_date, show_time, total_seats, price) VALUES (?, ?, ?, ?, ?)",
        [concert_id, show_date, show_time, total_seats, price],
        function () {

            const showtimeId = this.lastID;

            for (let i = 1; i <= total_seats; i++) {

                db.run(
                    "INSERT INTO seats (showtime_id, seat_number, status) VALUES (?, ?, 'available')",
                    [showtimeId, i]
                );

            }

            res.redirect('/admin/concerts/edit/' + concert_id);

        }
    );

});

// app.get('/admin/edit_concerts', isAdmin, (req, res) => {
//     res.render('admin/edit_concerts');
// });


// ======================
// UPDATE SHOWTIME
// ======================
app.post('/admin/showtimes/update/:id', isAdmin, (req, res) => {

    const id = req.params.id;
    const { show_date, show_time, total_seats, price } = req.body;

    db.serialize(() => {

        db.run("BEGIN TRANSACTION");

        db.get(
            "SELECT total_seats, concert_id FROM showtimes WHERE id=?",
            [id],
            (err, row) => {

                if (err || !row) {
                    db.run("ROLLBACK");
                    return res.send("Showtime not found");
                }

                const oldSeats = row.total_seats;
                const concertId = row.concert_id; // ⭐ ดึง concert_id
                const newSeats = parseInt(total_seats, 10);

                db.run(
                    "UPDATE showtimes SET show_date=?, show_time=?, total_seats=?, price=? WHERE id=?",
                    [show_date, show_time, newSeats, price, id]
                );

                // เพิ่มที่นั่ง
                if (newSeats > oldSeats) {

                    for (let i = oldSeats + 1; i <= newSeats; i++) {

                        db.run(
                            "INSERT INTO seats (showtime_id, seat_number, status) VALUES (?, ?, 'available')",
                            [id, i]
                        );

                    }

                }

                // ลดที่นั่ง
                if (newSeats < oldSeats) {

                    db.run(
                        `DELETE FROM seats 
                         WHERE showtime_id=? 
                         AND seat_number > ?
                         AND status='available'`,
                        [id, newSeats]
                    );

                }

                db.run("COMMIT");

                // ⭐ redirect กลับหน้า concert เดิม
                res.redirect('/admin/concerts/edit/' + concertId);

            }
        );

    });

});


// ======================
// DELETE SHOWTIME
// ======================
app.post('/admin/showtimes/delete/:id', isAdmin, (req, res) => {

    const id = req.params.id;

    db.run("DELETE FROM showtimes WHERE id=?", [id], function () {
        res.redirect('/admin/concerts');
    });
});


app.get('/admin/analytics', isAdmin, async (req, res) => {

    const getAll = (sql) =>
        new Promise((resolve, reject) => {
            db.all(sql, (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });

    try {

        // 🔹 Top 5 Concerts
        const topConcerts = await getAll(`
            SELECT concerts.name,
                   SUM(bookings.amount) as total
            FROM bookings
            JOIN showtimes ON bookings.showtime_id = showtimes.id
            JOIN concerts ON showtimes.concert_id = concerts.id
            WHERE bookings.payment_status = 'paid'
            GROUP BY concerts.id
            ORDER BY total DESC
            LIMIT 5
        `);

        // 🔹 Occupancy Rate
        const occupancy = await getAll(`
            SELECT concerts.name,
                   COUNT(bookings.id) as sold,
                   SUM(showtimes.total_seats) as capacity,
                   ROUND(
                     (COUNT(bookings.id) * 100.0) /
                     SUM(showtimes.total_seats),
                   2) as occupancy_rate
            FROM concerts
            JOIN showtimes ON concerts.id = showtimes.concert_id
            LEFT JOIN bookings ON bookings.showtime_id = showtimes.id
                AND bookings.payment_status = 'paid'
            GROUP BY concerts.id
        `);

        // 🔹 Monthly Sales
        const monthlySales = await getAll(`
            SELECT strftime('%Y-%m', booking_date) as month,
                   SUM(amount) as total
            FROM bookings
            WHERE payment_status = 'paid'
            GROUP BY month
            ORDER BY month ASC
        `);

        // 🔹 Peak Booking Hour
        const peakHours = await getAll(`
            SELECT strftime('%H', booking_date) as hour,
                   COUNT(*) as total
            FROM bookings
            WHERE payment_status = 'paid'
            GROUP BY hour
            ORDER BY hour ASC
        `);

        res.render("admin/analytics", {
            pageTitle: "Analytics",
            layout: 'admin/layout',
            cssFile: 'analytics.css',
            topConcerts,
            occupancy,
            monthlySales,
            peakHours
        });

    } catch (error) {
        console.error(error);
        res.send(error.message);
    }

});

app.get('/admin/reports', isAdmin, (req, res) => {

    const { concert_id, showtime_id, start, end } = req.query;

    let where = [];
    let params = [];

    if (concert_id && concert_id !== "") {
        where.push("c.id = ?");
        params.push(concert_id);
    }

    if (showtime_id && showtime_id !== "") {
        if (concert_id && concert_id !== "") {
            where.push("s.id = ? AND s.concert_id = ?");
            params.push(showtime_id, concert_id);
        } else {
            where.push("s.id = ?");
            params.push(showtime_id);
        }
    }

    // ✅ เปลี่ยนมากรองจาก s.show_date (วันที่แสดง) แทน b.booking_date 
    if (start && end) {
        where.push("s.show_date >= ? AND s.show_date <= ?");
        params.push(start, end);
    }

    const whereClause = where.length ? "WHERE " + where.join(" AND ") : "";

    // ================= SUMMARY =================
    const summarySql = `
        SELECT 
            COUNT(b.id) AS totalTickets,
            COALESCE(SUM(b.amount), 0) AS totalRevenue
        FROM bookings b
        JOIN showtimes s ON b.showtime_id = s.id
        JOIN concerts c ON s.concert_id = c.id
        ${whereClause}
    `;

    // ================= DETAIL =================
    const detailSql = `
        SELECT 
            b.*,
            u.username,
            c.name AS concert_name,
            s.show_date,
            s.show_time,
            st.seat_number
        FROM bookings b
        JOIN users u ON b.user_id = u.id
        JOIN showtimes s ON b.showtime_id = s.id
        JOIN concerts c ON s.concert_id = c.id
        JOIN seats st ON b.seat_id = st.id
        ${whereClause}
        ORDER BY b.booking_date DESC
    `;

    // ================= TOTAL SEATS =================
    // นับที่นั่งทั้งหมดตาม concert / showtime ที่เลือก
    const seatSql = `
        SELECT COUNT(st.id) AS totalSeats
        FROM seats st
        JOIN showtimes s ON st.showtime_id = s.id
        JOIN concerts c ON s.concert_id = c.id
        ${whereClause} 
    `; 
    // ✅ เอา .replace() ออกไปแล้ว ใช้ ${whereClause} ตรงๆ ได้เลย!

    db.get(summarySql, params, (err, summary) => {

        if (err) return res.send("Summary error");

        db.all(detailSql, params, (err, bookings) => {

            if (err) return res.send("Detail error");

            db.get(seatSql, params, (err, seatData) => {

                if (err) return res.send("Seat summary error");

                const totalSeats = seatData?.totalSeats || 0;
                const soldTickets = summary?.totalTickets || 0;
                const remainingTickets = totalSeats - soldTickets;

                db.all("SELECT * FROM concerts ORDER BY name", [], (err, concerts) => {

                    if (err) return res.send("Concert load error");

                    const showtimeSql = concert_id && concert_id !== ""
                        ? `SELECT * FROM showtimes 
                           WHERE concert_id = ? 
                           ORDER BY show_date, show_time`
                        : `SELECT * FROM showtimes 
                           ORDER BY show_date, show_time`;

                    const showtimeParams = concert_id && concert_id !== ""
                        ? [concert_id]
                        : [];

                    db.all(showtimeSql, showtimeParams, (err, showtimes) => {

                        if (err) return res.send("Showtime load error");

                        res.render("admin/reports", {
                            layout: "admin/layout",
                            cssFile: 'reports.css',
                            formatThaiDate,
                            concerts,
                            showtimes,
                            bookings,
                            totalTickets: soldTickets,
                            totalRevenue: summary?.totalRevenue || 0,
                            totalSeats,
                            remainingTickets,
                            selectedConcert: concert_id || "",
                            selectedShowtime: showtime_id || "",
                            start: start || "",
                            end: end || ""
                        });
                    });
                });
            });
        });
    });
});

// ======================
// USER API (สำหรับ Frontend พอร์ต 3001)
// ======================

// ดึงคอนเสิร์ตทั้งหมด
app.get('/api/concerts', (req, res) => {

    db.all(`
        SELECT concerts.*, 
               MIN(showtimes.price) AS min_price
        FROM concerts
        LEFT JOIN showtimes 
               ON concerts.id = showtimes.concert_id
        GROUP BY concerts.id
    `, [], (err, rows) => {

        if (err) return res.status(500).json(err);

        res.json(rows);
    });

});

// ดึง showtimes ของคอนเสิร์ต
app.get('/api/concert/:id', (req, res) => {

    const concertId = req.params.id;

    const sql = `
        SELECT 
            showtimes.*,
            concerts.name AS concert_name,
            COUNT(CASE WHEN seats.status = 'available' THEN 1 END) AS available_seats
        FROM showtimes
        JOIN concerts ON showtimes.concert_id = concerts.id
        LEFT JOIN seats ON seats.showtime_id = showtimes.id
        WHERE showtimes.concert_id = ?
        GROUP BY showtimes.id
    `;

    db.all(sql, [concertId], (err, rows) => {

        if (err) return res.status(500).json(err);

        res.json(rows);
    });

});

// ======================
// 404
// ======================
app.use((req, res) => {
    res.status(404).send("Not Found");
});


// ======================
// START SERVER
// ======================
app.listen(3000, () => {
    console.log("Server running on http://localhost:3000");
});