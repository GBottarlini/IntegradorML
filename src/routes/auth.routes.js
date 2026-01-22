// src/routes/auth.routes.js
import { Router } from "express";
import {
  initiateTnAuth,
  handleTnAuthCallback,
  login,
} from "../controllers/auth.controller.js";

const authRouter = Router();

authRouter.get("/tiendanube/iniciar", initiateTnAuth);
authRouter.get("/tiendanube/callback", handleTnAuthCallback);

// Alias for the user's configured callback
authRouter.get("/tn/callback", handleTnAuthCallback);

// Login para panel
authRouter.post("/login", login);


export { authRouter };
