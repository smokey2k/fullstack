import dotenv from 'dotenv';
dotenv.config();
import express from 'express';
import path from 'path';
import authRouter from './routes/authRoutes';

const app = express();

// Middleware to parse JSON bodies
app.use(express.json());

// Set the view engine to EJS if SSR is enabled
const useSSR = process.env.USE_SSR?.trim().toLowerCase() === 'true';
if (useSSR) {
    app.set('view engine', 'ejs');
    app.set('views', path.join(__dirname, 'views'));
}

// Define routes
app.use('/', authRouter);

export default app;
