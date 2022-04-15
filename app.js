const express = require('express');
const exphbs = require('express-handlebars');
const cookieParser = require('cookie-parser');
const bodyParser = require('body-parser');
const { runWorker, syncData } = require("./src/objects/worker");
const { initContext, getPublicData, getProtectedData } = require('./src/objects/context');

const crypto = require('crypto');
const app = express();
const authTokens = {};

const { siteUser, sitePassword } = require('./src/consts/creds');

const getHashedPassword = (password) => {
    const sha256 = crypto.createHash('sha256');
    const hash = sha256.update(password).digest('base64');
    return hash;
}

const generateAuthToken = () => {
    return crypto.randomBytes(30).toString('hex');
}

const main = async () => {
// to support URL-encoded bodies
    const context = await initContext();
    app.use(bodyParser.urlencoded({extended: true}));

    app.use(cookieParser());

    app.use((req, res, next) => {
        const authToken = req.cookies['AuthToken'];
        req.user = authTokens[authToken];
        next();
    });

    app.engine('hbs', exphbs({
        extname: '.hbs'
    }));

    app.set('view engine', 'hbs');

    app.get('/', (req, res) => {
        res.render('home');
    });

    app.get('/main', async (req, res) => {
        if (req.user) {
            res.render('main', { data: await context.iiko.testConnect() });
        } else {
            res.render('login', {
                message: 'Please login to continue',
                messageClass: 'alert-danger'
            });
        }
    });

    app.get('/settings', async (req, res) => {
        if (req.user) {
            res.render('settings', { data: context.iiko.getAuthData() });
        } else {
            res.render('login', {
                message: 'Please login to continue',
                messageClass: 'alert-danger'
            });
        }
    });

    app.post('/settings', async (req, res) => {
        const { server, user, password } = req.body;
        context.iiko.update(server, user, password);
        const syncResult = await syncData(context);
        if (syncResult) {
            res.render('main', {
                message: 'Соединение с сервером установлено',
                messageClass: 'alert-success'
            });
        } else {
            res.render('main', {
                message: 'Соединение с сервером не установлено!',
                messageClass: 'alert-danger'
            });
        }
    });

    app.get('/login', (req, res) => {
        res.render('login');
    });

    app.post('/login', (req, res) => {
        const {user, password} = req.body;
        const hashedPassword = getHashedPassword(password);

        if (user === siteUser && hashedPassword === sitePassword) {
            const authToken = generateAuthToken();

            authTokens[authToken] = user;

            res.cookie('AuthToken', authToken);
            res.redirect('/main');
            return;
        } else {
            res.render('login', {
                message: 'Invalid username or password',
                messageClass: 'alert-danger'
            });
        }
    });

    app.get('/protected', (req, res) => {
        if (req.user) {
            res.render('protected', {data: getProtectedData(context), categories: context.categories.getCategories()});
        } else {
            res.render('login', {
                message: 'Please login to continue',
                messageClass: 'alert-danger'
            });
        }
    });

    app.get('/report', (req, res) => {
        if (req.user) {
            const data = context.branches.getBranches();
            res.render('report', { data });
        } else {
            res.render('login', {
                message: 'Please login to continue',
                messageClass: 'alert-danger'
            });
        }
    });

    app.get('/sync', async (req, res) => {
        const syncResult = await syncData(context);
        if (syncResult) {
            res.render('main', {
                message: 'Синхронизация выполнена успешно',
                messageClass: 'alert-success'
            });
        } else {
            res.render('main', {
                message: 'Синхронизация не выполнена',
                messageClass: 'alert-danger'
            });
        }
    });

    app.post('/report', async (req, res) => {
        const { startDate, endDate, department } = req.body;
        if (startDate > endDate) {
            res.render('/report', {
                data: context.branches.getBranches(),
                message: 'Неправильно задан диапазон дат для отчета',
                messageClass: 'alert-danger'
            });
        } else {
            const data = await getPublicData(context, department, startDate, endDate);
            res.render('publicTable', { data });
        }
    });

    app.post('/protected', (req, res) => {
        context.targets.makeEmptyTargets(context.branches.getBranches());
        const keys = Object.keys(req.body);
        for (const key of keys.filter(el => el.startsWith('sel_'))) {
            const parts = key.split('_');
            const cat = req.body[key];
            const n = parseInt(parts[2]) - 1;
            const surname = req.body[`surname_${parts[1]}_${parts[2]}`];
            const target1 = parseInt(req.body[`target1_${parts[1]}_${parts[2]}`]);
            const target2 = parseInt(req.body[`target2_${parts[1]}_${parts[2]}`]);
            if (target1 && target2) {
                context.targets.setDishTarget(parts[1], n, cat, target1, target2, surname);
            }
        }
    });

    runWorker(context, app);
    app.listen(3000);
}

main();