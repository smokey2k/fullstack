import { Request, Response } from 'express';

class AuthController {
    public renderLandingPage(req: Request, res: Response) {
        res.render('landing', { title: 'Landing Page' });
    }

    public renderLoginPage(req: Request, res: Response) {
        res.render('login', { title: 'Login Page' });
    }

    public renderRegisterPage(req: Request, res: Response) {
        res.render('register', { title: 'Register Page' });
    }

    public handleLogin(req: Request, res: Response) {
        // Handle login logic
        res.send('Login successful');
    }

    public handleRegister(req: Request, res: Response) {
        // Handle registration logic
        res.send('Registration successful');
    }
}

export default new AuthController();
