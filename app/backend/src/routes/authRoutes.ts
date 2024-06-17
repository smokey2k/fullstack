import { Router, Request, Response, NextFunction } from 'express';
import AuthController from '../controllers/authController';

class AuthRoutes {
    public router: Router;
    private useSSR: boolean;

    constructor() {
        this.router = Router();
        this.useSSR = process.env.USE_SSR?.trim().toLowerCase() === 'true';
        this.initRoutes();
    }

    private SSR(routeHandler: (req: Request, res: Response) => void, ssrHandler: (req: Request, res: Response) => void) {
        return (req: Request, res: Response, next: NextFunction) => {
            if (this.useSSR) {
                ssrHandler(req, res);
            } else {
                routeHandler(req, res);
            }
        };
    }

    private initRoutes() {
        this.router.get('/', this.SSR(
            (req, res) => res.send('Welcome to the landing page!'),
            AuthController.renderLandingPage
        ));

        this.router.get('/login', this.SSR(
            (req, res) => res.send('This is the login page!'),
            AuthController.renderLoginPage
        ));

        this.router.get('/register', this.SSR(
            (req, res) => res.send('This is the registration page!'),
            AuthController.renderRegisterPage
        ));

        this.router.post('/login', AuthController.handleLogin);
        this.router.post('/register', AuthController.handleRegister);
    }
}

export default new AuthRoutes().router;
