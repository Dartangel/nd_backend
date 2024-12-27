const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs'); // Для хеширования пароля
const jwt = require('jsonwebtoken'); // Для создания JWT токенов
const cors = require('cors');
const multer = require('multer'); // Импорт multer
const fs = require('fs'); // Импорт fs для работы с файловой системой
const path = require('path'); // Импорт path для работы с путями

const app = express();
const secretKey = 'yourSecretKey'; // Секретный ключ для JWT

// Подключение к MongoDB
mongoose.connect('mongodb://127.0.0.1:27017/studentdb', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
    .then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('Could not connect to MongoDB', err));

// Модель пользователя
const userSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true }
});

const User = mongoose.model('User', userSchema);

// Модель студента
const studentSchema = new mongoose.Schema({
    name: { type: String, required: true },
    surname: { type: String, required: true },
    parentName: { type: String, required: true },
    study: { type: String, required: true },
    mobile: { type: String, required: true },
    parentMobile: { type: String, required: true },
    prof: { type: String, required: true },
    year: { type: Number, required: true },
    serviceCost: { type: Number, required: true, default: 0 },
    servicePayed: { type: Number, required: true, default: 0 },
    passport: { type: String, require: false },
    isNastrfication: { type: Boolean, require: false },
    isNastrficationPayed: { type: Boolean, require: false },
    isSessionOpen: { type: Boolean, require: false },
    diplom: { type: String, require: false },
    image: { type: String, require: false },
    annualCost: { type: Number, required: true, default: 0 },
    annualPayed: { type: Number, default: 0 }  // Добавляем поле для остаточной задолженности
});

const Student = mongoose.model('Student', studentSchema);

// Middleware для парсинга JSON
app.use(express.json());

// Разрешить все запросы CORS
const corsOptions = {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type', 'Authorization'],
};

app.use(cors(corsOptions));

// Подключение статической папки для доступа к загруженным файлам
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Проверка и создание директории uploads
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
    console.log('Uploads directory created');
}

// Настройка multer для загрузки нескольких файлов
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname); // Уникальные имена файлов
    }
});

const upload = multer({ storage: storage }).fields([
    { name: 'passport', maxCount: 1 },
    { name: 'diplom', maxCount: 1 },
    { name: 'image', maxCount: 1 }
]);

// Аутентификация пользователя (POST-запрос)
app.post('/login', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).send({ message: 'Username and password are required' });
    }

    try {
        const user = await User.findOne({ username });

        if (!user) {
            return res.status(400).send({ message: 'Invalid username or password' });
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);

        if (!isPasswordValid) {
            return res.status(400).send({ message: 'Invalid username or password' });
        }

        const token = jwt.sign({ userId: user._id }, secretKey, { expiresIn: '1h' });

        res.status(200).send({ token });
    } catch (err) {
        console.error('Error during login:', err);
        res.status(500).send({ message: 'Internal Server Error' });
    }
});

// Middleware для проверки токена
const authenticate = (req, res, next) => {
    const authHeader = req.headers['authorization'];

    if (!authHeader) {
        return res.status(401).send({ message: 'Access denied. No token provided.' });
    }

    const token = authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).send({ message: 'Access denied. Invalid token format.' });
    }

    try {
        const decoded = jwt.verify(token, secretKey);
        req.user = decoded;
        next();
    } catch (err) {
        console.error('Invalid Token Error:', err);
        return res.status(400).send({ message: 'Invalid token.' });
    }
};

// Функция для обнуления оплаты каждого учебного года
const resetannualCostForNewYear = async () => {
    const currentYear = new Date().getFullYear();
    const students = await Student.find({ year: currentYear });

    students.forEach(async (student) => {
        student.servicePayed = 0;  // Обнуляем оплаченные суммы
        student.annualPayed = 0;  // Оставшийся долг = годовая сумма
        student.isSessionOpen = true;  // Оставшийся долг = годовая сумма
        await student.save();
    });
};

// Запуск процесса обнуления оплат в сентябре
setInterval(() => {
    const currentMonth = new Date().getMonth();
    if (currentMonth === 8) {  // 8 - сентябрь (считаем с 0)
        resetannualCostForNewYear();
    }
}, 24 * 60 * 60 * 1000);  // Проверка каждый день

app.put('/students/:id', authenticate, upload, async (req, res) => {
    const { id } = req.params;
    const { name, surname, parentName, study, prof, serviceCost, servicePayed, annualPayed, annualCost, year, mobile, parentMobile, isNastrfication, isNastrficationPayed, isSessionOpen } = req.body;
    const updates = {
        name,
        surname,
        parentName,
        study,
        mobile,
        parentMobile,
        prof,
        year,
        isSessionOpen,
        isNastrficationPayed,
        isNastrfication,
        serviceCost: Number(serviceCost) || 0,
        servicePayed: Number(servicePayed) || 0,
        annualCost: Number(annualCost) || 0,
        annualPayed: Number(annualPayed) || 0,
    };

    if (req.files['passport']) {
        updates.passport = req.files['passport'][0].path;
    }
    if (req.files['diplom']) {
        updates.diplom = req.files['diplom'][0].path;
    }
    if (req.files['image']) {
        updates.image = req.files['image'][0].path;
    }

    try {
        const updatedStudent = await Student.findByIdAndUpdate(id, updates, { new: true });

        if (!updatedStudent) {
            return res.status(404).send({ message: 'Student not found' });
        }

        res.status(200).send({ message: 'Student updated successfully', student: updatedStudent });
    } catch (err) {
        console.error('Error updating student:', err);
        res.status(500).send({ message: 'Internal Server Error' });
    }
});
// Маршрут для добавления студента
app.post('/students', authenticate, upload, async (req, res) => {
    const { name, surname, parentName, study, prof, serviceCost, servicePayed, mobile, parentMobile, year, annualCost, annualPayed, isSessionOpen, isNastrfication, isNastrficationPayed } = req.body;

    const passportFile = req.files['passport'] ? `uploads/${req.files['passport'][0].filename}` : null;
    const diplomFile = req.files['diplom'] ? `uploads/${req.files['diplom'][0].filename}` : null;
    const imageFile = req.files['image'] ? `uploads/${req.files['image'][0].filename}` : null;

    if (!name || !surname || !parentName || !study || !prof || serviceCost === undefined || servicePayed === undefined || annualCost === undefined) {
        return res.status(400).send({ message: 'All required fields must be provided' });
    }
  
    try {
        const newStudent = new Student({
            name,
            surname,
            parentName,
            study,
            year,
            prof,
            mobile,
            isSessionOpen,
            isNastrficationPayed,
            isNastrfication,
            parentMobile,
            serviceCost: Number(serviceCost) || 0,
            servicePayed: Number(servicePayed) || 0,
            annualCost: Number(annualCost) || 0,
            annualPayed: Number(annualPayed),
            passport: passportFile,
            diplom: diplomFile,
            image: imageFile
        });

        await newStudent.save();
        res.status(201).send({ message: 'Student added successfully', student: newStudent });
    } catch (err) {
        res.status(500).send({ message: 'Internal Server Error' });
    }
});

// Маршрут для получения списка студентов
app.get('/students', authenticate, async (req, res) => {
    try {
        const students = await Student.find();

        const responseStudents = students.map(student => {
            return {
                ...student.toObject(),
            };
        });

        res.status(200).json(responseStudents);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Маршрут для получения студентов по году
app.get('/students/year/:year', authenticate, async (req, res) => {
    const { year } = req.params;

    try {
        const students = await Student.find({ year: year });

        if (students.length === 0) {
            return res.status(404).send({ message: 'No students found for the selected year' });
        }

        const responseStudents = students.map(student => {
            return {
                ...student.toObject(),
            };
        });

        res.status(200).json(responseStudents);
    } catch (error) {
        console.error('Error fetching students by year:', error);
        res.status(500).json({ message: 'Server error' });
    }
});

// Маршрут для получения информации о конкретном студенте
app.get('/students/:id', authenticate, async (req, res) => {
    const { id } = req.params;

    try {
        const student = await Student.findById(id);

        if (!student) {
            return res.status(404).send({ message: 'Student not found' });
        }

        res.status(200).json({
            ...student.toObject(),
        });
    } catch (error) {
        res.status(500).send({ message: 'Internal Server Error' });
    }
});

// Запуск сервера
app.listen(3000, () => {
    console.log('Server is running on http://localhost:3000');
});
